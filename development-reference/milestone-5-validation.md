# Milestone 5 — exporter/consumer contract verification

Original review date: 2026-11-12
Current status: November 13, 2026

## Current cross-repository verification

The historical “not yet verified” entries below describe the November 12 checkpoint and are superseded by this current status. On November 13, the producer contract was checked against PM Emotes master commit `70398ec8b4d8eea376d59a592c73c9cde57abde6`: schema version 1, `experimental-apng`, identity fields (`id`, `source`, `category`, `command`), `format: "apng"`, and the immutable `previews/<stem>/<runId>/preview.png` path agree. PM Emotes' full Node suite passed **23 tests**, including its packaged empty-manifest check. EmotePreviewer's web suite passed **92 tests** and `npm run build` passed locally. GitHub Actions run `43368761952` passed frontend tests/build, Windows .NET build/tests, self-contained publish and distribution packaging; its artifact remains available until December 13, 2026.

Still pending are a real export from the user's GTA V Legacy installation and installation/playback in FiveM CEF. These require the Windows desktop and development server; no source test proves capture quality, CEF animation, live fallback, performance or gameplay integration.

The EmotePreviewer batch exporter emits `manifest.json` with `schemaVersion: 1`, `format: "experimental-apng"`, and entries containing `id`, `source`, `category`, `command`, `media` and `format: "apng"`. Each media reference uses `previews/<outputStem>/<runId>/preview.png`. The PM Emotes manifest adapter accepts this envelope and path pattern.

Source hardening: reject duplicate published full identities and IDs before emitting the consumer manifest, so the consuming NUI never silently chooses one of two previews with the same source/category/command triple.

**At this November 12 checkpoint, not yet verified:** Windows desktop capture and encoding, actual APNG playback in FiveM CEF, end-to-end exported asset installation, PM Emotes Node regression execution, placeholder and switching behavior in-game, and performance. The PM Emotes source tests have since run successfully; the desktop/server checks remain open.

Remaining acceptance sequence: (1) on Windows, load real GTA V Legacy assets and export a small mixed catalog including shared and duplicate-command cases; (2) confirm the manifest and every referenced media file; (3) install the export in PM Emotes; (4) test selected APNG playback, placeholder fallback, selection/close cleanup, and normal RPEmotes behavior in FiveM; (5) measure resource use with a larger catalog.

## Preflight validation hardening

Before the first capture or filesystem write, the batch exporter now checks that every entry in the complete catalog has a nonempty source/category/command/ID, that each source/category/command triple is unique, and that every planned capture exactly matches its complete-catalog entry including the output stem. This closes the failure mode where duplicate identities would be discovered only after writing many APNG files. The post-capture manifest uniqueness check remains defense in depth.

## Case-folded identity collision prevention

The PM Emotes resolver compares command names case-insensitively. Preflight and publication uniqueness therefore normalize source/category/command to lowercase for collision detection while preserving original spellings in the manifest. This prevents an export containing both `wave` and `WAVE` from passing producer validation but becoming ambiguous to the consumer.

## Final publication checks (source implementation)

Before publishing metadata, the exporter rejects any complete manifest that reuses a media path across distinct entries or contains missing/invalid frame count, duration, frame rate, width or height. Retained incremental previews must carry valid capture metadata; old imported index records without it are not silently published as valid captures. The publication check runs after media generation but before the new manifest and index are emitted.

## Development completion versus deferred runtime acceptance

Milestone 5 source hardening, regression suites and Windows CI verification are complete. **Milestone 5 runtime acceptance remains pending** until real desktop capture and end-to-end export/import/playback checks succeed. Do not infer a passing runtime result from source tests or a successful GitHub commit.

## Frame-profile invariants

The manifest publisher now checks that every newly captured or retained APNG reports the active render profile (12 fps, 320×320) and that frame count equals the ceiling of duration times frame rate, within the configured maximum duration. Existing-media verification alone cannot authorize a stale record with incompatible capture metadata. Invalid records stop manifest publication rather than entering the consumer library.

## Invalid coordinator inputs

Reject malformed batch plan/catalog arrays before any export work begins. Empty incremental plans remain supported when a valid complete catalog is supplied.

## Final metadata audit correction

Capture metadata is checked for finite numeric values before duration/frame arithmetic, preventing NaN imported metadata from bypassing comparison checks. The duplicate validation pass was consolidated. Added coordinator input and capture-profile preflight regression cases.

## Incremental source completion

The incremental planner now schedules recapture of existing media when its retained frame metadata is absent, inconsistent, or exceeds the fixed three-second render profile. This avoids turning an old incomplete index into a late export-wide failure. Export preflight rejects null catalog records, non-string identity fields, and malformed prior index containers. Dedicated regression tests cover unchanged valid metadata and invalid retained records.

## Additional incremental contract cases

The index parser now treats nonintegral frame counts and capture metadata exceeding the fixed profile as invalid, ensuring the incremental planner schedules regeneration. Tests cover added, changed, retry and rebuild plan membership; these cases are included in the 92-test frontend suite, which has since passed locally and in CI.

## Publication safety pass

The exporter now rejects prototype-sensitive catalog IDs and malformed imported index records before writes. The index parser ignores array-shaped records. Cancellation is checked immediately before publishing metadata, including for no-op incremental batches. Added preflight and cancellation regression cases. Runtime validation is still a separate acceptance gate.

## Batch planning contract

Catalog planning rejects null and missing-ID inputs before sorting; regression cases cover deterministic ordering, unsupported entries, and distinct safe output stems for normalized command collisions. The full frontend regression suite, including these cases, passed locally and in CI.

## Final source-only handoff (2026-11-12)

This November 12 handoff was superseded by the subsequent source inventory and final audit. The additional source defects found there were corrected; frontend regression tests, the Windows CI build/test, self-contained publish, and package checks have now passed. Real GTA capture on the user's Windows installation and PM Emotes FiveM CEF playback remain runtime acceptance tasks. Their absence does not imply that another source change is needed before those tests.

A failed recapture may retain last-known-good media only when its metadata matches the fixed capture profile. Otherwise the failed entry is recorded without retaining incompatible media, so a single legacy index record does not abort the entire manifest publication.
