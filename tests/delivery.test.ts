import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';
const event = (sequence = 1, text = 'Read me your OTP.', final = true, id = 's1', callId = 'a') => ({ callId, sequence, segment: { id, speaker: 'track', startedAtMs: 0, endedAtMs: 1, text, final } });
test('retries are idempotent, partials finalize once, and conflicting immutable segments degrade input', () => {
  const d = new Detector();
  d.ingest(event(1, 'Read me', false));
  const final = event(2);
  const snapshot = d.ingest(final);
  expect(d.ingest(final)).toEqual(snapshot);
  expect(() => d.ingest(event(3, 'Good morning.'))).toThrow();
  expect(d.snapshot('a')).toMatchObject({ severity: 'critical', processingHealth: { input: 'degraded' }, warnings: [{ evidence: [{ text: 'Read me your OTP.' }] }] });
});
test('gap remains degraded after provider recovery; late events reject without losing warnings', async () => {
  const d = new Detector();
  d.ingest(event(1));
  d.ingest(event(3, 'Good morning.', true, 's3'));
  expect(() => d.ingest(event(2, 'missing', true, 's2'))).toThrow('late_event');
  expect(await d.flush('a')).toMatchObject({ severity: 'critical', processingHealth: { input: 'degraded', provider: 'healthy' }, processedThroughSequence: 3 });
});
test('errors never include malformed transcript values and raw conflicts survive redaction collisions', () => {
  const d = new Detector();
  expect(() => d.ingest({ ...event(), privateSecret: 'do-not-log-this' })).toThrow('invalid_event');
  d.ingest(event(1, 'My password is swordfish.'));
  expect(() => d.ingest(event(2, 'My password is salmon.'))).toThrow('conflict');
  expect(d.snapshot('a').processingHealth.input).toBe('degraded');
});
test('active calls and canonical IDs refuse excess visibly; retained warning evidence outlives ordinary context', async () => {
  const d = new Detector({ limits: { maxCalls: 1, maxContextSegments: 1, maxSegments: 2 } });
  d.ingest(event());
  expect(() => d.ingest(event(1, 'hello', true, 's1', 'b'))).toThrow('capacity');
  d.ingest(event(2, 'hello', true, 's2'));
  expect(() => d.ingest(event(3, 'hello', true, 's3'))).toThrow('capacity');
  expect(d.snapshot('a')).toMatchObject({ evidence: [{ id: 's1' }], processingHealth: { input: 'degraded' } });
  await d.endCall('a');
  expect(d.ingest(event(1, 'hello', true, 's1', 'b')).callId).toBe('b');
});
test('concurrent calls and returned snapshots cannot contaminate each other', async () => {
  const d = new Detector();
  const snapshot = d.ingest(event());
  snapshot.warnings[0]!.evidence[0]!.text = 'mutated';
  snapshot.processingHealth.input = 'degraded';
  d.ingest(event(1, 'Service confirmed.', true, 's1', 'b'));
  expect((await d.flush('b')).warnings).toEqual([]);
  expect(d.snapshot('a')).toMatchObject({ processingHealth: { input: 'healthy' }, evidence: [{ text: 'Read me your OTP.' }] });
});
test('completion releases immediately and late provider responses cannot revive or modify a reused call ID', async () => {
  let resolve!: (value: unknown) => void;
  const d = new Detector({ provider: { source: 'mock', assess: () => new Promise(r => { resolve = r; }) } });
  d.ingest(event());
  await Promise.resolve();
  const final = await d.endCall('a');
  expect(final.severity).toBe('critical');
  expect(() => d.snapshot('a')).toThrow('Unknown call');
  d.ingest(event(1, 'hello', false));
  resolve({ severity: 'critical', rawModelScore: 1, categories: ['credential_theft'], evidenceSegmentIds: ['s1'], explanation: 'Late.', recommendedAction: 'Late.', insufficientEvidence: false });
  await Promise.resolve(); await Promise.resolve();
  expect(d.snapshot('a')).toMatchObject({ severity: 'none', rawModelScore: null });
});
test('bounded event retries and warning evidence refuse growth rather than silently losing canonical history', () => {
  const events = new Detector({ limits: { maxEvents: 1 } });
  const first = event(1, 'preview', false);
  events.ingest(first);
  expect(events.ingest(first).processedThroughSequence).toBe(1);
  expect(() => events.ingest(event(2, 'updated preview', false))).toThrow('capacity');
  const evidence = new Detector({ limits: { maxEvidenceSegments: 1 } });
  evidence.ingest(event());
  expect(() => evidence.ingest(event(2, 'Read me your OTP.', true, 's2'))).toThrow('capacity');
  expect(evidence.snapshot('a')).toMatchObject({ processedThroughSequence: 1, severity: 'critical', warnings: [{ evidence: [{ id: 's1' }] }], processingHealth: { input: 'degraded' } });
});
