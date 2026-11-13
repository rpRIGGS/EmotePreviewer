# EmotePreviewer — implemented preview export architecture

**Current state:** Producer architecture is implemented and the source audit is complete. Post-audit Windows CI packaging and desktop acceptance remain; see [completion-checklist.md](completion-checklist.md).

## Purpose and boundary
`rpRIGGS/EmotePreviewer` is a standalone Windows development application built on Acc-Off's GTA V Legacy EmotePreviewer (.NET 10 host, React/TypeScript/Three.js). It loads game assets and emote resources, renders animations offline and produces local media for the separate `rpRIGGS/pm-emotes` FiveM NUI. Preview generation never runs inside FiveM.

## Implemented producer workflow
1. Load the user's GTA V Legacy installation, locally generated archive keys and emote resource definitions using the upstream application.
2. Plan a deterministic catalog with IDs, source/category/command identities, safe output stems and explicit unsupported skips.
3. Sequentially select entries and wait for matching clip, ped mesh and requested props on both rigs; capture fixed-camera transparent PNG frames at 320×320, 12 fps, up to 3 seconds.
4. Encode frames to looping APNG; report individual capture failures without aborting the rest of the batch.
5. Write immutable `previews/<stem>/<runId>/preview.png` paths plus `report.json`, `preview-index.json`, and last, the consumer `manifest.json`.
6. For a selected output folder, validate APNG chunk boundaries and CRCs, frame controls, output profile and indexed timing; reconcile staged index data against the published manifest, retain valid unchanged previews and regenerate changed/failed/missing ones.
7. For a standalone ZIP, force a complete rebuild so the archive does not refer to media available only in another directory.
8. Provide preview-folder cleanup with protected published paths and explicit confirmation.

## Publication and recovery
The manifest is the consumer publication boundary; the index is producer state. Shared publication IDs identify matching generations. A staged index with no manifest is discarded; an index ahead of a prior manifest is reconciled and stale fingerprints invalidated. Per-file browser writes are not atomic as a group; orphaned generations may remain and can be cleaned conservatively. Cancellation or write failure must not be described as an atomic transaction.

## Media contract
- Output: experimental animated PNG (`.png`, APNG) at 320×320, 12fps, max 3s.
- Manifest contains original `id`, `source`, `category`, `command`, media path and timing/capture metadata.
- Producer index records fingerprints, generated/failed status, media and timing metadata. Export reports separately count captured, failed, retained-after-failure, published, added, changed, retry, unchanged, removed and skipped entries.
- ZIP output must be self-contained; direct-folder update may reuse only verified existing media.
- The PM Emotes consumer maps source/category/command to the appropriate preview in its own repository.
- Actual GTA capture, APNG quality and FiveM Chromium playback have **not** been observed in this repository review. This does not make the source features "planning stage".

## Source modules
`src/EmotePreviewer.Web/src/viewer/`: `Viewer.tsx`, `scene.ts`, `controller.ts`, `captureSequence.ts`, `encodeApng.ts`, `batchPlan.ts`, `exportCatalogBatch.ts`, `previewIndex.ts`, `verifyPreviewFiles.ts`, `recoverPreviewLibrary.ts`, `previewLibraryMaintenance.ts`, `exportZip.ts`.

## Exclusions
No second GTA renderer; no GTA encryption keys or extracted copyrighted game archives in source; no in-FiveM preview generation; no unrelated PM Emotes UI/gameplay rewrite.

## Remaining
See [completion-checklist.md](completion-checklist.md) for source reconciliation, executable packaging and user acceptance. Do not revive historical WebP/WebM comparison as a prerequisite to handing over the existing APNG implementation; only revisit format if actual user playback shows it is necessary.
