# Development milestones and verification

**Current stage:** Selected-emote PNG ZIP proof of concept implemented; build and visual validation pending.

## 1 — Renderer and export feasibility
- [x] Locate renderer/camera/scene and animation timing entry points in source.
- [ ] Verify deterministic frame capture and transparent background capability in a running Windows build (capture methods now implemented, not yet tested).
- [x] Identify initial capture integration points in `viewer/scene.ts` and `viewer/controller.ts`; batch interface still pending.
- [ ] Record limits for props, partner peds, and unpreviewable entries.

**Exit criterion:** Documented export design tied to concrete source files, not assumptions.

## 2 — Representative media proof of concept
- [ ] Produce normal emote sample.
- [ ] Produce dance sample.
- [ ] Produce prop emote sample.
- [ ] Evaluate WebP and WebM output: alpha, frame quality, loop, size, playback.
- [ ] Test actual FiveM NUI support before choosing the final format.

**Exit criterion:** Repeatable sample generation and an evidence-backed media decision.

## 3 — Catalog and packaging
- [ ] Read the real PM Emotes animation identifiers and categories.
- [ ] Implement deterministic ID mapping and collision-safe output names.
- [ ] Produce manifest and skip/failure report.
- [ ] Support incremental or repeatable batch export and cleanup.

**Exit criterion:** Generated local library maps correctly to the target catalog.

## 4 — PM Emotes consumption
- [ ] Define the local media loader contract.
- [ ] Lazy-load previews without loading a full 3D engine.
- [ ] Keep existing UI/gameplay functionality intact.
- [ ] Confirm behavior for missing media and unpreviewable entries.

**Exit criterion:** In-game preview loads by catalog identifier.

## 5 — Validation and documentation
- [ ] Verify viewer regression/build tests.
- [ ] Test developer workflow on Windows with GTA V Legacy and legally sourced keys.
- [ ] Test FiveM client playback and resource impact.
- [ ] Update root README, reference docs, and deployment instructions with observed results.

**Exit criterion:** Tested end-to-end workflow with documented limits.

## Verification rules
Do not mark tasks complete without actual evidence. No live FiveM test, exported library, or encoder validation has occurred as part of this documentation baseline.

## Implementation log — 2026-11-12

- Inspected `src/EmotePreviewer.Web/src/viewer/scene.ts`, `controller.ts`, and `Viewer.tsx`.
- Added `Scene.captureTransparentPng(width,height)`: offscreen RGBA render target, hidden grid/background, pixel readback and vertical flip, restoration of renderer/camera state, PNG data URL result.
- Added `ViewerController.captureFramePng(timeSeconds,width,height)`: seek, pose at exact time, capture, restore timeline.
- **Not yet verified:** TypeScript build, WebGL alpha correctness, textures settling before capture, camera framing, batch/export UI, encoding, PM Emotes playback.
- The capture primitive is intentionally not exposed as a player-facing UI yet. Next implementation must add a developer export workflow, including readiness checks and batch output.

## Implementation log — PNG sequence export prototype

- Added `viewer/exportZip.ts`: dependency-free ZIP (STORE) builder with CRC32 and PNG data URL conversion.
- Added `Export PNG frames` to the viewer, enabled only for a loaded emote with a loaded ped mesh and Mesh enabled. It captures up to 3 seconds at 12 fps in 320×320 transparent PNG frames, with `capture.json` metadata, and downloads a ZIP. Export temporarily pauses and then restores playback.
- This is a **single-selected-emote developer proof of concept**, not batch export, WebP/WebM encoding, or PM Emotes packaging.
- **Validation blocked:** GitHub source is accessible through the connector, but the execution container could not resolve github.com to clone/build. TypeScript compile and real WebGL alpha testing remain outstanding; do not mark as tested.
- Next: build/typecheck and actual PNG transparency test, then batch capture and encoder/manifest work. Capture now uses a fixed cloned export camera rather than the interactive viewer camera; actual framing still requires visual testing.

## Implementation log — export hardening

- Standardized PNG export framing with a cloned, fixed-angle camera. Export no longer changes the interactive viewer camera/aspect.
- Added selected-emote frame progress in the viewer UI.
- Added alpha sanity checks: fail on entirely transparent frames (missing geometry) or entirely opaque frames (lost transparency) instead of packaging bad previews.
- Confirmed the repository already has a Windows GitHub Actions build/test/publish workflow in `.github/workflows/build.yml`. It runs .NET build, .NET tests, and publishes a win-x64 executable; no duplicate workflow was added.
- **Still unverified:** CI outcome for these commits, actual WebGL rendering and camera coverage, media encoding, catalog batching, and PM Emotes integration.

## Implementation log — reusable capture and batch planning

- Extracted selected-emote capture into `viewer/captureSequence.ts`. It validates capture settings, supports cancellation and per-frame progress, and restores playback state even on errors. The existing viewer action now calls this module.
- Added `viewer/batchPlan.ts`: stable catalog ordering, duplicate-ID handling, explicit unsupported-entry skip reasons, and collision-resistant export stems based on source/category/command plus a deterministic ID hash.
- **Important scope:** These modules provide capture and queue-planning primitives. No automatic selection/loading loop, batch UI, animated encoder, final PM Emotes manifest, or ready-to-copy package exists yet. Do not mark batch production complete.
- **Verification:** GitHub commits succeeded; TypeScript compilation and Windows rendering have not been verified.

## Implementation log — sequential batch runner

