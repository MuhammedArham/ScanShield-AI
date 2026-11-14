# Risk detector implementation map

## Notes

Public testing seams: detector ingestion/updates and JSON replay. Mock assessments are synthetic and uncalibrated. No Git repository exists in this workspace.

## Decisions-so-far

- [01: runnable credential-warning slice](issues/01-replay-credential-requests.md) resolved: `Detector` and replay are implemented; nine targeted tests and typecheck pass. Replay compiles TypeScript before Node execution to avoid the sandbox's tsx `os.userInfo` failure.
- [02: conversation escalation](issues/02-conversation-escalation.md) resolved: contextual requests, benign counterexamples, retained warnings and attributed evidence.
- [03: unreliable delivery](issues/03-unreliable-transcript-delivery.md) resolved: idempotency, immutable finals, sticky gap health, bounded state and cleanup.
- [04: Cerebras integration](issues/04-cerebras-assessments.md) resolved: explicit live opt-in, structured validation, bounded/coalesced pending evidence, timeout/cancellation, provenance and protected warnings; tested with mocked transport.
- [05: evaluation and demo](issues/05-evaluate-demo.md) resolved: 14 synthetic scenarios, 34 prefixes, zero expected misses or false high/critical prefixes; all evaluation gates pass.
- Final verification: 62 source tests across eight files and TypeScript checks pass. Test discovery excludes emitted build copies. Review regressions are covered; see [review](../../docs/implementation-review.md), [evaluation](../../docs/evaluation.md) and [setup](../../README.md).

## Fog

- Live Cerebras quality and availability remain unverified.
- Synthetic English heuristics and best-effort redaction do not establish real-world detection quality. Calibration, production deployment, telephony and a dashboard remain out of scope.
