import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createUiServer } from '../src/ui-server.js';

const server = createUiServer({});
let base = '';
let originalBudget: string;
beforeAll(async () => {
  originalBudget = createHash('sha256').update(readFileSync('docs/tuning/budget.json')).digest('hex');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  expect(createHash('sha256').update(readFileSync('docs/tuning/budget.json')).digest('hex')).toBe(originalBudget);
});
const request = async (path: string, value?: unknown, method = value === undefined ? 'GET' : 'POST') => {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) });
  return { status: response.status, data: await response.json() };
};

test('serves the local dashboard without exposing credentials', async () => {
  const response = await fetch(base);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('Follow the signal.');
  expect(html).toContain('id="mode-live"');
  expect(html).toContain('>Cerebras · Live</button>');
  expect(html).toContain('<option value="cerebras">');
  expect(html).not.toContain('</option value=');
  const config = await request('/api/config');
  expect(config.data.liveConfigured).toBe(false);
  expect(config.data.budget.authorizedUsd).toBe(3);
  expect(JSON.stringify(config.data)).not.toContain('API_KEY');
  expect((await request('/api/calls', { mode: 'cerebras' })).status).toBe(409);
});

test('normal and scam calls are independent; unsafe evidence is redacted and warnings persist', async () => {
  const a = await request('/api/calls', { mode: 'mock' });
  const id = a.data.id;
  const safe = await request(`/api/calls/${id}/turn`, { speaker: 'caller', text: 'The clinic is confirming your appointment.' });
  expect(safe.data.snapshot.severity).toBe('none');
  const danger = await request(`/api/calls/${id}/turn`, { speaker: 'caller', text: 'Please read me your OTP. My password is swordfish.' });
  expect(danger.data.snapshot.severity).toBe('critical');
  expect(danger.data.snapshot.warnings[0].evidence[0].id).toBe('s2');
  expect(JSON.stringify(danger.data)).not.toContain('swordfish');
  const later = await request(`/api/calls/${id}/turn`, { speaker: 'customer', text: 'Thank you for your time.' });
  expect(later.data.snapshot.warningState).toBe('unresolved');
  const b = await request('/api/calls', { mode: 'mock' });
  const other = await request(`/api/calls/${b.data.id}/turn`, { speaker: 'caller', text: 'Your service booking is confirmed.' });
  expect(other.data.snapshot.warnings).toEqual([]);
  expect((await request(`/api/calls/${id}`, undefined, 'DELETE')).data.ended).toBe(true);
  expect((await request(`/api/calls/${id}/turn`, { speaker: 'caller', text: 'Hello.' })).status).toBe(404);
});

test('rejects invalid input and cross-origin mutations before creating a call', async () => {
  expect((await request('/api/calls', { mode: 'not-a-provider' })).status).toBe(400);
  const response = await fetch(base + '/api/calls', { method: 'POST', headers: { Origin: 'https://another-site.example', 'Content-Type': 'application/json' }, body: '{"mode":"mock"}' });
  expect(response.status).toBe(403);
  const call = await request('/api/calls', { mode: 'mock' });
  expect((await request(`/api/calls/${call.data.id}/turn`, { speaker: 'caller', text: '' })).status).toBe(400);
});
