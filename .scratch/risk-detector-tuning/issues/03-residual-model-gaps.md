# Residual model uncertainty and evidence gaps

Status: needs-triage
Type: task

The frozen selected model configuration passed 24/24 development gates, but added natural-call robustness samples exposed two narrower failures:

- staged-bank-before-request: severity none and no categories were correct, but insufficientEvidence was false despite an unverified affiliation alone.
- staged-remote-after-request: high severity and remote_access/secrecy_isolation were correct, but evidence omitted s2 (the earlier tool-name reference).

Do not hide these failures behind the rule-assisted result. Retain docs/tuning/candidate-03-robustness.json and the frozen prompt. Further prompt work should use a fresh development/withheld split rather than repeatedly optimizing the current withheld comparisons. These results do not establish production accuracy.

## Comments

Corrected engine replay recovers remote tool-name evidence through a rule and has no false warning in the six ordinary-call fixtures. Model-only strict gates remain 10/12.

The frozen withheld comparison also exposed omitted payment_redirection on the gift-card attack and omitted secrecy_isolation on the secret investment. Severity remained high/critical. The payment rule recovers the former; the latter remains a combined-engine category omission. Model-only withheld gates are 14/16 versus baseline 13/16; engine gates are 15/16 versus 14/16. Adoption favors observed warning behavior across all suites and does not resolve these category gaps.
