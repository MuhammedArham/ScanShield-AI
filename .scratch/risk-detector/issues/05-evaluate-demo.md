# 05: Evaluate and package the hackathon demo

**What to build:** A developer can reproduce the complete MVP demo and generate an evaluation report showing what was detected, missed, delayed or degraded, with clear separation between synthetic/mock checks and optional live Cerebras measurements.

**Blocked by:** 02: Detect escalation across conversation turns; 03: Handle unreliable transcript delivery; 04: Add Cerebras assessments with safe failure handling.

**Status:** resolved

- [x] Supply synthetic, human-reviewable fixtures for benign service calls, bank-claim-to-OTP requests, fake helpdesk remote access, urgent payment redirection, OTP training, gradual rapport/secrecy escalation and spoken prompt injection.
- [x] Label observable conversation prefixes and expected trigger boundaries, including severity and evidence. Keep all prefixes from one conversation in one evaluation split; do not infer early labels from future events.
- [x] Include imperfect-input and provider-failure scenarios through the same public detector/replay boundary as normal calls.
- [x] Generate a repeatable report with provider mode, sample counts, per-scenario outcomes, false high/critical alerts, missed expected warnings and time to first useful warning. Clearly identify unavailable or inapplicable metrics.
- [x] Measure deterministic and provider latency separately and report distributions, including p95 and sample counts. Assess the three-second finalized-phrase-to-warning target; do not describe local replay timing as measured audio-to-warning latency.
- [x] Gate the agreed unsafe fixtures on expected high/critical warnings by labelled boundaries and the benign fixture set on zero critical warnings. Verify valid evidence, 30-second duplicate suppression, visible injected failures and retained warnings.
- [x] Report calibration as unimplemented and probability as null. Mock results are labelled synthetic and do not establish real-world precision, recall or Cerebras quality.
- [x] Provide clean-install instructions, required commands, environment placeholders, sample JSON input/output, upstream adaptation guidance and a short reproducible hackathon demo sequence.
- [x] Document English-first scope, best-effort redaction, in-memory limits, opt-in live setup and verification status, and production features intentionally excluded.
- [x] Run the required type checks, automated tests and mock evaluation. Record actual results and remaining limitations without claiming unrun live integrations were verified.

## Comments

Source: approved Hackathon MVP specification. This ticket packages and evaluates existing vertical slices; it does not expand scope into a dashboard, telephony, deployment or fine-tuning.

## Answer

Implemented the mock-only evaluation API/CLI, independent prefix/evidence manifest and complete README demo/integration instructions. The final measured run passed 14 scenarios / 34 labelled prefixes, with zero false high/critical prefixes, zero benign critical prefixes and zero missed expected prefixes. Valid evidence, trigger boundaries, visible input/provider faults, retained warnings, exact delivery idempotency and repeated-request warning suppression are gated. Actual distributions and limitations are recorded in `docs/evaluation.md` and `docs/evaluation-report.json`; calibration remains unimplemented with null probability, and live Cerebras/audio latency remain unverified.

Checks run after source review: evaluator tests 3/3 passing; `npm run check`; `npm run build`; compiled evaluator exit 0. Empty-manifest CLI exit 1 verified. The coordinating task verified all 62 source tests across 8 files and final type checking, and owns the map update. README documents the actual compile-and-node scripts, explicit mock/live configuration, public API, limits, lag, pending-work semantics, best-effort privacy and excluded production scope.
