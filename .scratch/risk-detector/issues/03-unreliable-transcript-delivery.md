# 03: Handle unreliable transcript delivery

**What to build:** An integrator can replay imperfect or concurrent transcript streams and receive predictable assessments, explicit input-health warnings and bounded call-state behaviour, without silent evidence loss or cross-call contamination.

**Blocked by:** 01: Replay a call and detect credential requests.

**Status:** resolved

- [x] Distinguish mutable partial previews from immutable finalized canonical segments. Only finalized turns schedule model assessment; partial updates cannot create duplicated durable evidence.
- [x] Deduplicate identical event retries without repeated warnings. Reject conflicting duplicate IDs or changes to finalized text explicitly and without corrupting canonical evidence.
- [x] Handle sequence gaps, rejected late events and malformed input observably. Incomplete input is reflected in processing health rather than silently treated as a complete low-risk call.
- [x] Isolate state for concurrent calls, including transcript context, sequence tracking, warnings and provider work.
- [x] Define and document bounds for active calls, retained context/evidence and pending work. Enforce limits with visible outcomes; do not silently evict unresolved evidence or active calls.
- [x] Support explicit call completion and memory cleanup, including outstanding work. Preserve or return the final advisory result before releasing state; late responses cannot recreate ended calls.
- [x] Tests at the public detector boundary cover partial-to-final transitions, duplicates, conflicts, missing/out-of-order events, invalid payloads, concurrent calls, bound exhaustion and cleanup.
- [x] Provide a fault-injected replay demonstrating degraded input health and preserved deterministic warnings.

## Comments

Source: approved Hackathon MVP specification. This ticket can proceed alongside conversation escalation after the first runnable slice; neither should introduce internal-only test seams.


## Answer

Implemented the public detector delivery seam in `src/detector.ts`, verified through `tests/delivery.test.ts`. Event validation produces safe `InputError` codes (`invalid_event`, `conflict`, `late_event`, `capacity`) and an `inputHealth: degraded` error field without transcript values. Malformed events do not mutate existing state. Other rejected delivery/capacity events also publish degraded input health. Sequence starts at 1; sequence 0 and other late events reject. Gaps remain degraded after provider recovery.

Raw canonical segment fields are SHA-256 hashed before redaction for identity checks. Identical event retries return the current snapshot without publication; conflicting IDs and finalized text changes reject before canonical mutation. Partial updates have no durable evidence and do not schedule providers. Independent per-call state and cloned snapshots prevent contamination.

Defaults: 32 active calls, 40 rolling context segments, 1000 segment identities, 4000 accepted event identities and 100 retained warning-evidence segments per call. The `limits` constructor option permits smaller positive integer bounds. Bounds reject explicitly; hashes do not retain raw transcript values. Context trimming preserves unresolved redacted warning evidence. Rule warnings consolidate by category with merged evidence and cannot reduce existing severity. `endCall` returns immediately, releases the active call, and object-identity guards ignore late responses even if the call ID is reused.

Validation: `npx vitest run tests/delivery.test.ts tests/detector.test.ts` (13 tests passed), `npm run check` passed. Tests include a fault-injected public replay with missing and late events, preserving a critical warning after provider recovery. Pending-provider queue bounds, transport cancellation and model-warning aggregation are integrated under ticket 04; `fixtures/delivery-gap.json` supplies the fault-injected replay (sequence 1 OTP request, sequence 3 benign text); the main implementation pass documents its command. Provider queue/cancellation work is not claimed complete here.

Final integration verification: pending work is bounded and retains every accepted unassessed final; provider cancellation, warning provenance, input health, and the standalone delivery-gap replay are implemented. The complete source suite passes 62 tests across eight files; TypeScript checking passes. See the implementation review and evaluation reports for review fixes and measured synthetic results. Live Cerebras remains unverified.
