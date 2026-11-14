# Cerebras verification continuation — 2026-11-14

Authenticated GET /v1/models returned HTTP 200 before inference. Configured model remains gpt-oss-120b. No credentials were printed or changed.

Build succeeded; 9 test files and all 64 tests passed.

## Live baseline

Frozen baseline prompt retained. See baseline-dev-resume.json for model-only assessments. Five requests returned valid assessments; three passed literal gates. Bank affiliation alone produced unsupported impersonation; a neutral OTP disclosure request produced unsupported urgency_pressure. These are category false positives even though their severity labels passed. The remaining three requests returned HTTP 429, and the runner stopped after three consecutive errors. They are not model-quality failures. Successful request latency p95 was 720.308 ms (five samples); this does not establish production end-to-end latency.

The bank-plus-OTP explanation also described an impersonation claim without citing the affiliation segment and asserted credential theft too strongly. Existing automated grading did not flag these narrative weaknesses.

## Candidate and remaining work

prompt-candidate-01.txt adds explicit category evidence requirements and limits claims of proven identity, successful theft, and fraud. It is an untested candidate, not a selected or production prompt. Neither the baseline prompt nor production prompt was changed. No withheld evaluation was run or used for tuning.

Further inference stopped on observed rate limiting. Resume with paced requests and respect provider Retry-After guidance; finish development comparison before selecting a candidate and running the frozen baseline/candidate withheld comparison. Rule-assisted outcomes remain unevaluated in this continuation. Do not claim accuracy or calibration from these synthetic samples.

## Budget

Existing budget.json was retained and extended by the guarded transport, with its original three reservations intact. Authorization remains US$3 total. Eleven cumulative attempts reserve US$0.056483; usage-based estimated cost is US$0.0022376 across five known-usage requests. Six attempts have unknown usage, including three earlier transport errors and three HTTP 429 responses. All reservations remain charged against the limit. Actual billing is unavailable. No reservations were refunded or reset.
