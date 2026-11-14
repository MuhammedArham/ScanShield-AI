# Normal calls and staged synthetic scams

Frozen candidate: prompt-candidate-03.txt with low reasoning effort. Twelve independent prefix/full-call transcript assessments, not telephone or speech-to-text tests. The before/after prefixes contain only turns available at that point.

| Scenario | Model severity | Literal model gates |
| --- | --- | --- |
| normal-clinic-call | none | pass |
| normal-bank-own-app | none | pass |
| normal-scheduled-support | none | pass |
| normal-family-surprise | none | pass |
| normal-retail-deadline | none | pass |
| normal-reported-scam | none | pass |
| staged-bank-before-request | none | missing-uncertainty |
| staged-bank-after-request | critical | pass |
| staged-remote-before-request | none | pass |
| staged-remote-after-request | high | missing-evidence:s2 |
| staged-investment-before-request | none | pass |
| staged-investment-after-request | high | pass |

All six ordinary calls returned none with no categories. All three harmful completions were detected at high/critical; their three harmless prefixes remained none. Strict model gates passed 10/12: one missing uncertainty flag and one omitted earlier tool-name citation. No further prompt tuning was performed after selection.

The original rule-assisted snapshot falsely warned on the refused historical password quote. A regression first reproduced that rule failure; a narrow reported-and-refused-clause exception fixes it while separate current requests still warn. Replaying the same cached model outputs through the corrected engine passes 12/12 severity/category/required-evidence gates with no high/critical ordinary-call warnings. This does not erase the two model-only metadata/provenance failures.

Cached replay is a final engine-outcome check, not a measured live per-turn timeline. All normal/scam roles are synthetic labels; no real caller identity is verified. Natural phrasing, larger samples, genuine call transcripts, multilingual speech, redaction leakage, long-call memory and transcription errors remain unvalidated. Refused-report handling is a narrow heuristic, not general understanding of all quoted speech.

See [context-memory.md](context-memory.md) for the 40-segment ordinary-history limitation and tested call isolation.
