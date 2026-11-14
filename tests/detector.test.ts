import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';

const event = (text: string, final = true) => ({ callId: 'demo', sequence: 1,
  segment: { id: 's1', speaker: 'track-a', startedAtMs: 0, endedAtMs: 1200, text, final } });

test('a finalized OTP disclosure request immediately warns with attributed evidence before assessment', () => {
  const detector = new Detector();
  const result = detector.ingest(event('Please read me your OTP.'));
  expect(result).toMatchObject({ callId: 'demo', severity: 'critical', rawModelScore: null,
    calibratedProbability: null, providerSource: 'mock', processedThroughSequence: 1,
    warnings: [{ state: 'unresolved', evidence: [{ id: 's1', speaker: 'track-a', startedAtMs: 0, endedAtMs: 1200 }] }] });
});

test.each(['Your service booking is confirmed.', 'Never share your OTP.', 'Please enter your verification code in your own official app.'])('benign final text remains advisory without a credential warning: %s', async text => {
  const detector = new Detector();
  detector.ingest(event(text));
  const result = await detector.endCall('demo');
  expect(result.warnings).toEqual([]);
  expect(result.severity).toBe('none');
  expect(() => detector.snapshot('demo')).toThrow('Unknown call');
});

test('partial text is not canonical evidence and malformed events cannot change the call', async () => {
  const detector = new Detector();
  expect(detector.ingest(event('Read me your OTP.', false)).warnings).toEqual([]);
  const before = detector.snapshot('demo');
  expect(() => detector.ingest({ ...event('bad'), sequence: -1 })).toThrow();
  expect(detector.snapshot('demo')).toEqual(before);
  detector.ingest({ ...event('Tell me your password.'), sequence: 2 });
  expect((await detector.flush('demo')).warnings).toHaveLength(1);
});

test('provider context and warnings redact disclosed values while retaining the unsafe action', async () => {
  const contexts: unknown[] = [];
  const detector = new Detector({ provider: { source: 'mock', async assess(segments) {
    contexts.push(segments);
    return { severity: 'none', rawModelScore: 0.1, categories: [], evidenceSegmentIds: [], explanation: 'Synthetic benign assessment.', recommendedAction: 'Remain careful.', insufficientEvidence: true };
  } } });
  detector.ingest(event('Please share your password with me. My password is swordfish. Account number 12345678; OTP is 654321.'));
  const result = await detector.flush('demo');
  expect(result.severity).toBe('critical');
  expect(result.evidence[0]?.text).toContain('share your password with me');
  expect(JSON.stringify([contexts, result])).not.toMatch(/swordfish|12345678|654321/);
  expect(result.rawModelScore).toBe(0.1);
});

test('entering a code in the previously opened official app does not warn before model assessment', async () => {
  const detector = new Detector();
  detector.ingest(event('Open the official app yourself using your usual shortcut.'));
  const result = detector.ingest({ ...event('Please enter the verification code inside that app. Do not read it to me.'), sequence: 2, segment: { ...event('Please enter the verification code inside that app. Do not read it to me.').segment, id: 's2' } });
  expect(result.categories).not.toContain('credential_theft');
  await detector.endCall('demo');
});

test.each(['Enter your verification code in this app and read it to me.', 'Please enter your verification code in your own official app and send it to me.'])('app entry does not conceal a separate disclosure request: %s', async text => {
  const detector = new Detector();
  expect(detector.ingest(event(text)).categories).toContain('credential_theft');
  await detector.endCall('demo');
});

test('an unspecified app destination does not suppress an authentication-secret warning', async () => {
  const detector = new Detector();
  expect(detector.ingest(event('Enter your verification code inside this app I sent you.')).categories).toContain('credential_theft');
  await detector.endCall('demo');
});

test.each([
  'The caller said, tell me your password. I refused and ended the call.',
  'A stranger said, please read me your OTP. I declined and hung up.'
])('reported and refused past requests do not create active rule warnings: %s', async text => {
  const detector = new Detector();
  expect(detector.ingest(event(text)).warnings).toEqual([]);
  await detector.endCall('demo');
});

test.each([
  'The caller said, tell me your password. I refused. Now read me your OTP.',
  'The caller said, tell me your password and now read me your OTP. I refused the original request.',
  'The caller said, tell me your password and share your OTP with me. I refused the original request.'
])('past-incident wording does not suppress a separate disclosure request: %s', async text => {
  const detector = new Detector();
  expect(detector.ingest(event(text)).categories).toContain('credential_theft');
  await detector.endCall('demo');
});
