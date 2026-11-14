# 02: Detect escalation across conversation turns

**What to build:** A replayed call can progress from ordinary rapport to unsafe requests, producing evidence-based remote-access, payment and credential warnings while retaining unresolved earlier indicators.

**Blocked by:** 01: Replay a call and detect credential requests.

**Status:** resolved

- [x] Add contextual remote-access and urgent payment-redirection rules, with high warnings for supported unsafe requests and clear advisory actions.
- [x] Mere authority claims, negation, reported security advice and training mentions do not independently produce high/critical warnings. Include benign counterexamples and ambiguous examples.
- [x] Maintain rolling finalized context and relevant earlier indicators for provider assessment; evidence attribution remains tied to the original speaker/track and timestamp.
- [x] Replay a friendly opening followed by secrecy and an unsafe request. Assess prefixes using only information available at that point; do not label the innocent opening using the later outcome.
- [x] Preserve existing unresolved warnings through subject changes and lower provider assessments. Deterministic critical warnings cannot be downgraded by the model.
- [x] Use stable warning identities and suppress repeated identical warnings for the same evidence within 30 seconds, while incorporating genuinely new evidence or increased severity.
- [x] Retain redacted evidence supporting active warnings when ordinary transcript context leaves the rolling window. Automatic warning resolution/decay remains out of scope.
- [x] Tests through replay/public detector behaviour cover remote-access requests, urgent payment changes, gradual escalation, ambiguity, repeated delivery of evidence and subsequent benign conversation.
- [x] Update example replays and documentation so the new behaviours can be demonstrated independently of live services.

## Comments

Source: approved Hackathon MVP specification. Mock demonstrations validate application behaviour, not Cerebras classification quality.

## Answer

Implemented clause-scoped credential, remote-access and urgent payment checks plus narrow same-speaker contextual references to previously named tools and transfers. Warnings retain original segment attribution. Negation and explicit training examples are benign; a separate actual request after a training/advice clause is still detected. Authority claims and ambiguous tool discussions alone remain unflagged.

Coordinated with ticket 03: the engine supplies preceding rolling context, merges stable category warnings with new evidence, preserves unresolved warnings and retains their redacted evidence beyond ordinary context limits. Existing ticket 03 public tests cover delivery deduplication and retention. Added independently replayable remote, payment and benign fixtures with synthetic prefix labels; README example documentation is integrated by the main implementation owner.

Validation: `npm test -- tests/escalation.test.ts` passes 11 public detector tests; `npm run check` passes. Each newly implemented behavior was exercised as a failing public test before its implementation. Prefix fixtures are assessed in order without future turns. This remains a narrow English deterministic/mock demonstration; it does not validate live provider quality.
