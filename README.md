# English transcript risk detector

A local TypeScript JSON-in/JSON-out hackathon component for observable social engineering. Warnings identify unsafe requests and offer advice. Track labels do not establish identity or prove malicious intent. A local testing dashboard is available alongside the JSON interface.

Use Node.js 22.12+ (tested here with 24.13.0) and npm. Clean-install checks:

```sh
npm ci
npm run check
npm test
npm run build
```

Reproduce the demo in PowerShell:

```powershell
$env:RISK_PROVIDER = 'mock'
npm run replay -- fixtures/benign-service.json
npm run replay -- fixtures/otp-request.json
npm run replay -- fixtures/escalation-remote.json
npm run replay -- fixtures/delivery-gap.json
npm run evaluate
```

The safe call stays clear; the OTP call becomes critical; remote access becomes high at sequence 3 and retains its warning; the gap call exposes degraded input health while retaining its warning. Replay prints JSON snapshots on updates. `npm run dev -- fixtures/otp-request.json` aliases replay. Build/replay/evaluate compile TypeScript to `dist/`. Evaluation explicitly uses synthetic mocks even if live credentials exist. For pure JSON run `node dist/src/evaluate.js > evaluation-report.json` after building. Failed gates set a nonzero exit code. See [evaluation notes](docs/evaluation.md) for results and limitations.

Input is a strict object:

```json
{"callId":"demo","sequence":1,"segment":{"id":"s1","speaker":"track-a","startedAtMs":0,"endedAtMs":1200,"text":"Please read me your OTP.","final":true}}
```

Call/segment IDs contain 1–80 ASCII letters, digits, underscores or hyphens; speaker labels allow the same alphabet up to 40 characters. Text is 1–4000 characters. Times are nonnegative milliseconds with end at least start. Sequence is a nonnegative integer in the schema; begin at 1 and advance by one for healthy delivery. Gaps permanently degrade input health for the call. Unknown fields and malformed objects are rejected. Adapt upstream STT events to stable call IDs, stable segment IDs, monotonic delivery sequences, unverified speaker tracks and finalized utterance boundaries. Partial previews are not finalized evidence.

Import `Detector` from `src/detector.ts` (compiled: `dist/src/detector.js`). `new Detector({provider?, assessmentTimeoutMs?, onUpdate?, limits?})` defaults to mock. `ingest(unknown)` creates calls and returns a detached snapshot synchronously; finalized requests can produce immediate deterministic warnings. `snapshot(callId)` returns current state. `await flush(callId)` waits for scheduled/coalesced assessment. `await endCall(callId)` returns `callState: "ended"`, cancels provider work and releases the call. Unknown call IDs throw. `replay(events, options)` uses this same public boundary.

An immediate response includes these fields (complete snapshots also include explanation, action, warnings and attributed evidence):

```json
{"callId":"demo","callState":"active","assessmentSequence":1,"processedThroughSequence":1,"modelAssessedThroughSequence":null,"latestAssessment":null,"severity":"critical","categories":["credential_theft"],"warningState":"unresolved","rawModelScore":null,"modelScoreCalibration":"uncalibrated","calibratedProbability":null,"providerSource":"mock","processingHealth":{"provider":"pending","input":"healthy"}}
```

`processedThroughSequence` tracks accepted delivery; `modelAssessedThroughSequence` and `latestAssessment.assessedThroughSequence` identify the provider's assessed prefix and reveal lag. Top-level severity is the strongest unresolved warning. `rawModelScore` and `latestAssessment` describe the latest valid provider assessment, so a low score can coexist with a retained critical warning. A later benign assessment cannot clear warnings. Warnings have stable IDs, source, category, evidence IDs/tracks/timestamps and redacted text. Repeated requests merge into category warnings; suppression lasts the call, including the required 30-second window. `assessmentSequence` orders published updates. Provider health is pending/healthy/degraded independently of sticky input-gap health. Provider failure cannot erase warnings.

Exact delivery duplicates are idempotent. Mutable partials can be finalized once. Conflicting final revisions, reused conflicting sequence numbers, late events and capacity breaches throw `InputError` with `code` (`invalid_event`, `conflict`, `late_event`, `capacity`). Valid-call rejections degrade input health; malformed input is rejected before state mutation. Errors omit transcript text.

