# 04: Add Cerebras assessments with safe failure handling

**What to build:** A developer can explicitly enable live Cerebras classification for finalized transcript turns, while replay and mocked transport verify safe behaviour during delayed, contradictory, malformed or unavailable provider responses.

**Blocked by:** 02: Detect escalation across conversation turns; 03: Handle unreliable transcript delivery.

**Status:** resolved

- [x] Keep mock mode the default. Live mode requires explicit selection, a server-side API key and an environment-configured model. Missing live configuration fails clearly; no silent fallback labelled as live.
- [x] Configure the adapter against current official Cerebras documentation and document model/account setup. Do not hardcode an assumed available model or expose provider secrets.
- [x] Send only sanitized finalized context, relevant earlier indicators and a fixed detection rubric with benign counterexamples. Treat spoken prompt injection as untrusted evidence, never as instructions.
- [x] Request structured JSON and validate completed results for severity, bounded uncalibrated score, categories, evidence IDs, explanation, recommended action and insufficient-evidence status. Calibrated probability remains null.
- [x] Validate evidence IDs against the exact request context. Unknown evidence, malformed/truncated output, non-success responses and timeouts are rejected and visibly degrade provider health.
- [x] Maintain at most one in-flight assessment per call and coalesce pending updates without dropping canonical transcript evidence. Bound timeout and retries; no unbounded queues.
- [x] Associate responses with the input sequence assessed. A stale response cannot overwrite newer warnings, claim later turns were assessed or revive a completed call.
- [x] Publish deterministic warnings immediately during provider work. Lower or failed model assessments cannot clear unresolved safety warnings. Valid later responses can restore provider health while input-gap degradation remains independently visible.
- [x] Exercise the public detector with mocked transport/provider responses covering successful escalation, insufficient evidence, contradiction, prompt injection, timeout, malformed output, invented evidence, rapid turns, stale completion and recovery.
- [x] Inspect captured provider-bound requests for fixture secrets. Distinguish rule, mock and Cerebras output sources.
- [x] Provide an opt-in live replay procedure and report its verification status honestly. Lack of credentials does not block completion of mocked integration tests or authorize claiming live quality.

## Comments

Source: approved Hackathon MVP specification. Fine-tuning weights, probability calibration and production accuracy claims remain out of scope. A synthetic mock cannot establish how a live model responds to injection or ambiguous language.

## Answer

Implemented explicit `RISK_PROVIDER=cerebras` selection via `providerFromEnvironment`; mock remains the default even when credentials exist. Live configuration requires both server-side key and account-enabled model. The adapter uses the researched official chat-completions structured-output protocol, validates completion envelopes and bounded JSON, and exposes safe generic transport errors.

The public detector validates schema, exact supplied evidence IDs, evidence capacity and insufficient-evidence severity before accepting any score. Valid assessments become source-attributed unresolved warning cards; rule cards survive contradictions, provider failure and recovery. `latestAssessment` retains the sanitized validated result and assessed sequence; call snapshots expose active/ended lifecycle.

Scheduling retains one physical assessment per call with a single coalesced latest pending sequence. Context is built at launch from bounded rolling finalized segments and retained warning evidence. The default deadline is 2500ms, cancellation aborts on end, flush completes after deadlines, and identity guards suppress late results after call ID reuse. If a custom provider ignores abort, health degrades and flush returns but the physical slot remains occupied until the underlying promise settles; further attempts for that call wait rather than accumulating parallel requests. No retries.

Validation: 26 targeted provider/config/core detector tests passed and TypeScript check passed. Coverage includes mocked HTTP schema/auth/cancellation, sanitized cross-turn evidence, spoken injection kept in data, malformed/unknown/out-of-range/truncated/non-success output, timeout with ignored abort, coalescing, retained rules, failed/recovered providers, input-gap independence, reused IDs, and evidence capacity. Live Cerebras quality and account compatibility remain unverified: no credentialed live request was made. README/live procedure is completed with ticket 05 integration docs.

Final integration verification: pending work is bounded and retains every accepted unassessed final; provider cancellation, warning provenance, input health, and the standalone delivery-gap replay are implemented. The complete source suite passes 62 tests across eight files; TypeScript checking passes. See the implementation review and evaluation reports for review fixes and measured synthetic results. Live Cerebras remains unverified.
