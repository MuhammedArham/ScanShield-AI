# Cerebras improvement loop results

The live loop is complete. Authenticated connectivity passed before inference. Production now uses the frozen selected Candidate 03 prompt and low reasoning effort for gpt-oss-120b. Other models keep their existing reasoning defaults. Two narrow rule fixes remain applied: own-app code entry is distinguished from disclosure, and explicitly refused historical requests are distinguished from active clauses.

| Round | Strict model gates | Engine replay gates | Benign high/critical model warnings | p95 request latency |
| --- | --- | --- | --- | --- |
| Baseline development | 20/24 | 22/24 | 0 | 907.2 ms |
| Candidate 02 development | 20/24 | 23/24 | 0 | 915.8 ms |
| Candidate 03 development | 24/24 | 24/24 | 0 | 682.5 ms |
| Baseline withheld | 13/16 | 14/16 | 0 | 1027.6 ms |
| Candidate 03 withheld | 14/16 | 15/16 | 0 | 1069.3 ms |
| Baseline added call scenarios | 9/12 | 9/12 | 1 | 1327.2 ms |
| Candidate 03 added call scenarios | 10/12 | 12/12 | 0 | 581.5 ms |

Model gates include local validation, severity, required/forbidden categories, evidence, uncertainty and limited narrative checks. Current-engine replay gates cover severity, required/forbidden categories and required evidence only, using cached model output and the same final engine build for both configurations. These columns are different metrics. Engine replay makes no extra API calls and does not establish causal per-turn or end-to-end audio latency. Passing counts include failures and unavailable model responses in the denominator.

The development baseline combines five earlier valid baseline-dev-resume responses with 19 baseline-dev-paced responses; original errors remain in their reports and ledger. Baseline prompt hashes match. Candidate 02 was rejected at 20/24, including one 800-token truncation. Candidate 03 combined a revised prompt with low reasoning effort; causal contributions of these changes were not isolated. It passed 24/24 development gates and was frozen in selection.json before the withheld comparison. No prompt was revised after observing withheld results.

The baseline withheld failures were overstated conclusion (gift cards), unsupported urgency (login approval), and missing earlier evidence (six-digit code). Candidate 03 corrected those checks but omitted payment_redirection for the gift-card attack and secrecy_isolation for the secret investment. Both still received high/critical risk severity; they are category regressions, not completely missed dangerous calls. The payment rule recovers the gift-card category. A one-case aggregate gain on sixteen checks does not establish statistical superiority. Adoption additionally considers the improved ordinary-call and staged-attack behavior; the remaining category gaps are not treated as resolved.

Added call scenarios contain six normal multi-turn calls and three harmless-to-harmful scam pairs, assessed as independent prefixes/full transcripts. Candidate 03 kept all six normal calls at none and detected all three harmful completions, but strict model gates passed only 10/12 due to a missing uncertainty flag and a missing earlier tool citation. The initial rule-assisted snapshot falsely warned on a refused historical quote. Its raw report remains unchanged; regression-tested corrected-engine replay removes that false warning. See robustness.md and the baseline robustness report for both model configurations.

## Memory and scope

Conversation context is maintained in the engine, not a provider session. The default is the latest 40 ordinary segments plus unassessed segments and retained warning evidence. Tests verify cross-turn context, call isolation, ordinary-history expiry, and warning-evidence retention. There is no full-call persistent memory or summary. An early harmless setup can age out, so later pronouns can lose their antecedent. See context-memory.md and tests/context-memory.test.ts.

These are synthetic transcript checks, not actual telephone calls, speech-to-text tests, calibrated probabilities or validated production accuracy. Each configuration was sampled once per fixture; a single repeat is stochastic, small, and not a statistical demonstration of generalization. Quoted-speech handling and redaction remain limited heuristics. Speaker labels do not verify identity. Successful request latency excludes pacing and audio/STT/upstream delivery; production latency remains unestablished.

## Budget and verification

The original US$3 cumulative authorization and all three original error reservations are preserved. 134 cumulative attempts reserve US$0.800211. Known-usage list-price estimate is US$0.0573644; 6 attempts have unknown usage. Actual account billing is unavailable. No reservations were refunded or reset.

The paced runs use at least 13 seconds between requests and stop on the first HTTP 429, preserving Retry-After guidance and reservations. Reports cannot overwrite prior evidence. The budget guard retains the 300-request and US$3 hard limits. No further 429 occurred during the paced rounds.

Build and type checking passed; all 79 tests across 11 test files passed. The configured system prompt matches the frozen selected prompt exactly; its reasoning setting is covered by an injected-transport regression test. New regression tests cover immediate rate-limit stopping, durable reservation retention, report protection, lock cleanup, false alarms, retained unsafe continuations and context limits.

Further prompt work should start with fresh development and withheld cases, especially gift-card/payment categorization, unsafe secrecy, uncertainty and provenance. Full-call memory is tracked separately in .scratch/risk-detector-tuning/issues/02-full-call-context.md. Do not claim these remaining gaps are resolved.
