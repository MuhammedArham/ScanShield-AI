# Budgeted live verification and prompt tuning

Status: resolved

User authorizes up to US$3 in Cerebras API credits for an agentic verification/improvement loop. Use configured gpt-oss-120b only, verified public list rates US$0.35/M input and US$0.75/M output (2026-11-14, https://www.cerebras.ai/pricing). Do not expose credentials or alter .env. Do not train weights or claim calibrated probabilities.

Run a frozen baseline against independent literal synthetic expectations, inspect development failures, revise prompt/parameters, repeat development checks, select a candidate, then compare frozen baseline and selected candidate on withheld checks. Record model-only output separately from rule-assisted outcomes. Measure latency, malformed/truncated outputs, unsupported categories/claims, evidence and false alarms. Stop when gates are met or improvement stalls; there is no need to spend the entire allowance.

Reserve pessimistic per-request list-price costs in a durable ledger before sending, retain reservations on errors, serialize requests and lock the ledger against simultaneous runs. Hard stop on a reservation that would exceed US$3 or a fixed request count. Report usage-based estimated cost separately from reservation and actual billing (not accessible). Preserve existing offline tests and mock defaults. Document all observed failures and synthetic-data limitations.

## Continuation � 2026-11-14
Authenticated connectivity passed. Baseline resumed; five valid outputs, two category failures, then three HTTP 429 responses triggered the existing stop. Candidate 01 prepared but untested. Withheld comparison remains pending. See [continuation report](../../docs/tuning/continuation-2026-11-14.md). Cumulative reservations US$0.056483; US$3 total authorization unchanged.

## Completed improvement loop

Authenticated connectivity passed. Paced baseline/candidate development, a frozen withheld comparison, and added normal/staged-scam calls completed. Candidate 03 was adopted as the combined prompt/low-effort configuration for gpt-oss-120b, after considering all three suites: strict model gates 20/24 to 24/24 development, 13/16 to 14/16 withheld, and 9/12 to 10/12 added calls. Corrected engine replay on added calls improves 9/12 to 12/12. Category, uncertainty and citation gaps remain explicit; no further tuning used the withheld outputs. Two false-alarm rule fixes and bounded-memory tests were added.

Build, type checking and 79 tests passed. Cumulative ledger: 134 attempts, US$0.800211 retained reservations, US$0.0573644 known-usage estimate, six unknown-usage attempts; US$3 total authorization unchanged. See [final report](../../docs/tuning/results.md) and [adoption decision](../../docs/tuning/adoption.json). Stop after this frozen comparison; further model work needs fresh evaluation cases.
