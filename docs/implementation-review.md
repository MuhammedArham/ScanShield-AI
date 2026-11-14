# Hackathon detector implementation review

Review scope: the complete new detector implementation against the accepted local spec and tickets. This workspace has no Git repository, so the review used the source snapshot rather than a commit diff. Separate reviewers examined Standards and Spec. Evaluation packaging was also checked by the primary agent.

## Standards

No documented-standard violations were found. One judgment-call finding was raised: duplicated rule/model warning merge logic could preserve `source: rule` after Cerebras supplied a higher severity and new advice. The recommendation is one shared merge operation with explicit provenance, stable IDs and deduplicated evidence.

## Spec

1. **P1: unassessed turns could be lost during coalescing.** While one request was held open, trimming the rolling window could remove later turns before any provider assessment saw them, with healthy input status. Retain bounded pending evidence and explicitly reject/degrade on exhaustion.
2. **P1: redaction could remove an unsafe action after a secret declaration.** A declaration such as “Your OTP is 123456 and install AnyDesk now” lost the installation request. Preserve action text while redacting the sensitive value.
3. **P2: compound requests could lose warning categories.** Early returns meant one sentence requesting OTP disclosure, remote access and payment produced only the first category. Accumulate independently supported indicators.
4. **P1: benign advice could suppress a later unsafe request.** Whole-clause negation suppressed a request after a conjunction. Scope negation to the action it modifies.

## Evaluation packaging

An empty evaluation set must not pass acceptance gates. Evaluation must reject live-labelled injected providers rather than misreport their results as mock. Prefix-level false-alert/miss counts must be labelled with their actual units.

## Disposition

All listed findings were corrected. A bounded pending-evidence buffer preserves accepted unassessed finals and rejects overload visibly. Secret masking preserves following actions, independent categories accumulate, and conjunction handling no longer hides the reviewed unsafe requests. One warning merge operation preserves stable IDs and attributes promoted advice to its strongest contributor. Regression tests also cover quoted multiword passwords.

Evaluation rejects empty/incomplete sample sets and non-mock providers. Source-only test discovery prevents emitted build copies from inflating results. Final validation: 62 tests across eight files pass; TypeScript checking passes. The compiled synthetic evaluation passes 14 scenarios and 34 prefixes, with zero false high/critical or missed expected prefixes. See the evaluation report for measured sample counts and latency. No live Cerebras accuracy or availability claim is part of this review.
