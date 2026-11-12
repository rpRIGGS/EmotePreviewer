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
