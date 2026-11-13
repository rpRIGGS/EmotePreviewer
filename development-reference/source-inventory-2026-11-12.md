# EmotePreviewer — refreshed source inventory
Date: 2026-11-12
Repository: rpRIGGS/EmotePreviewer, main

## Scope and verification separation
This inventory is a read-only source audit of the current GitHub repository plus documentation reconciliation. GitHub Actions/Node/.NET checks are **developer build and regression checks**, not testing on the user's FiveM development server. Their execution is deferred. No Windows runtime or in-game result is asserted.

## Implemented in source
1. Offline GTA V Legacy animation viewer and .NET 10/React/Three.js foundation.
2. Transparent PNG frame capture, deterministic frame sequencing and APNG encoding.
3. Batch planning, collision-resistant stems, sequential load/readiness coordination and per-entry failure reporting.
4. Immutable media paths, manifest/report/index generation, ZIP export and selected-folder writing.
5. Incremental fingerprint planning, verification of installed files, recovery and guarded cleanup.
6. Desktop export controls, cancellation/progress, update/rebuild and original-viewer state restoration.
7. CI workflow for frontend Node tests/build, Windows .NET build/tests and executable publication.
8. PM Emotes manifest-consumption contract belongs to its separate repository.

## Confirmed source observations and remaining risks
- **Documentation drift (confirmed):** historical checkboxes in milestones.md still say batch UI, batch writer and consumer contract are missing. These are historical notes, not current status. The root and reference README had also lagged behind APNG implementation; updated in this inventory commit.
- **Publication is not transactional (confirmed):** exporter writes report.json, manifest.json, then preview-index.json separately. A write failure between metadata files leaves mixed generations; recovery is designed to reconcile but a fully atomic multi-file commit is not provided by the browser directory API.
- **ZIP behavior differs from selected-folder export (confirmed):** retained existing media are included only when verified in a selected folder. ZIP output contains new captures, not copied retained media. Use rebuild for a standalone complete ZIP; this distinction should be prominent in user-facing guidance.
- **Imported index validation differs between parser and direct exporter (confirmed):** parser filters malformed records; direct exporter preflight rejects malformed record shapes. Recovery should be used for selected folders.
- **Output format remains experimental:** actual APNG rendering and FiveM Chromium playback are not yet verified.
- **Tests are committed, not executed:** the new source-level regression tests cannot be described as passing without an execution result.

## Acceptance work deferred, not confused with server testing
A. GitHub Actions/Node/TypeScript/.NET checks (developer CI, not FiveM server).
B. Windows desktop GTA archive capture and APNG artifact inspection.
C. Separate PM Emotes integration acceptance inside FiveM, only when ready.

## Decision
The source inventory does **not** support an unconditional production-ready or fully verified claim. It does confirm substantial implementation is present, rather than a missing batch export workflow. Follow up on identified source risks before release; do not reopen completed feature scope merely because CI is unavailable.

## Packaging hardening follow-up

The desktop exporter now forces full-catalog rebuild mode when downloading a standalone ZIP. The batch exporter rejects partial ZIP plans before loading any animation. Incremental reuse remains available for verified selected-folder exports only. This prevents a ZIP manifest from silently excluding unchanged media that exists only in a different directory.

## Publication hardening follow-up

Changed the selected-folder metadata publication order to report → producer index → consumer manifest, with the manifest as the last commit marker. The existing recovery logic treats the manifest as authoritative and discards index-ahead records after an interrupted write. Regression tests cover normal write order and index-staging failure. Individual browser file writes are not a multi-file transaction; the recoverable protocol intentionally avoids claiming otherwise.

## ZIP archive hardening

The classic STORE-only ZIP writer now rejects duplicate archive names, path traversal, Windows-style path separators and drive components, and offsets exceeding classic ZIP's 32-bit size limit. Dedicated source regression cases cover unsafe paths, duplicates and a valid archive.

## Critical syntax repair

The source inventory found literal backslash-n sequences accidentally committed into TypeScript code in batchPlan.ts and exportCatalogBatch.ts. They were replaced with actual line breaks. This was a source-breaking defect and demonstrates why the previous source-complete declarations were premature. Build execution remains deferred.

## Publication consistency audit correction

Identified a genuine flaw in the previously added manifest-last protocol: a staged producer index could retain a newer fingerprint for a media path still present in the older manifest, causing an update to skip needed recapture. Added a shared publication ID to the index and manifest and made recovery invalidate fingerprints whenever publication IDs disagree (or are absent in legacy manifests). This forces safe regeneration rather than silently trusting uncommitted metadata. Runtime checks remain outstanding.

Regression coverage added for interrupted publication recovery: mismatched index/manifest generations must invalidate fingerprints; matching generations may retain them; legacy manifests conservatively retry. The recovery source also explicitly narrows the publication ID type for TypeScript compilation.

## Consolidated source audit checkpoint — November 12

**Implemented in source:** original Windows/.NET host and GTA-backed 3D viewer; catalog planning and filtering; per-entry readiness and sequential capture; deterministic PNG frame capture; APNG encoder; standalone ZIP and selected-folder export; consumer manifest, producer index and report; incremental fingerprint planning; disk verification; recovery and guarded obsolete-file cleanup; UI progress, cancellation and rebuild controls.

**Defects found and corrected during this audit:** malformed literal escaped line breaks in two TypeScript modules; incomplete standalone ZIP plans; unsafe/duplicate ZIP names and classic ZIP size overflow; metadata publication order; and the subtler interrupted-publication bug where a staged index could falsely mark unchanged manifest media current. Publication IDs now distinguish committed index/manifest pairs and trigger safe retry on mismatch.

**Checks not completed:** an actual TypeScript typecheck, Node test execution, .NET compilation, Windows desktop launch, real GTA capture, APNG playback, or PM Emotes acceptance. These cannot be represented as passing. The review accessed the identified export/viewer/library source modules and test files through the repository connector; it was not a recursive checkout or exhaustive audit of every original upstream backend file. No claim of a fully verified release is justified.

**Remaining release gate:** execute existing frontend tests/build and .NET/Windows build when available, address any failures, generate a real preview catalog, and verify consumer playback. Source features are present; release readiness remains unverified.


## Authoritative status reconciliation — 2026-11-12

The current active checklist is [completion-checklist.md](completion-checklist.md). Earlier inventory statements describing report → manifest → index publication, rejection of an initial staged index without a manifest, or unimplemented standalone ZIP safeguards are historical and **superseded**. Current code publishes report → index → manifest, discards an initial staged index when no manifest exists (commit `55ab268`), and allows standalone ZIP rebuild without a selected folder (commit `270c8d1`). The producer's main feature set is implemented in source, but the remaining source audit, developer checks, Windows executable packaging and user acceptance are open. Do not label them as planning-stage features or as finished deliveries.
