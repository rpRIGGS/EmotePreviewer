# Milestone 5 — exporter/consumer contract verification

Date: 2026-11-12

The EmotePreviewer batch exporter emits `manifest.json` with `schemaVersion: 1`, `format: "experimental-apng"`, and entries containing `id`, `source`, `category`, `command`, `media` and `format: "apng"`. Each media reference uses `previews/<outputStem>/<runId>/preview.png`. The PM Emotes manifest adapter accepts this envelope and path pattern.

Source hardening: reject duplicate published full identities and IDs before emitting the consumer manifest, so the consuming NUI never silently chooses one of two previews with the same source/category/command triple.

**Not yet verified:** Windows desktop capture and encoding, actual APNG playback in FiveM CEF, end-to-end exported asset installation, PM Emotes Node regression execution, placeholder and switching behavior in-game, and performance. A GitHub connector read does not constitute running these tests.

Suggested validation sequence: (1) run the EmotePreviewer TypeScript and .NET checks on Windows; (2) export a small mixed catalog including shared and duplicate-command cases; (3) inspect manifest and verify every media path exists; (4) run `node --test tests/preview-*.test.mjs` in PM Emotes; (5) install the export and test APNG/fallback/focus switching in FiveM; (6) measure resource use with a larger catalog.