- Added `viewer/exportCatalogBatch.ts` to execute a planned catalog sequentially, with cancellation, per-entry failures, progress, and a ZIP containing `manifest.json`, `report.json`, and captured PNG sequences.
- Its `BatchAdapter.load` contract explicitly requires a fully ready rig/clip/mesh before capture. **The React viewer adapter that selects each entry and waits for readiness is still missing.** The batch runner is therefore not yet reachable from a user-facing batch button.
- The archive is explicitly labeled an intermediate developer format, not the final animated PM Emotes NUI media package.
- Build and real-world capture remain unverified.

## Implementation log — viewer batch integration

- Wired `exportCatalogBatch` into the React viewer with an `Export catalog PNG batch` control, progress display, cancel control, and ZIP download.
- The adapter selects catalog entries sequentially, waits for a ready clip and loaded ped mesh (45-second per-entry timeout), and restores the original viewer selection after completion/cancellation. It clears secondary layering during export.
- Added a loading-transition guard so the next selection cannot immediately capture the previous emote's stale ready state.
- **Not yet verified:** Windows/TypeScript build, live readiness transitions, per-emote visual accuracy, large batch memory consumption, and NUI-ready animated encoding. The archive remains a developer PNG-sequence ZIP.

## Implementation log — batch readiness correctness

- Tightened viewer clip state to retain the exact clip-spec key when asynchronous loads complete or refresh. A previously selected emote's `ready` state can no longer satisfy a different emote's readiness check merely because React has not run the next loading effect.
- Removed the fragile requirement to observe a loading transition during polling; readiness now depends on the selected entry and its matching loaded clip key.
- This is source-level hardening, not a claim that full batch capture was executed. Windows CI/build and representative rendering still require verification.

## Implementation log — animated media candidate

- Implemented `viewer/encodeApng.ts`: assembles full-frame PNG captures into a looping APNG using PNG chunks, APNG frame controls, CRC32 validation, and sequence numbering. This does not require a browser video encoder.
- Catalog batch export now writes one `previews/<stem>/preview.png` animated PNG per successfully captured emote rather than a directory of raw frames. `manifest.json` maps source IDs and commands to media paths; `report.json` records failures/skips.
- Updated viewer batch button and ZIP name to identify animated preview output. The separate single-selected-emote developer button still exports raw PNG frames.
- **Format status: experimental.** APNG must be tested for actual animation, transparency, loop behavior, file size, and FiveM Chromium/NUI playback before choosing it as final PM Emotes media. This is not yet a copy-ready PM Emotes package.
- **Validation outstanding:** TypeScript/.NET build, Windows GTA rendering, batch memory behavior, and actual APNG decoding/playback. Local GitHub clone remains DNS-blocked; GitHub connector commits work.

## Incremental preview update implementation

- `viewer/previewIndex.ts` defines versioned preview-index records and fingerprints the actual rendering inputs (animation, ped, props, partner configuration, rendering version), not merely display labels.
- `planIncrementalBatch` classifies new, changed, failed/retry, unchanged and removed catalog IDs; update mode skips unchanged records, rebuild mode forces all supported animations.
- Batch ZIP now contains `preview-index.json` with successful and failed outcomes alongside `manifest.json`, `report.json` and APNG media.
- Viewer now provides **Import preview index** (JSON stored in browser localStorage) and **Rebuild all** controls. Default mode exports only new/changed/failed items relative to imported index. The index is **not automatically marked installed** after export: import the updated index only after copying the associated media into the preview library.
- **Important limitation:** browser-local index cannot verify that media files actually exist in the installed PM Emotes folder. Full disk-backed verification and persistent native Windows application state are not yet implemented. An index with missing media can incorrectly classify an emote as unchanged; use rebuild if unsure. Index import is an explicit step, not automatic folder scanning.
- **Not yet validated:** TypeScript build, APNG playback in FiveM Chromium, Windows rendering, end-to-end incremental installation and missing-preview fallback in PM Emotes NUI.

## Preview library verification (follow-up)

- Added `viewer/verifyPreviewFiles.ts`: after an explicit user folder selection, checks each indexed generated preview's relative path and verifies the file is nonempty. Rejects invalid/traversal paths.
- Added **Verify preview folder** to the viewer. Missing files are classified for regeneration by `planIncrementalBatch`.
- Incremental exports now refuse to skip indexed generated files unless the library was verified in the current session. **Rebuild all** remains available without verification.
- **Limitations:** requires browser File System Access API; folder selection is user-initiated, not a native background scan. The chosen folder must be the root containing the indexed `previews/` directory. File existence/size does not validate APNG decoding or content hash. Export still generates a ZIP and does not install media automatically. No Windows build or FiveM NUI test has been completed.

## Direct-to-folder incremental export

- Batch coordinator now accepts an asynchronous per-file writer; when present, each encoded APNG is written immediately rather than accumulating all previews in a single in-memory ZIP. ZIP remains the fallback when no output directory is selected.
- **Select preview folder** now retains the user-selected File System Access directory handle for the session, verifies indexed files, and uses it as the destination for direct incremental export.
- Export writes `previews/<stem>/preview.png`, `preview-index.json`, `manifest.json`, and `report.json` to that folder. After successful completion, the index is saved locally and the folder is verified again. New/changed/failed media is updated; unchanged media is not overwritten.
- **Remaining concerns:** browser directory permission/availability and Windows desktop host behavior require testing. ZIP fallback still retains output in memory. Direct export is not transactional if interrupted halfway through, so the previous index should be backed up before a large update. APNG compatibility and end-to-end build are unverified. This is not yet production-ready or PM Emotes NUI-tested.
