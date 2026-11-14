# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation tickets are separate files at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state as a `Status:` line near the top of each ticket, using `triage-labels.md`.
- Append comments under a `## Comments` heading.

## Publishing and fetching

When a skill says to publish to the issue tracker, create the appropriate spec or ticket file under `.scratch/<feature-slug>/`.

When fetching a ticket, read the referenced path. Resolve a bare issue number within the specified feature; ask when the feature is ambiguous.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, containing Notes, Decisions-so-far, and Fog.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`, with the question in the body.
- Type: a `Type:` line containing `research`, `prototype`, `grilling`, or `task`.
- Blocking: a `Blocked by: NN, NN` line near the top; a ticket is unblocked when all listed tickets are resolved.
- Frontier: open, unblocked, unclaimed tickets, ordered by number.
- Claim: set `Status: claimed` and save before work.
- Resolve: append the answer under `## Answer`, set `Status: resolved`, and append a short answer and link to the map's Decisions-so-far section.

Wayfinding uses `claimed` and `resolved` for progress; the five triage statuses apply when triaging incoming work.
