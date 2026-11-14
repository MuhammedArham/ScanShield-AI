import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { replay } from '../src/replay.js';

test.each([
  ['benign-service', 'none'], ['otp-request', 'critical'], ['security-discussion', 'none']
])('replays the %s scenario as %s in credential-free mock mode', async (fixture, severity) => {
  const events = JSON.parse(await readFile(`fixtures/${fixture}.json`, 'utf8'));
  const [result] = await replay(events);
  expect(result).toMatchObject({ severity, providerSource: 'mock', calibratedProbability: null, modelScoreCalibration: 'uncalibrated' });
  expect(JSON.stringify(result)).not.toMatch(/12345678|654321/);
});