Default in-memory bounds: 32 active calls; per call, 40 recent finalized context segments, 40 pending finalized segments, 1000 distinct segment IDs, 4000 delivery events and 100 retained evidence segments. Context also includes retained warning evidence. Limits reject overload visibly; end calls to release slots. There is no persistence or horizontal coordination.

Assessment timeout defaults to 2500 ms. Rapid finalized turns coalesce into the newest pending context while one request runs. A provider ignoring cancellation can keep running after timeout: degradation is published and `flush` can return; subsequent provider work waits for actual settlement to prevent physical overlap on that call. Synchronous rules continue.

Live Cerebras replay is opt-in. `npm run replay` (and `npm run dev`) automatically loads a local `.env` when present using Node's built-in environment-file support. Existing shell variables take precedence. Keep the file local; it is ignored by Git. Set these values in `.env`:

```dotenv
RISK_PROVIDER=cerebras
CEREBRAS_API_KEY=<server-side key>
CEREBRAS_MODEL=<model enabled on your account>
```

Then run:

```powershell
npm run replay -- fixtures/otp-request.json
```

Use `RISK_PROVIDER=mock` for credential-free replay. The evaluator always uses mocks and does not enable live calls from `.env`. Running the compiled replay directly requires `node --env-file-if-exists=.env dist/src/replay.js fixtures/otp-request.json` or explicitly exported environment variables.

Missing live configuration fails clearly. A key alone never enables live calls. The adapter validates structured output, known evidence and sufficient evidence for high/critical assessments; failures expose degraded health. Live gpt-oss-120b has been exercised on synthetic transcripts; see [verification results](docs/tuning/results.md). Its selected prompt uses low reasoning effort. These small checks do not establish production accuracy or end-to-end latency. Raw scores are uncalibrated indicators; calibrated probability is always null. Mock assessments reuse rules and establish neither Cerebras quality nor real-world precision/recall.

Redaction precedes provider context and retained/emitted evidence. Numeric strings, emails and explicit secret declarations are masked best effort. Arbitrary spoken secrets, spelled-out numbers, unlabelled alphanumerics, unfamiliar formats and other languages may escape masking. Use synthetic fixtures. English-first heuristics can miss paraphrases/context or raise false warnings. Finalized-JSON receipt timing excludes audio, STT, networking and upstream finalization; the live three-second finalized-phrase-to-warning target remains unverified, and audio-to-warning latency is unmeasured.

Production scope excludes telephony/STT ingestion, verified speaker identity, automatic intervention, authentication, encryption infrastructure, persistent audit storage, dashboards, deployment, multilingual detection, probability calibration and fine-tuning.

## Local testing dashboard

Run `npm run ui`, then open http://127.0.0.1:4317. It binds to loopback only. Default mode is free, rule-based mock assessment, irrespective of the RISK_PROVIDER environment setting. Select Cerebras explicitly for real gpt-oss-120b assessments; credentials remain on the server. Live UI requests share docs/tuning/budget.json, its exclusive lock, retained reservations, 300-request maximum and the existing US$3 total authorization. No extra allowance is created.

Load a scenario, then use Next turn or Run scenario. You can also write a custom turn and choose the speaker. Live replay is paced at least 13 seconds between requests and pauses on provider degradation. New call resets unresolved warnings and context. The dashboard shows aggregate retained risk, the latest uncalibrated score, latest provider explanation, uncertainty, source-attributed warnings, evidence, health, latency and downloadable redacted JSON. Mock scores are synthetic; no score is a measured fraud probability. Reported request latency does not include audio/STT.

The two-minute bank-support scenario contains ten turns and 274 words, starting routinely before escalating to urgency and an OTP request. Its text is at fixtures/two-minute-bank-call.txt; the companion JSON includes the intended 120-second transcript timestamps and can also be used with `npm run replay -- fixtures/two-minute-bank-call.json`. Dashboard turns use simulated two-second timestamp slots; live replay pacing is separate. Call state is memory-only; normal assessed context is bounded to 40 recent segments plus pending/evidence. Redaction is best effort.
