import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

test('live runner stops on the first 429, retains reservation and releases its lock', () => {
  const directory = mkdtempSync(join(tmpdir(), 'risk-runner-'));
  try {
    mkdirSync(join(directory, 'tools/tuning'), { recursive: true });
    mkdirSync(join(directory, 'docs/tuning'), { recursive: true });
    writeFileSync(join(directory, 'tools/tuning/prompt-baseline.txt'), 'Assess risk.');
    writeFileSync(join(directory, 'tools/tuning/cases.json'), JSON.stringify([
      { id: 'one', split: 'dev', turns: ['Hello.'], levels: ['none'] },
      { id: 'two', split: 'dev', turns: ['Hello again.'], levels: ['none'] }
    ]));
    const preload = join(directory, 'fetch.mjs');
    writeFileSync(preload, `globalThis.fetch = async () => new Response('{}', { status: 429, headers: { 'retry-after': '17' } });`);
    const args = ['--import', pathToFileURL(preload).href, resolve('tools/tuning/run.mjs'), '--live', '--round', 'test'];
    const options = { cwd: directory, env: { ...process.env, CEREBRAS_API_KEY: 'fake', CEREBRAS_MODEL: 'gpt-oss-120b' }, encoding: 'utf8' as const, timeout: 20000 };
    const result = spawnSync(process.execPath, args, options);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Stopped immediately on HTTP 429');
    const reportPath = join(directory, 'docs/tuning/test.json');
    const reportText = readFileSync(reportPath, 'utf8');
    const report = JSON.parse(reportText);
    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ httpStatus: 429, retryAfterMs: 17000 });
    const ledger = JSON.parse(readFileSync(join(directory, 'docs/tuning/budget.json'), 'utf8'));
    expect(ledger.attempts).toHaveLength(1);
    expect(ledger.attempts[0].reservedMicros).toBeGreaterThan(0);
    expect(existsSync(join(directory, 'docs/tuning/budget.lock'))).toBe(false);
    // An existing report must remain intact and the failed startup must release its lock.
    const repeated = spawnSync(process.execPath, args, options);
    expect(repeated.status).toBe(1);
    expect(readFileSync(reportPath, 'utf8')).toBe(reportText);
    expect(existsSync(join(directory, 'docs/tuning/budget.lock'))).toBe(false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30000);
