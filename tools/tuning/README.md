# Budgeted Cerebras verification

Run `npm run build` before the runner. It requires explicit `--live`, a configured gpt-oss-120b key/model, and holds `docs/tuning/budget.lock` exclusively. Never delete or reset budget.json. Every attempted inference must reserve its pessimistic cost first, including requests that fail. The cumulative authorization is US$3, not US$3 per round. No automatic paid retries occur.

Example:

```powershell
node --env-file-if-exists=.env tools/tuning/run.mjs --live --round unique-round-name --split dev --prompt tools/tuning/prompt-candidate-03.txt --effort low
node tools/tuning/summarize.mjs docs/tuning/unique-round-name.json --replay-engine
```

Requests are at least 13 seconds apart, including an initial delay between separate phase processes. `--interval-ms` can increase pacing to at most 60000. The provider's 10-second verification timeout remains separate from the 2.5-second production timeout; pacing is outside measured request latency. Successful-response latency excludes upstream transcription/audio delivery.

HTTP 429 stops immediately and records Retry-After when supplied. Wait at least the indicated duration before explicitly starting a new round with a new name. Use a longer interval if necessary. HTTP 401/403 and budget refusal also stop. Other consecutive provider/validation failures stop at three. Report names cannot overwrite existing evidence. The lock is released on caught startup/run errors. Do not remove a lock without confirming its owning process has stopped.

Use `--offset N` to start after N cases in the selected split. Keep earlier reports and explicitly document partial-round stitching; never silently replace error attempts or their reservations. Repeating a run incurs a new reservation and is a fresh stochastic sample.

## Current experiment

Baseline is frozen at prompt-baseline.txt, default reasoning and temperature. Baseline-dev-complete.json explicitly combines the first five valid baseline-dev-resume.json results with 19 baseline-dev-paced.json results. The earlier three 429s remain in their original report and ledger.

Candidate 02 (default effort) failed selection: 20/24 checks, with a truncation, two severity downgrades, and an unsupported secrecy category. Candidate 03 tests a revised prompt plus low reasoning effort as a combined configuration; this does not isolate each change's causal effect.

Selection gates, before withheld evaluation: all 24 development cases must return valid output and pass literal model gates; no benign high/critical warning; all severity/category/required-evidence engine replay gates must pass. Candidate must improve on the baseline's 20/24. Compare the frozen selected candidate and baseline on all 16 check cases, without further tuning against their outputs. Adopt only if check results do not regress overall and introduce no new missed dangerous request or benign high/critical warning. Otherwise retain the existing production model configuration and report the failure.

The runner stores model-only output and separate cached-output engine replays; replays make no extra API calls. `summarize.mjs --replay-engine` replays stored outputs through the current compiled engine and reports severity/category/required-evidence gates, clearly separated from the model's uncertainty/narrative gates. Historical report engine outcomes remain unchanged. Recorded rule-assisted gate behavior changed during this experiment; use current-engine replay for like-for-like engine comparison.

All fixtures are literal synthetic expectations. A passing sample is not measured production precision/recall, calibrated probability, verified caller identity, or production latency. Actual billing is unavailable; usage estimates exclude unknown-usage attempts and must be reported separately from retained reservations.

## Final decision

The loop completed and Candidate 03 was promoted unchanged after the frozen comparison and added-call comparison. gpt-oss-120b now sends reasoning_effort=low; other models retain their existing default. The baseline prompt file remains frozen. The verification runner explicitly removes any production reasoning setting before applying its own --effort selection, so --effort default still means the provider default for future baseline reproduction.

Strict model checks: development 20/24 to 24/24, withheld 13/16 to 14/16, added calls 9/12 to 10/12. Corrected engine replay added-call gates improve 9/12 to 12/12. Two new model category omissions remain, alongside uncertainty/citation gaps. No benign high/critical candidate warning or dangerous severity miss occurred in these samples. This practical adoption decision is not a statistical production-accuracy claim. See docs/tuning/adoption.json, comparison.json, results.md and context-memory.md.

Regenerate the offline comparison artifacts with `node tools/tuning/report.mjs` after building. Do not rerun paid inference merely to regenerate reports. Final validation: build and type checking passed; all 79 offline tests passed.
