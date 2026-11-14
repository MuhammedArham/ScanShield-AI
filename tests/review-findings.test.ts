import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';
import type { Assessment, Segment } from '../src/schema.js';

const event = (text: string, sequence = 1) => ({ callId: 'review', sequence,
  segment: { id: `s${sequence}`, speaker: 'track-a', startedAtMs: sequence * 1000, endedAtMs: sequence * 1000 + 800, text, final: true } });
const benign: Assessment = { severity: 'none', rawModelScore: 0.1, categories: [], evidenceSegmentIds: [], explanation: 'No supported warning.', recommendedAction: 'Stay careful.', insufficientEvidence: true };

test('coalesced assessment includes every accepted final even after rolling context trims', async () => {
  let release!: (value: Assessment) => void;
  const captured: Segment[][] = [];
  const detector = new Detector({ limits: { maxContextSegments: 2 }, provider: { source: 'mock', assess(segments) {
    captured.push([...segments]);
    return captured.length === 1 ? new Promise<Assessment>(resolve => { release = resolve; }) : Promise.resolve(benign);
  } } });
  detector.ingest(event('First greeting.'));
  await Promise.resolve(); await Promise.resolve();
  for (let i = 2; i <= 5; i++) detector.ingest(event('Ordinary conversation.', i));
  release(benign);
  const result = await detector.flush('review');
  expect(captured[1]?.map(s => s.id)).toEqual(['s2', 's3', 's4', 's5']);
  expect(result.processingHealth.input).toBe('healthy');
});

test('pending evidence capacity rejects visibly and a validated assessment releases capacity', async () => {
  let release!: (value: Assessment) => void;
  const detector = new Detector({ limits: { maxPendingSegments: 2 }, provider: { source: 'mock', assess() { return new Promise<Assessment>(resolve => { release = resolve; }); } } });
  detector.ingest(event('First greeting.'));
  await Promise.resolve(); await Promise.resolve();
  detector.ingest(event('Second greeting.', 2));
  expect(() => detector.ingest(event('Third greeting.', 3))).toThrow('capacity');
  expect(detector.snapshot('review')).toMatchObject({ processedThroughSequence: 2, processingHealth: { input: 'degraded' } });
  release(benign);
  // The queued assessment starts after the first assessment releases its evidence.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(() => detector.ingest(event('Third greeting.', 3))).not.toThrow();
  await detector.endCall('review');
});

test('failed assessment retains unassessed evidence for the next finalized turn', async () => {
  const captured: Segment[][] = [];
  const detector = new Detector({ limits: { maxContextSegments: 1 }, provider: { source: 'mock', async assess(segments) {
    captured.push([...segments]);
    if (captured.length === 1) throw new Error('Offline');
    return benign;
  } } });
  detector.ingest(event('First greeting.'));
  expect((await detector.flush('review')).processingHealth.provider).toBe('degraded');
  detector.ingest(event('Second greeting.', 2));
  expect((await detector.flush('review')).processingHealth.provider).toBe('healthy');
  expect(captured[1]?.map(s => s.id)).toEqual(['s1', 's2']);
});

test('credential continuation retains its object across a conjunction', async () => {
  const detector = new Detector();
  expect(detector.ingest(event('Read the one time code and send it to me.')).categories).toEqual(['credential_theft']);
  await detector.endCall('review');
});

test('a model escalation owns advice and source while later lower rule warnings only add evidence', async () => {
  const detector = new Detector({ provider: { source: 'cerebras', async assess(segments) {
    return { severity: 'critical', rawModelScore: 0.9, categories: ['remote_access'], evidenceSegmentIds: [segments[0]!.id], explanation: 'Escalated model evidence.', recommendedAction: 'Stop the remote session.', insufficientEvidence: false };
  } } });
  const first = detector.ingest(event('Install AnyDesk now.'));
  const assessed = await detector.flush('review');
  const later = detector.ingest(event('Install AnyDesk now.', 2));
  expect(later.warnings).toMatchObject([{ id: first.warnings[0]!.id, severity: 'critical', source: 'cerebras', recommendedAction: 'Stop the remote session.' }]);
  expect(assessed.warnings[0]?.source).toBe('cerebras');
  expect(later.warnings).toHaveLength(1);
  expect(later.warnings[0]?.evidence.map(s => s.id)).toEqual(['s1', 's2']);
  await detector.endCall('review');
});

test.each(['Never share your password and install AnyDesk now.', 'This is a training example and now install AnyDesk.'])('a benign preamble does not conceal a separate unsafe action: %s', async text => {
  const detector = new Detector();
  const result = detector.ingest(event(text));
  expect(result.categories).toEqual(['remote_access']);
  await detector.endCall('review');
});

test('one finalized request preserves every independently supported warning category', async () => {
  const detector = new Detector();
  const result = detector.ingest(event('Read me your OTP and install AnyDesk and transfer money now.'));
  expect(result.categories).toEqual(['credential_theft', 'remote_access', 'payment_redirection']);
  await detector.endCall('review');
});

test.each(['Your OTP is 123456 and install AnyDesk now.', 'My password is swordfish and install AnyDesk now.', 'My password is "blue elephant" and install AnyDesk now.'])('redaction preserves the unsafe action following a declared secret: %s', async text => {
  let sent = '';
  const detector = new Detector({ provider: { source: 'mock', async assess(segments) { sent = JSON.stringify(segments); return benign; } } });
  const result = detector.ingest(event(text));
  await detector.flush('review');
  expect(JSON.stringify([sent, result])).not.toMatch(/123456|swordfish|blue|elephant/);
  expect(result.categories).toContain('remote_access');
});
