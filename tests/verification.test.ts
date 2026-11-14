import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { Detector } from '../src/detector.js';
import { cerebrasProvider } from '../src/provider.js';
import { createBudgetTransport } from '../src/verification.js';

const event = { callId: 'budget', sequence: 1, segment: { id: 's1', speaker: 'track', startedAtMs: 0, endedAtMs: 1000, text: 'Please read me your OTP.', final: true } };
test('verification refuses a request before spending beyond its persisted allowance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'risk-budget-'));
  const path = join(directory, 'ledger.json'); let sent = false;
  try {
    const transport = createBudgetTransport({ ledgerPath: path, budgetUsd: 0.000001, transport: async () => { sent = true; throw new Error('Must not send'); } });
    const detector = new Detector({ provider: cerebrasProvider('fake', 'gpt-oss-120b', transport) });
    detector.ingest(event);
    expect((await detector.flush('budget')).processingHealth.provider).toBe('degraded');
    expect(sent).toBe(false);
    expect(JSON.parse(readFileSync(path, 'utf8')).attempts).toHaveLength(0);
  } finally { unlinkSync(path); rmdirSync(directory); }
});

test('verification records usage and retains reservations across errors and resumed runs', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'risk-budget-'));
  const path = join(directory, 'ledger.json');
  const output = { severity: 'critical', rawModelScore: 0.8, categories: ['credential_theft'], evidenceSegmentIds: ['s1'], explanation: 'A code was requested.', recommendedAction: 'Do not disclose the code.', insufficientEvidence: false };
  try {
    const first = createBudgetTransport({ ledgerPath: path, transport: async () => {
      const ledger = JSON.parse(readFileSync(path, 'utf8'));
      expect(ledger.attempts).toHaveLength(1); expect(ledger.attempts[0].status).toBe('reserved');
      throw new Error('secret must not be logged');
    } });
    const failed = new Detector({ provider: cerebrasProvider('fake', 'gpt-oss-120b', first) });
    failed.ingest(event); await failed.flush('budget');
    const second = createBudgetTransport({ ledgerPath: path, transport: async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 1000, completion_tokens: 400 }
    })) });
    const resumed = new Detector({ provider: cerebrasProvider('fake', 'gpt-oss-120b', second) });
    resumed.ingest(event); expect((await resumed.flush('budget')).rawModelScore).toBe(0.8);
    const ledger = JSON.parse(readFileSync(path, 'utf8'));
    expect(ledger.attempts).toHaveLength(2); expect(ledger.attempts[0].status).toBe('error');
    expect(ledger.attempts[0].reservedMicros).toBeGreaterThan(0);
    expect(ledger.attempts[1].estimatedUsd).toBe(0.00065);
    expect(JSON.stringify(ledger)).not.toContain('secret must not be logged');
  } finally { unlinkSync(path); rmdirSync(directory); }
});
