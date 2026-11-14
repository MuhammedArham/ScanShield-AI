# Public hackathon prototype uses the shared detector in browser memory

Status: accepted for the hackathon prototype.

The approved trustparty landing page is already hosted publicly on Sites. The existing Node dashboard intentionally binds to localhost and depends on a file-based paid-inference budget. Publishing that server unchanged would be incorrect. No separate Node hosting account is connected.

Reuse the existing dashboard, Detector, schema, rules, and redaction. A build-time transport replacement implements the dashboard's existing request contract in browser memory with mockProvider only. A SHA-256 adapter preserves Node fingerprint behavior; it does not modify the detector. The public bundle has no live provider endpoint. A connect-src 'none' policy independently prevents outbound requests from the dashboard. Page/assets are served normally; transcript text and contact details are never sent by application code.

The public experience is rules-based, with synthetic uncalibrated indicators. It is not live model inference, telephony, an invitation service, or phone protection. Trusted-person setup remains separate and ephemeral. Reloading clears detector state; setup completion or close clears contacts. Each browser has independent bounded state. Existing synthetic scenarios are reused; no new simulated phone-call UI is introduced.

The local Node dashboard retains its original live-model opt-in and budget guard. Future live/public deployment requires a server-side secret, persistent shared budget, authorization and abuse limits, and explicit disclosure of transcript processing. Do not expose the localhost server by only changing its bind address.

Source belongs in GitHub. Sites deploys the generated dist/site assets. version.json records the GitHub source commit. CI produces a deployable artifact but does not automatically publish Sites without credentials.
