import { z } from 'zod';
import { Detector } from './detector.js';
import { mockProvider } from './provider.js';
import { redact } from './redact.js';
import verification from '../docs/tuning/comparison.json' with { type: 'json' };

const Turn = z.object({ text: z.string().trim().min(1).max(4000), speaker: z.enum(['caller', 'customer']) }).strict();
type Session = { sequence: number; busy: boolean; turns: { id: string; speaker: string; text: string }[] };
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

/** The existing dashboard contract, executed entirely in this tab.
 * This adapter never calls fetch, persists data, or constructs a live provider.
 */
export function createBrowserRequest() {
  const detector = new Detector({ provider: mockProvider, limits: { maxCalls: 12 } });
  const sessions = new Map<string, Session>();
  return async function request(path: string, options: RequestInit = {}): Promise<Response> {
    const method = options.method ?? 'GET';
    try {
      if (method === 'GET' && path === '/api/config') return json(200, {
        publicMode: true, liveConfigured: false, model: null, budget: null, nextLiveAt: 0
      });
      if (method === 'GET' && path === '/api/verification') return json(200, verification);
      if (method === 'POST' && path === '/api/calls') {
        // Reject attempts to enable paid/live assessments even if UI is modified.
        const input = z.object({ mode: z.literal('mock') }).strict().safeParse(JSON.parse(String(options.body)));
        if (!input.success) return json(400, { error: 'This public prototype supports rules-only mock assessment.' });
        if (sessions.size >= 12) return json(409, { error: 'Too many sessions. Reset a session or reload this page.' });
        const id = crypto.randomUUID();
        sessions.set(id, { sequence: 0, busy: false, turns: [] });
        return json(201, { id, mode: 'mock' });
      }
      const match = /^\/api\/calls\/([a-f0-9-]{36})(\/turn)?$/.exec(path);
      if (!match) return json(404, { error: 'Not found.' });
      const id = match[1]!;
      const session = sessions.get(id);
      if (!session) return json(404, { error: 'Session expired. Start a new session.' });
      if (session.busy) return json(409, { error: 'This turn is still being assessed.' });
      if (method === 'DELETE' && !match[2]) {
        if (session.sequence) await detector.endCall(id);
        sessions.delete(id); return json(200, { ended: true });
      }
      if (method !== 'POST' || !match[2]) return json(404, { error: 'Not found.' });
      const input = Turn.parse(JSON.parse(String(options.body)));
      if (session.sequence >= 100) return json(409, { error: 'This session has reached 100 turns. Start a new session.' });
      session.busy = true;
      try {
        const sequence = session.sequence + 1;
        const segment = { id: `s${sequence}`, speaker: input.speaker, startedAtMs: (sequence - 1) * 2000,
          endedAtMs: (sequence - 1) * 2000 + 1500, text: input.text, final: true };
        const started = performance.now();
        detector.ingest({ callId: id, sequence, segment });
        session.sequence = sequence;
        session.turns.push({ id: segment.id, speaker: segment.speaker, text: redact(segment.text) });
        const snapshot = await detector.flush(id);
        return json(200, { snapshot, turns: session.turns, latencyMs: performance.now() - started,
          diagnostic: null, budget: null, nextLiveAt: 0 });
      } finally { session.busy = false; }
    } catch { return json(400, { error: 'Check the speaker and enter a transcript turn of 1–4000 characters.' }); }
  };
}
export const request = createBrowserRequest();
