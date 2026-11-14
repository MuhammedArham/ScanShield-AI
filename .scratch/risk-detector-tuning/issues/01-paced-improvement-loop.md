# Paced live improvement loop

Status: resolved
Type: task

Complete development baseline, compare candidate prompts, freeze selection before withheld comparison, and record model-only and engine outcomes separately. Retain the existing US$3 cumulative ledger and every previous reservation. All inputs are synthetic; do not claim production accuracy or calibrated probabilities.

## Comments

- Authenticated model-list connectivity passed before inference.
- Added 13-second minimum request spacing, immediate stop on HTTP 429 with Retry-After capture, report overwrite prevention, and engine replay using cached model output (no additional inference).
- Offline runner regression test passed. Baseline remaining development cases are currently running.

- Frozen baseline completed: 20/24 model-only literal gates. No benign high/critical model false warnings. Four failures: unsupported impersonation, two unsupported urgency labels, missing uncertainty for a standalone secret declaration.
- Added rule regressions that first failed for app-entry false alarm and a concealed disclosure after official-app wording; fixed the app-entry exemption and verified both pass.
- Candidate 02 is being evaluated. Observed one 800-token truncation plus password/recovery-phrase severity downgrades. Candidate 03 prepared from development findings; will test with low reasoning effort. Withheld selection remains unopened for evaluation.

## Answer

Completed. Selected Candidate 03 is now the production gpt-oss-120b prompt with low reasoning effort. Final adoption considers the observed normal-call false warning reduction as well as the frozen withheld comparison, with new category omissions explicitly retained. Build/check and 79 tests pass. See docs/tuning/results.md and docs/tuning/adoption.json. The ledger and US$3 cumulative authorization are preserved.
