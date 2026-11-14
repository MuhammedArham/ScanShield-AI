# trustparty hackathon deployment

Public URL: https://scamshield-trusted-person-k7m4.limbergoby17.chatgpt.site/

- `/`: approved trustparty landing page and ephemeral trusted-person setup.
- `/app/`: existing transcript testing dashboard, browser rules-only mode.
- `/version.json`: GitHub source commit and build mode.
- `/health.json`: static deployment health. This is not model-provider health.

## Build and verify

Use Node 22.12+ and npm, from repository root:

```sh
npm ci
npm run check
npm test
npm run build:site
npm run test:site
```

`npm test` compiles first because the existing tuning-runner test executes compiled modules.

The deployable static folder is `dist/site/`; it includes the landing page, bundled existing detector dashboard, and source provenance. Serve it on any static HTTPS host. `/app/` needs directory-index support (`app/index.html`); no API server, secrets, database, custom domain, or paid model credits are required. Build from the intended clean Git commit so `version.json` identifies it correctly. `web/landing/` is the editable landing source; do not edit generated output.

GitHub Actions runs all checks and uploads `trustparty-public-site`. Sites publication is separate: copy the verified artifact to the existing Sites checkout's `dist/`, preserve its `.openai/hosting.json` project ID and public audience, push the Sites source snapshot, and save/deploy that exact commit. Keep `version.json` intact to trace the bundle to GitHub. A GitHub merge alone does not update the live Site.

## Demo script

1. Open the public page in a private browser window, including on a phone.
2. Choose a fictional trusted person, review, acknowledge the prototype limitation, and finish. No invitation or contact save should occur.
3. Open the testing prototype. It must say rules only, not connected to a live model.
4. Load the clinic scenario and run it: no warning is expected.
5. Load the bank-code scenario and advance through the request: a critical credential warning and attributed evidence should appear.
6. New session clears old warnings. Refresh clears the entire transcript session.
7. Use Back to trustparty. Verify keyboard focus, dialog Escape, and mobile layout.
8. Check `/version.json` against the intended GitHub commit, and `/health.json` for HTTP 200. Check that scripts/styles load anonymously.

## Limits and future integration

This is real execution of the repository's deterministic detector and mock provider, not paid AI inference. Scores are synthetic indicators, not fraud probabilities. It does not hear mobile calls, transcribe audio, verify identities, save trusted people, contact them, or protect phones. Use fictional transcript text. Redaction is best effort. Browser state disappears on reload; no persistence or upload is implemented.

The existing local Node dashboard remains available via `npm run ui` at localhost:4317. Its Cerebras mode requires explicit selection and server-side credentials, and uses the existing verification budget. No public paid mode is enabled by this deployment.
