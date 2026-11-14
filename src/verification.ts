import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

// Verified standard Shared Inference list prices, 2026-11-14.
// https://www.cerebras.ai/pricing ; completion usage includes reasoning tokens.
export const verificationPricing = { model: 'gpt-oss-120b', inputUsdPerMillion: 0.35, outputUsdPerMillion: 0.75 } as const;
const Attempt = z.object({
  label: z.string(), hash: z.string(), reservedMicros: z.number().int().positive(),
  status: z.enum(['reserved', 'completed', 'error']),
  promptTokens: z.number().int().nonnegative().optional(), completionTokens: z.number().int().nonnegative().optional(),
  estimatedUsd: z.number().nonnegative().optional(), httpStatus: z.number().int().optional(),
  finishReason: z.string().optional(),
  usageExceededReservation: z.boolean().optional()
});
const Ledger = z.object({
  authorizedMicros: z.number().int().positive().max(3_000_000),
  model: z.literal('gpt-oss-120b'), pricingSource: z.literal('https://www.cerebras.ai/pricing'),
  rates: z.object({ inputUsdPerMillion: z.literal(0.35), outputUsdPerMillion: z.literal(0.75) }),
  attempts: z.array(Attempt).max(300)
});
export type VerificationLedger = z.infer<typeof Ledger>;
export class BudgetError extends Error { constructor() { super('Verification budget guard refused the request'); } }
export function readVerificationLedger(path: string): VerificationLedger { return Ledger.parse(JSON.parse(readFileSync(path, 'utf8'))); }

/** Used only by explicit verification. The CLI holds an exclusive lock for the run. */
export function createBudgetTransport(options: {
  ledgerPath: string; budgetUsd?: number; transport?: typeof fetch; label?: () => string;
}): typeof fetch {
  const budgetUsd = options.budgetUsd ?? 3;
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 3) throw new BudgetError();
  const authorizedMicros = Math.floor(budgetUsd * 1_000_000);
  const initial: VerificationLedger = { authorizedMicros, model: verificationPricing.model,
    pricingSource: 'https://www.cerebras.ai/pricing', rates: { inputUsdPerMillion: 0.35, outputUsdPerMillion: 0.75 }, attempts: [] };
  const persist = (ledger: VerificationLedger) => {
    mkdirSync(dirname(options.ledgerPath), { recursive: true });
    writeFileSync(`${options.ledgerPath}.pending`, JSON.stringify(ledger, null, 2) + '\n');
    renameSync(`${options.ledgerPath}.pending`, options.ledgerPath);
  };
  if (!existsSync(options.ledgerPath)) persist(initial);
  let sending = false;
  return async (url, init) => {
    if (sending || String(url) !== 'https://api.cerebras.ai/v1/chat/completions' || init?.method !== 'POST' || typeof init.body !== 'string') throw new BudgetError();
    const body = JSON.parse(init.body) as { model?: unknown; max_completion_tokens?: unknown };
    const maxTokens = body.max_completion_tokens;
    if (body.model !== verificationPricing.model || typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 800) throw new BudgetError();
    const bytes = Buffer.byteLength(init.body, 'utf8');
    if (bytes > 32_000) throw new BudgetError();
    // Deliberately pessimistic: 4 tokens per serialized byte + 4096 wrapper tokens,
    // plus the entire capped output, including hidden reasoning. No refunds.
    const reserve = Math.ceil((bytes * 4 + 4096) * 0.35 + maxTokens * 0.75);
    const ledger = readVerificationLedger(options.ledgerPath);
    const reserved = ledger.attempts.reduce((total, attempt) => total + attempt.reservedMicros, 0);
    if (ledger.authorizedMicros !== authorizedMicros || ledger.attempts.length >= 300 || ledger.attempts.some(a => a.usageExceededReservation) || reserved + reserve > authorizedMicros) throw new BudgetError();
    const attempt: z.infer<typeof Attempt> = { label: options.label?.() ?? 'verification',
      hash: createHash('sha256').update(init.body).digest('hex'), reservedMicros: reserve, status: 'reserved' };
    ledger.attempts.push(attempt); persist(ledger); sending = true;
    try {
      const response = await (options.transport ?? fetch)(url, init);
      attempt.httpStatus = response.status;
      try {
        const envelope = z.object({ choices: z.array(z.object({ finish_reason: z.string() })).optional(), usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }) }).parse(await response.clone().json());
        const usage = envelope.usage;
        attempt.finishReason = envelope.choices?.[0]?.finish_reason;
        attempt.promptTokens = usage.prompt_tokens; attempt.completionTokens = usage.completion_tokens;
        attempt.estimatedUsd = (usage.prompt_tokens * 0.35 + usage.completion_tokens * 0.75) / 1_000_000;
        attempt.usageExceededReservation = attempt.estimatedUsd * 1_000_000 > reserve;
      } catch { /* Unknown billing remains charged against the full reservation. */ }
      attempt.status = 'completed'; persist(ledger);
      return response;
    } catch {
      attempt.status = 'error'; persist(ledger);
      throw new Error('Verification transport failed; reservation retained');
    } finally { sending = false; }
  };
}
