import { z } from 'zod';

export const Severity = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof Severity>;
export const Category = z.enum(['credential_theft', 'impersonation', 'urgency_pressure', 'remote_access', 'payment_redirection', 'information_extraction', 'secrecy_isolation', 'other']);
export const Event = z.object({
  callId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  sequence: z.number().int().nonnegative(),
  segment: z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    speaker: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
    startedAtMs: z.number().nonnegative(), endedAtMs: z.number().nonnegative(),
    text: z.string().min(1).max(4000), final: z.boolean()
  }).strict().refine(s => s.endedAtMs >= s.startedAtMs, 'Invalid time range')
}).strict();
export type TranscriptEvent = z.infer<typeof Event>;
export type Segment = TranscriptEvent['segment'];
export const Assessment = z.object({
  severity: Severity, rawModelScore: z.number().min(0).max(1),
  categories: z.array(Category).max(8), evidenceSegmentIds: z.array(z.string()).max(20),
  explanation: z.string().max(500), recommendedAction: z.string().max(300),
  insufficientEvidence: z.boolean()
}).strict();
export type Assessment = z.infer<typeof Assessment>;
export const rank = (s: Severity) => Severity.options.indexOf(s);
export interface Alert {
  id: string; severity: Severity; category: z.infer<typeof Category>;
  explanation: string; recommendedAction: string;
  evidence: Segment[]; source: 'rule' | 'cerebras' | 'mock';
}
