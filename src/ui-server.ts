import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { Detector, type Snapshot } from './detector.js';
import { cerebrasProvider, mockProvider, type Provider } from './provider.js';
import { createBudgetTransport, readVerificationLedger } from './verification.js';
import { redact } from './redact.js';

const ledgerPath = 'docs/tuning/budget.json';
const lockPath = 'docs/tuning/budget.lock';
const Turn = z.object({ text: z.string().trim().min(1).max(4000), speaker: z.enum(['caller', 'customer']) }).strict();
type Session = { detector: Detector; mode: 'mock' | 'cerebras'; sequence: number; busy: boolean; diagnostic: string | null; turns: { id: string; speaker: string; text: string }[]; updatedAt: number };

function budget() {
  const ledger = readVerificationLedger(ledgerPath);
  const reservedUsd = ledger.attempts.reduce((sum, a) => sum + a.reservedMicros, 0) / 1e6;
  return { authorizedUsd: ledger.authorizedMicros / 1e6, reservedUsd, remainingUsd: (ledger.authorizedMicros / 1e6) - reservedUsd,
    usageEstimatedUsd: ledger.attempts.reduce((sum, a) => sum + (a.estimatedUsd ?? 0), 0),
    unknownUsageAttempts: ledger.attempts.filter(a => a.estimatedUsd === undefined).length, attempts: ledger.attempts.length };
}

async function body(request: IncomingMessage): Promise<unknown> {
  let text = '';
  for await (const chunk of request) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 20_000) throw new Error('Request too large');
  }
  return JSON.parse(text);
}

export function createUiServer(env: NodeJS.ProcessEnv = process.env) {
  const sessions = new Map<string, Session>();
  let nextLiveAt = 0;
  const liveConfigured = Boolean(env.CEREBRAS_API_KEY?.trim()) && env.CEREBRAS_MODEL === 'gpt-oss-120b';
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const providerFor = (id: string, session: Session): Provider => {
    if (session.mode === 'mock') return mockProvider;
    const transport = createBudgetTransport({ ledgerPath, label: () => `ui:${id}:${session.sequence}`, transport: async (url, init) => {
      const response = await fetch(url, init);
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const seconds = retry === null ? NaN : Number(retry);
        const reset = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retry ?? '');
        nextLiveAt = Math.max(nextLiveAt, Number.isFinite(reset) ? reset : Date.now() + 60_000);
        session.diagnostic = 'Cerebras rate limit reached. Wait before sending another turn. Reservation retained.';
      } else if (!response.ok) session.diagnostic = `Cerebras returned HTTP ${response.status}. Reservation retained.`;
      return response;
    } });
    return cerebrasProvider(env.CEREBRAS_API_KEY!.trim(), 'gpt-oss-120b', async (url, init) => {
      if (Date.now() < nextLiveAt) throw new Error('Live cooldown');
      let lock;
      try { lock = await open(lockPath, 'wx'); }
      catch { session.diagnostic = 'The verification budget is locked by another run. No request sent.'; throw new Error('Budget locked'); }
      try {
        nextLiveAt = Date.now() + 13_000;
        return await transport(url, init);
      } catch {
        session.diagnostic ??= 'Live request failed or the budget guard refused it. Existing reservations are retained.';
        throw new Error('Guarded live request failed');
      } finally { await lock.close(); await unlink(lockPath); }
    });
  };

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
    const origin = `http://${req.headers.host}`;
    if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(req.headers.host ?? '') || (req.headers.origin && req.headers.origin !== origin)) return json(res, 403, { error: 'Local same-origin requests only.' });
    const url = new URL(req.url ?? '/', origin);
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { liveConfigured, model: 'gpt-oss-120b', budget: budget(), nextLiveAt });
      if (req.method === 'GET' && url.pathname === '/api/verification') {
        return json(res, 200, JSON.parse(await readFile('docs/tuning/comparison.json', 'utf8')));
      }
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Send JSON.' });
      if (req.method === 'POST' && url.pathname === '/api/calls') {
        const input = z.object({ mode: z.enum(['mock', 'cerebras']) }).strict().parse(await body(req));
        if (input.mode === 'cerebras' && !liveConfigured) return json(res, 409, { error: 'Cerebras gpt-oss-120b is not configured on this server.' });
        for (const [id, session] of sessions) if (!session.busy && Date.now() - session.updatedAt > 30 * 60_000) { await session.detector.endCall(id).catch(() => {}); sessions.delete(id); }
        if (sessions.size >= 12) return json(res, 409, { error: 'Too many active calls. Reset an existing call first.' });
        const id = randomUUID();
        const session: Session = { detector: null!, mode: input.mode, sequence: 0, busy: false, diagnostic: null, turns: [], updatedAt: Date.now() };
        session.detector = new Detector({ provider: providerFor(id, session) });
        sessions.set(id, session);
        return json(res, 201, { id, mode: input.mode });
      }
      const match = /^\/api\/calls\/([a-f0-9-]{36})(\/turn)?$/.exec(url.pathname);
      if (match) {
        const id = match[1]!;
        const session = sessions.get(id);
        if (!session) return json(res, 404, { error: 'Call expired. Start a new call.' });
        if (session.busy) return json(res, 409, { error: 'This call is still being assessed.' });
        if (req.method === 'DELETE' && !match[2]) {
          await session.detector.endCall(id).catch(() => {}); sessions.delete(id);
          return json(res, 200, { ended: true });
        }
        if (req.method === 'POST' && match[2]) {
          const input = Turn.parse(await body(req));
          if (session.sequence >= 100) return json(res, 409, { error: 'This test has reached 100 turns. Start a new call.' });
          if (session.mode === 'cerebras' && Date.now() < nextLiveAt) return json(res, 429, { error: 'Live cooldown. No request sent.', nextLiveAt });
          session.busy = true; session.diagnostic = null;
          try {
            const next = session.sequence + 1;
            const segment = { id: `s${next}`, speaker: input.speaker, startedAtMs: (next - 1) * 2000, endedAtMs: (next - 1) * 2000 + 1500, text: input.text, final: true };
            const started = performance.now();
            session.detector.ingest({ callId: id, sequence: next, segment });
            session.sequence = next;
            session.turns.push({ id: segment.id, speaker: segment.speaker, text: redact(segment.text) });
            const snapshot: Snapshot = await session.detector.flush(id);
            session.updatedAt = Date.now();
            return json(res, 200, { snapshot, turns: session.turns, latencyMs: performance.now() - started, diagnostic: session.diagnostic, budget: budget(), nextLiveAt });
          } finally { session.busy = false; }
        }
      }
      const assets: Record<string, [string, string]> = { '/': ['ui/index.html', 'text/html'], '/app.js': ['ui/app.js', 'text/javascript'], '/transport.js': ['ui/transport.js', 'text/javascript'], '/styles.css': ['ui/styles.css', 'text/css'] };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [path, type] = assets[url.pathname]!;
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
        res.end(await readFile(path)); return;
      }
      return json(res, 404, { error: 'Not found.' });
    } catch { if (!res.headersSent) json(res, 400, { error: 'The request could not be processed. Check the input and server configuration.' }); else res.end(); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.UI_PORT ?? 4317);
  createUiServer().listen(port, '127.0.0.1', () => console.log(`Risk testing UI: http://127.0.0.1:${port}`));
}
