# Local risk assessment testing UI

Status: resolved

A loopback-only dashboard backed by the actual Detector, supporting free mock or explicitly selected Cerebras mode. Expose retained risk, latest raw score labelled uncalibrated, provider explanation, uncertainty, warnings and evidence, health, latency, redacted JSON export, existing verification results and shared US$3 ledger. Include scenario replay, custom speaker turns, reset and a synthetic two-minute call. No new API allowance or browser-exposed key.

## Validation

Type checks and HTTP integration tests cover normal/scam transitions, evidence redaction, independent calls, retained warnings, input/origin validation, missing live configuration and unchanged budget bytes during mock tests. Browser preview could not be inspected because both the browser host and native computer-use pipe are unavailable.
