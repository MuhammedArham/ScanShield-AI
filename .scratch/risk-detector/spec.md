# Hackathon MVP: JSON transcript social-engineering detector

Status: ready-for-agent

## Problem Statement

The developer owns the risk-detection component of a phone-call security copilot. A separate component supplies an ongoing English transcription as JSON. The detector must recognize social-engineering indicators while the call is happening and supply explainable assessments that another component can display.

The hackathon needs a demonstrable, independently runnable MVP. It must distinguish unsafe requests from harmless mentions, retain context across turns, and communicate uncertainty and provider failures. A model-generated confidence number must not be represented as a validated probability.

## Solution

Build a stateful JSON-in/JSON-out detector with a local synthetic-call replay tool. Deterministic rules produce immediate warnings for explicit unsafe requests. Cerebras assesses finalized turns using recent redacted transcript context and relevant earlier evidence. The detector combines these into evolving risk assessments and deduplicated advisory warnings.

Provide a credential-free mock mode for repeatable demos and tests, plus an explicitly enabled live Cerebras mode. Return an uncalibrated model score and leave calibrated probability empty. Supply an evaluation report describing measured performance and limitations. Keep the implementation small enough for a hackathon; no full product dashboard or telephony stack is required.

## User Stories

1. As the detection developer, I want to replay synthetic JSON transcript events locally, so that I can demonstrate my component independently.
2. As the transcription integrator, I want a documented input contract, so that I can supply compatible events.
3. As the dashboard integrator, I want structured assessments, so that I can display risk and recommended actions.
4. As a protected participant, I want explicit credential requests identified promptly, so that I can avoid disclosing secrets.
5. As a protected participant, I want remote-access requests flagged, so that I can verify support before granting access.
6. As a protected participant, I want urgent payment redirection flagged, so that I can verify the destination.
7. As a protected participant, I want manipulation assessed across turns, so that gradual escalation is recognized.
8. As a protected participant, I want harmless security discussions distinguished from unsafe requests, so that warnings remain useful.
9. As a protected participant, I want ambiguous conversations to remain uncertain, so that unsupported accusations are avoided.
10. As a protected participant, I want unresolved warnings preserved when the subject changes, so that dangerous evidence is not forgotten.
11. As a dashboard integrator, I want stable warning identities, so that duplicate updates do not create repeated alert cards.
12. As a reviewer, I want evidence linked to transcript segment IDs, so that I can inspect why an assessment was raised.
13. As a reviewer, I want evidence attributed to its actual speaker or track and time, so that statements are not misattributed.
14. As a protected participant, I want sensitive values redacted before external analysis, so that unnecessary disclosure is reduced.
15. As an integrator, I want partial and final segments distinguished, so that mutable transcription does not become canonical evidence.
16. As an integrator, I want duplicate events handled consistently, so that replay or delivery retries do not multiply alerts.
17. As an integrator, I want malformed or missing data reported explicitly, so that failures do not appear as low risk.
18. As a protected participant, I want provider outages shown as degraded analysis, so that I know monitoring is incomplete.
19. As a protected participant, I want deterministic warnings to continue during model failure, so that explicit unsafe requests still trigger advice.
20. As the detection developer, I want a mock provider, so that routine tests require no paid API calls.
21. As the detection developer, I want an opt-in Cerebras adapter with server-side credentials, so that I can demonstrate real classification when access is available.
22. As an evaluator, I want labels for successive conversation prefixes, so that early detection is measured without seeing future turns.
23. As an evaluator, I want false alerts, missed scenarios and warning latency reported separately, so that limitations are visible.
24. As a viewer, I want model confidence clearly marked as uncalibrated, so that I do not mistake it for measured certainty.
25. As a future maintainer, I want setup instructions and known limitations, so that the hackathon demo can be reproduced.

## Implementation Decisions

