# Development milestones and verification

**Current stage:** Documentation baseline and export feasibility audit.

## 1 — Renderer and export feasibility
- [ ] Locate renderer/camera/scene and animation timing entry points in source.
- [ ] Verify deterministic frame capture and transparent background capability.
- [ ] Identify minimum changes required for a batch export command or UI.
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
