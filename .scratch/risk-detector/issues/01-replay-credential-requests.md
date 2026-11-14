# 01: Replay a call and detect credential requests

**What to build:** A developer can replay a synthetic English call as JSON events through a public detector interface and observe immediate, explainable credential-disclosure warnings. This is the first runnable vertical slice, including validation, redaction, mock assessments, output and tests. Reconcile the incomplete scaffolding with the approved spec; do not assume it is runnable or correct.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Document the provisional input contract: call ID, monotonic sequence, segment ID, speaker/track, start/end timestamps, text and partial/final status. Validate input before state changes.
- [x] Expose a public detector interface for event ingestion and assessment updates, and drive it from a local JSON replay command. No HTTP service or dashboard is required.
- [x] Emit structured results with call identity, assessment sequence, processed-through input sequence, severity, categories, evidence, explanation, recommended action, warning state, provider source and processing health.
- [x] Default to credential-free mock mode, clearly labelled in every result. Model score is nullable before assessment, explicitly uncalibrated afterward; calibrated probability remains null. Never substitute rule confidence for a model score.
- [x] Finalized requests to disclose an OTP/password raise a critical advisory warning without waiting for the provider. A harmless mention, a warning against sharing, and entering a code in the user's own official app do not trigger credential-disclosure warnings.
- [x] Redact fixture passcodes, passwords and account identifiers before provider-bound context, emitted evidence and ordinary logs. Preserve the unsafe request's meaning; document best-effort English redaction limitations.
- [x] Every warning cites actual retained redacted segments with their original track and timestamps; no verified speaker identity is inferred.
- [x] Replay benign service, explicit OTP-request and benign security-discussion scenarios. Tests exercise the public interface with an injected mock provider and assert external results.
- [x] Include reproducible setup and replay instructions and a sample input/output. Required checks run without credentials or paid calls.

## Comments

Source: approved Hackathon MVP specification and five-ticket breakdown. Later tickets add broader indicators, delivery resilience and live provider behaviour; this ticket must already demonstrate one complete safe path and one complete warning path.

## Answer

Implemented the public `Detector` interface, synchronous credential warning updates, detached snapshots, injected/default mock provider assessment, call completion/cleanup, redacted retained evidence, strict pre-mutation event validation and JSON replay. README documents the provisional input/output contract, synthetic scores, setup and best-effort redaction limitations. Three replay fixtures demonstrate service, OTP request and benign security discussion. All acceptance items above are implemented for this first slice; monotonic ordering enforcement, bounded/coalesced work and broader contextual rules remain assigned to follow-on tickets.

Checks: six detector behavior tests and three fixture replay tests pass; `npm run check` passes; `npm run replay -- fixtures/otp-request.json` runs successfully without credentials and emits immediate critical evidence with fixture account/OTP values redacted. The initial tsx CLI failed under the sandbox's `os.userInfo`; replay therefore compiles via TypeScript and runs the generated Node JavaScript.