- Scope is the detector and local replay, using TypeScript and strict runtime schema validation. Transcription production and dashboard presentation belong to other components.
- Use a public detector interface as the primary integration and testing boundary. It accepts events, exposes assessment updates, and supports explicit call completion and cleanup. A network service is optional, not a prerequisite for MVP acceptance.
- The provisional transcript contract includes call ID, monotonic event sequence, segment ID, speaker or track identifier, start/end timestamps, text, and final/partial status. The exact upstream shape remains adjustable through an adapter. Do not assume speaker identity from track labels.
- Separate mutable partial previews from finalized canonical segments. Schedule Cerebras work on finalized turns; deterministic inspection of partials is optional and must not generate durable duplicate evidence.
- Validate events before state changes. Deduplicate repeated delivery; final segments are immutable. Reject conflicting duplicate IDs explicitly. Detect ordering gaps or rejected late events and expose incomplete input as degraded health rather than silently discarding it.
- Isolate per-call state. Bound transcript context and pending work. Retain unresolved indicators and the redacted evidence needed to explain existing warnings, even when older ordinary context leaves the rolling window. Ended calls must release memory; exceeding a documented bound must be observable.
- Redact sensitive values before provider requests, ordinary logs, and retained evidence. Preserve the requested action and secret type. Redaction is best effort for the English MVP; document uncovered cases. No raw audio storage or transcript persistence is needed.
- Deterministic detection evaluates requested actions in context, including negation and benign counterexamples. An explicit request to disclose an OTP or password produces a critical advisory warning. Remote access and urgent payment redirection produce high warnings when supported by evidence. Mere words or authority claims do not establish malicious behaviour.
- Cerebras receives a fixed detection rubric, examples, recent sanitized turns, and relevant earlier indicators. Transcript speech is untrusted data and cannot override the instructions. Model selection is environment-configured and account availability must be verified during setup.
- Request schema-constrained JSON; validate the completed response locally and check every cited evidence ID against the exact context supplied. Malformed output, unknown evidence, timeout or transport failure cannot lower risk or clear warnings.
- Provider output includes severity, raw model score, categories, evidence IDs, concise explanation, recommended action, and insufficient-evidence status. Application output additionally carries call identity, assessment sequence, processed-through input sequence, provider source, processing health, warning state, and null calibrated probability. Provider source explicitly distinguishes mock from Cerebras.
- Severity describes unsafe-action urgency; the raw score describes model-assessed social-engineering indicators. Neither proves caller intent. Do not substitute a rule score for model confidence. Before a valid model response, the model score may be null.
- Deterministic aggregation preserves strong rule warnings regardless of a lower model assessment. Maintain stable alert IDs and suppress repeated identical warnings for the same evidence within 30 seconds. Ordinary subsequent conversation does not resolve an unsafe request. Automatic resolution/decay is deferred; warnings remain unresolved through call end in this MVP.
- Publish deterministic warnings without waiting for Cerebras. Allow at most one provider request in flight per call; coalesce pending updates while retaining finalized transcript evidence. Associate results with the input sequence assessed, and prevent an older response from overwriting newer state.
- Use bounded provider timeouts and explicit error status. Avoid unbounded retries and request queues. A later valid response can restore provider health, while unresolved input gaps remain visible independently.
- Default to a mock provider with no credentials. Live mode requires explicit selection plus a key and model configured server-side. Mock scores and evaluation results must be labelled synthetic and cannot substantiate Cerebras quality.
- The target is warning delivery within three seconds of finalization at p95 in a controlled test environment. Measure local deterministic latency separately from model latency. True audio-to-warning latency and live accuracy remain unverified until connected testing.

## Testing Decisions

- Test externally observable behaviour through the public detector/replay boundary. Inject a mock provider behind that boundary to simulate valid assessments, outages, delays and invalid responses. Assert warnings, evidence, ordering, health, redaction and scores rather than internal helper calls or prompt wording.
- There is no established runnable test suite in the repository. The recently started scaffolding is incomplete and is not evidence of an existing convention or passing implementation.
- Fixtures include a benign service call, OTP request following a bank claim, remote-access helpdesk request, urgent payment redirection, benign OTP training, friendly rapport followed by secrecy/unsafe action, and spoken prompt injection.
- Include benign counterexamples such as “never share your OTP,” legitimate entry into an independently opened official app, and a mere bank employment claim. Prefix labels reflect only what is observable at that moment.
- Verify duplicate delivery, partial-to-final transitions, sequence gaps, conflicting IDs, malformed input, concurrent calls and call cleanup. Verify evidence preserves track and timestamp and resolves to retained redacted segments.
- Verify a model failure or contradictory assessment cannot erase deterministic warnings; unknown evidence and malformed output produce degraded health. Verify bounded concurrency, pending-update coalescing, and stale result handling with controlled delayed responses.
- Inspect provider-bound requests and emitted evidence for fixture secret values. Test provider request/response parsing with mocked transport, including timeout, non-success status and truncated responses.
- Initial acceptance gates: every agreed unsafe fixture receives its expected high/critical warning by its labelled trigger boundary; zero critical warnings on the benign fixture set; all evidence resolves; no repeated identical warning for the same evidence within 30 seconds; injected loss and provider failure are visible.
- Report per-scenario results, false high/critical alerts, missed expected warnings, time to first useful warning, and latency distributions. Report the sample count and provider mode. The three-second target is measured, never inferred from request speed alone.
- Keep all prefixes from one conversation in the same evaluation split. Synthetic fixtures establish demo correctness, not production precision, recall or probability calibration. Live Cerebras evaluation is a separate opt-in check and must be described as unverified if not run.

## Out of Scope

- Training model weights, fine-tuning infrastructure, or claiming calibrated probabilities.
- Audio capture, Twilio integration, transcription generation, or arbitrary mobile-call monitoring.
- A full dashboard, authentication, tenant management, deployment or production security hardening.
- Database persistence, retention jobs, raw audio storage, Redis and distributed processing.
- Multilingual guarantees, voice biometrics or verified speaker identity.
- Autonomous call interruption, speech output, payments or enforcement.
- Automatic warning resolution, exhaustive PII detection and production-quality accuracy claims.

## Further Notes

This spec synthesizes the accepted grilling answers and the user's hackathon constraint. The agreed first milestone is a complete local replay demonstration, not the full handover application. The primary test boundary was accepted during the grilling discussion.

Setup documentation must distinguish mock and live modes, explain input adaptation, list environment variables and include a sample replay command and output. English support, redaction limitations, in-memory limits and unverified live dependencies must be explicit.

Implementation was started prematurely before the request to use to-spec. Partial scaffolding exists but has not been installed, tested or validated. It is not authoritative and must be reconciled with this spec when implementation is requested. No further implementation is part of this specification task.
