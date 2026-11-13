# Milestone 5 — exporter/consumer contract verification

Date: 2026-11-12

The EmotePreviewer batch exporter emits `manifest.json` with `schemaVersion: 1`, `format: "experimental-apng"`, and entries containing `id`, `source`, `category`, `command`, `media` and `format: "apng"`. Each media reference uses `previews/<outputStem>/<runId>/preview.png`. The PM Emotes manifest adapter accepts this envelope and path pattern.

Source hardening: reject duplicate published full identities and IDs before emitting the consumer manifest, so the consuming NUI never silently chooses one of two previews with the same source/category/command triple.

**Not yet verified:** Windows desktop capture and encoding, actual APNG playback in FiveM CEF, end-to-end exported asset installation, PM Emotes Node regression execution, placeholder and switching behavior in-game, and performance. A GitHub connector read does not constitute running these tests.

Suggested validation sequence: (1) run the EmotePreviewer TypeScript and .NET checks on Windows; (2) export a small mixed catalog including shared and duplicate-command cases; (3) inspect manifest and verify every media path exists; (4) run `node --test tests/preview-*.test.mjs` in PM Emotes; (5) install the export and test APNG/fallback/focus switching in FiveM; (6) measure resource use with a larger catalog.

## Preflight validation hardening

Before the first capture or filesystem write, the batch exporter now checks that every entry in the complete catalog has a nonempty source/category/command/ID, that each source/category/command triple is unique, and that every planned capture exactly matches its complete-catalog entry including the output stem. This closes the failure mode where duplicate identities would be discovered only after writing many APNG files. The post-capture manifest uniqueness check remains defense in depth.

## Case-folded identity collision prevention

The PM Emotes resolver compares command names case-insensitively. Preflight and publication uniqueness therefore normalize source/category/command to lowercase for collision detection while preserving original spellings in the manifest. This prevents an export containing both `wave` and `WAVE` from passing producer validation but becoming ambiguous to the consumer.

## Final publication checks (source implementation)

Before publishing metadata, the exporter rejects any complete manifest that reuses a media path across distinct entries or contains missing/invalid frame count, duration, frame rate, width or height. Retained incremental previews must carry valid capture metadata; old imported index records without it are not silently published as valid captures. The publication check runs after media generation but before the new manifest and index are emitted.

## Development completion versus deferred runtime acceptance

Milestone 5 source hardening and the CI verification workflow can be completed without a running FiveM server. **Milestone 5 runtime acceptance remains pending** until the existing Windows build, Node regression suites, APNG playback and end-to-end export/import checks execute successfully. Do not infer a passing test result from source review or a successful GitHub commit.

## Frame-profile invariants

The manifest publisher now checks that every newly captured or retained APNG reports the active render profile (12 fps, 320×320) and that frame count equals the ceiling of duration times frame rate, within the configured maximum duration. Existing-media verification alone cannot authorize a stale record with incompatible capture metadata. Invalid records stop manifest publication rather than entering the consumer library.

## Invalid coordinator inputs

Reject malformed batch plan/catalog arrays before any export work begins. Empty incremental plans remain supported when a valid complete catalog is supplied.

## Final metadata audit correction

Capture metadata is checked for finite numeric values before duration/frame arithmetic, preventing NaN imported metadata from bypassing comparison checks. The duplicate validation pass was consolidated. Added coordinator input and capture-profile preflight regression cases.

## Incremental source completion

The incremental planner now schedules recapture of existing media when its retained frame metadata is absent, inconsistent, or exceeds the fixed three-second render profile. This avoids turning an old incomplete index into a late export-wide failure. Export preflight rejects null catalog records, non-string identity fields, and malformed prior index containers. Dedicated regression tests cover unchanged valid metadata and invalid retained records.

## Additional incremental contract cases

The index parser now treats nonintegral frame counts and capture metadata exceeding the fixed profile as invalid, ensuring the incremental planner schedules regeneration. Tests cover added, changed, retry and rebuild plan membership. These are source-level regression cases; their execution remains to be verified.

## Publication safety pass

The exporter now rejects prototype-sensitive catalog IDs and malformed imported index records before writes. The index parser ignores array-shaped records. Cancellation is checked immediately before publishing metadata, including for no-op incremental batches. Added preflight and cancellation regression cases. Runtime validation is still a separate acceptance gate.

## Batch planning contract

Catalog planning rejects null and missing-ID inputs before sorting; regression cases cover deterministic ordering, unsupported entries, and distinct safe output stems for normalized command collisions. Source work is complete for these safeguards, with execution still pending CI.

## Final source-only handoff (2026-11-12)

The planned source hardening and regression coverage for Milestone 5 have been implemented and committed. A subsequent inventory identified additional source-review risks and documentation discrepancies; completion must not be inferred from the earlier handoff alone. This does **not** mean the release is accepted: runtime verification, CI execution, Windows desktop export, real GTA capture, and FiveM CEF playback remain deferred and should be revisited together when the environment is available. No further source changes should be represented as necessary merely because those external tests cannot run.

A failed recapture may retain last-known-good media only when its metadata matches the fixed capture profile. Otherwise the failed entry is recorded without retaining incompatible media, so a single legacy index record does not abort the entire manifest publication.
