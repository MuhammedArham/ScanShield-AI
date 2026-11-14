import { afterEach, expect, test, vi } from 'vitest';
import { createHash as nodeHash } from 'node:crypto';
import { createHash as browserHash } from '../src/browser-crypto.js';
import { createBrowserRequest } from '../src/browser-transport.js';

afterEach(() => vi.unstubAllGlobals());
const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

test('public journey uses the real detector, retains warnings, resets and never sends text', async () => {
  const network = vi.fn(() => { throw new Error('Unexpected network call'); });
  vi.stubGlobal('fetch', network);
  const api = createBrowserRequest();
  const config = await (await api('/api/config')).json();
  expect(config).toMatchObject({ publicMode: true, liveConfigured: false, budget: null });
  const { id } = await (await api('/api/calls', post({ mode: 'mock' }))).json();
  const turn = (text: string) => api(`/api/calls/${id}/turn`, post({ speaker: 'caller', text }));
  const safe = await (await turn('Your clinic appointment is confirmed for Thursday.')).json();
  expect(safe.snapshot.severity).toBe('none');
  const danger = await (await turn('Please read me your OTP. My password is swordfish.')).json();
  expect(danger.snapshot.severity).toBe('critical');
  expect(danger.snapshot.warnings[0].evidence[0].id).toBe('s2');
  expect(danger.snapshot.providerSource).toBe('mock');
  expect(JSON.stringify(danger)).not.toContain('swordfish');
  const later = await (await turn('Thank you for your time.')).json();
  expect(later.snapshot.warningState).toBe('unresolved');
  expect((await api(`/api/calls/${id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await turn('Hello.')).status).toBe(404);
  const b = await (await api('/api/calls', post({ mode: 'mock' }))).json();
  const reset = await (await api(`/api/calls/${b.id}/turn`, post({ speaker: 'caller', text: 'Your appointment is confirmed.' }))).json();
  expect(reset.snapshot.warnings).toEqual([]);
  // Another page/tab instance cannot access a previous tab's session.
  expect((await createBrowserRequest()(`/api/calls/${b.id}/turn`, post({ speaker: 'caller', text: 'Hello' }))).status).toBe(404);
  expect(network).not.toHaveBeenCalled();
});

test('tampered live mode and invalid turns cannot bypass the public adapter', async () => {
  const api = createBrowserRequest();
  expect((await api('/api/calls', post({ mode: 'cerebras' }))).status).toBe(400);
  const { id } = await (await api('/api/calls', post({ mode: 'mock' }))).json();
  for (const invalid of [{ speaker: 'caller', text: '' }, { speaker: 'caller', text: 'x'.repeat(4001) }, { speaker: 'other', text: 'Hello' }]) {
    expect((await api(`/api/calls/${id}/turn`, post(invalid))).status).toBe(400);
  }
  expect((await api(`/api/calls/${id}`, { method: 'DELETE' })).status).toBe(200);
  expect((await (await api('/api/verification')).json()).summaries.length).toBeGreaterThan(0);
});

test('browser fingerprints match Node SHA-256 for transcript Unicode and chained updates', () => {
  for (const text of ['', 'Please read me your OTP.', 'こんにちは — café 👋', 'x'.repeat(4000)]) {
    expect(browserHash('sha256').update(text).digest('hex')).toBe(nodeHash('sha256').update(text).digest('hex'));
  }
  expect(browserHash('sha256').update('a').update('b').digest('hex')).toBe(nodeHash('sha256').update('ab').digest('hex'));
});
