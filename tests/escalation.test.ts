import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';
import { readFileSync } from 'node:fs';

const event = (text: string, sequence = 1, speaker = 'track-b') => ({ callId: 'escalation', sequence,
  segment: { id: `s${sequence}`, speaker, startedAtMs: sequence * 1000, endedAtMs: sequence * 1000 + 800, text, final: true } });

test('synthetic escalation replay prefixes use only evidence available at each boundary', async () => {
  const labels = JSON.parse(readFileSync('fixtures/escalation-labels.json', 'utf8'));
  for (const scenario of labels) {
    const detector = new Detector();
    const events = JSON.parse(readFileSync(`fixtures/${scenario.fixture}`, 'utf8'));
    for (let i = 0; i < events.length; i++) {
      detector.ingest(events[i]);
      const result = await detector.flush(events[i].callId);
      expect(result.severity, `${scenario.fixture} prefix ${i + 1}`).toBe(scenario.prefixes[i].severity);
      expect(result.evidence.every(s => s.endedAtMs <= events[i].segment.endedAtMs)).toBe(true);
    }
  }
});

test('security advice in one clause does not conceal an actual credential request', async () => {
  const detector = new Detector();
  detector.ingest(event('Never share passwords. Now read me your OTP.'));
  expect((await detector.flush('escalation')).severity).toBe('critical');
});

test('an urgent request to proceed with a previously proposed transfer warns and persists through small talk', async () => {
  const detector = new Detector();
  detector.ingest(event('We need to transfer your money to a new account.', 1));
  detector.ingest(event('Please do it immediately.', 2));
  detector.ingest(event('The weather is lovely.', 3));
  const result = await detector.flush('escalation');
  expect(result.severity).toBe('high');
  expect(result.warnings.some(w => w.category === 'payment_redirection' && w.evidence.some(s => s.id === 's2'))).toBe(true);
});

test('a vague request from another track does not inherit a remote tool mention', async () => {
  const detector = new Detector();
  detector.ingest(event('Our support tool is AnyDesk.', 1, 'track-b'));
  detector.ingest(event('Open it now.', 2, 'track-a'));
  expect((await detector.flush('escalation')).warnings).toEqual([]);
});

test('remote support setup becomes a warning only when the same speaker asks to install it', async () => {
  const detector = new Detector();
  detector.ingest(event('Hello, how is your day?', 1));
  detector.ingest(event('Our support tool is AnyDesk.', 2));
  expect((await detector.flush('escalation')).warnings).toEqual([]);
  detector.ingest(event('Keep this between us and install it now.', 3));
  const result = await detector.flush('escalation');
  expect(result).toMatchObject({ severity: 'high', warnings: [{ category: 'remote_access', evidence: [
    { id: 's2', speaker: 'track-b', startedAtMs: 2000 }, { id: 's3', speaker: 'track-b', startedAtMs: 3000 }
  ] }] });
});

test.each(['Never install AnyDesk.', 'Do not transfer money to a new account.', 'In this training example the scammer says "read me your OTP".', 'I work for your bank.', 'We sometimes use remote support tools.'])('benign or ambiguous discussion has no high warning: %s', async text => {
  const detector = new Detector();
  detector.ingest(event(text));
  expect((await detector.flush('escalation')).warnings).toEqual([]);
});

test('training preamble cannot suppress an actual request in the following clause', async () => {
  const detector = new Detector();
  detector.ingest(event('This is training, but now send me your password.'));
  expect((await detector.flush('escalation')).severity).toBe('critical');
});
