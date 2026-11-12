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
- Next: build/typecheck and actual PNG transparency test, then batch capture and encoder/manifest work. Capture currently uses the viewer's active camera; standardized framing is not yet implemented.
