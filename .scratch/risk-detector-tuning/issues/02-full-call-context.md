# Full-call context beyond the rolling window

Status: needs-triage
Type: task

The current engine retains 40 ordinary assessed segments plus unassessed turns and warning evidence. It has no persistent/full-call memory or semantic summary. An early harmless tool mention ages out, which can leave a later pronoun without an antecedent.

Evaluate bounded structured per-call summaries or retrieval alongside explicit capacity, redaction, call isolation and restart requirements before claiming long-call coverage. Preserve the distinction between a quoted fact and a current unsafe request. Do not silently increase paid context or remove limits.

## Comments

The behavior is demonstrated in tests/context-memory.test.ts and documented in docs/tuning/context-memory.md. Short live call scenarios do not resolve this architectural limitation.
