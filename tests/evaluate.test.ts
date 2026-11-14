import { expect, test } from 'vitest';
import { evaluate, loadScenarios } from '../src/evaluate.js';

test('independent synthetic labels pass through the public detector boundary', async () => {
  const report = await evaluate(await loadScenarios());
  expect(report.gatePassed).toBe(true);
  expect(report.scenarioCount).toBeGreaterThanOrEqual(10);
  expect(report.falseCritical).toBe(0);
  expect(report.latency.ruleWarningMs.count).toBeGreaterThan(0);
});

test('a false critical provider alert fails the evaluation gate', async () => {
  const benign = (await loadScenarios()).filter(s => s.fixture === 'benign-service.json');
  const report = await evaluate(benign, { provider: { source: 'mock', async assess(segments) {
    return { severity: 'critical', categories: ['credential_theft'], evidenceSegmentIds: [segments[0]!.id],
      rawModelScore: .99, explanation: 'Injected false alert', recommendedAction: 'Stop', insufficientEvidence: false };
  } } });
  expect(report.gatePassed).toBe(false);
  expect(report.falseCritical).toBe(2);
});

test('evaluation refuses missing samples, missing labels and non-mock providers', async () => {
  await expect(evaluate([])).rejects.toThrow('samples');
  const scenarios = await loadScenarios();
  await expect(evaluate([{ ...scenarios[0]!, events: [] }])).rejects.toThrow('samples');
  await expect(evaluate([{ ...scenarios[0]!, prefixes: [] }])).rejects.toThrow('labels');
  await expect(evaluate(scenarios, { provider: { source: 'cerebras', async assess() { throw new Error('must not run'); } } })).rejects.toThrow('mock');
});
