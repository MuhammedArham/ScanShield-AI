import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';
import type { Assessment, Segment } from '../src/schema.js';

const benign: Assessment = { severity: 'none', rawModelScore: 0.1, categories: [], evidenceSegmentIds: [], explanation: 'No supported unsafe request.', recommendedAction: 'Protect sensitive information.', insufficientEvidence: true };
const turn = (callId: string, sequence: number, text: string) => ({ callId, sequence, segment: { id: `s${sequence}`, speaker: 'caller', startedAtMs: sequence * 2000, endedAtMs: sequence * 2000 + 1500, text, final: true } });

test('call context includes prior turns but is isolated from another call', async () => {
  const contexts: Segment[][] = [];
  const detector = new Detector({ provider: { source: 'cerebras', async assess(segments) { contexts.push(structuredClone(segments)); return benign; } } });
  detector.ingest(turn('a', 1, 'Our diagnostic tool is TeamViewer.'));
  await detector.flush('a');
  detector.ingest(turn('a', 2, 'Please install it.'));
  await detector.flush('a');
  expect(contexts.at(-1)?.map(s => s.id)).toEqual(['s1', 's2']);
  expect(detector.snapshot('a').categories).toContain('remote_access');
  detector.ingest(turn('b', 1, 'Hello, I am confirming an appointment.'));
  const other = await detector.flush('b');
  expect(contexts.at(-1)?.map(s => s.text)).toEqual(['Hello, I am confirming an appointment.']);
  expect(other.warnings).toEqual([]);
});

test('ordinary assessed history ages out at forty segments; it is not full-call memory', async () => {
  let latest: Segment[] = [];
  const detector = new Detector({ provider: { source: 'cerebras', async assess(segments) { latest = structuredClone(segments); return benign; } } });
  for (let sequence = 1; sequence <= 42; sequence++) {
    detector.ingest(turn('long', sequence, sequence === 1 ? 'Our diagnostic tool is TeamViewer.' : 'We are discussing the weather.'));
    await detector.flush('long');
  }
  expect(latest).toHaveLength(40);
  expect(latest.some(s => s.id === 's1')).toBe(false);
  expect(latest.map(s => s.id)).toEqual(Array.from({ length: 40 }, (_, i) => `s${i + 3}`));
});

test('unsafe evidence remains available after ordinary rolling history expires', async () => {
  let latest: Segment[] = [];
  const detector = new Detector({ provider: { source: 'cerebras', async assess(segments) { latest = structuredClone(segments); return benign; } } });
  for (let sequence = 1; sequence <= 42; sequence++) {
    detector.ingest(turn('warned', sequence, sequence === 1 ? 'Please read me your OTP.' : 'We are discussing the weather.'));
    await detector.flush('warned');
  }
  expect(latest.some(s => s.id === 's1')).toBe(true);
  expect(detector.snapshot('warned').warnings[0]?.evidence[0]?.id).toBe('s1');
});
