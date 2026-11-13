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
