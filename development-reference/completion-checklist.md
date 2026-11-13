# EmotePreviewer — authoritative implementation and delivery checklist

Updated: 2026-11-13. Repository: `rpRIGGS/EmotePreviewer`, branch `main`.

## Status legend
- [x] **Implemented in repository source**: code or configuration has been inspected or documented in this repository. This does **not** mean runtime behavior has been demonstrated.
- [ ] **Open**: remaining source correction, reconciliation, build, delivery, or user acceptance task.
- "Review" means verify existing implementation and fix only defects found. It is **not** permission to rebuild an already implemented feature.
- This checklist supersedes historical unchecked development phases in `milestones.md`. Historical logs remain for traceability.
- No external service outage is established. Do not use an alleged Microsoft/GitHub outage as a project dependency.

## A. Existing foundation — implemented
- [x] Existing Windows .NET 10 application and local web host, React/TypeScript/Three.js viewer.
- [x] GTA V Legacy animation archive and resource-definition loading provided by the upstream EmotePreviewer.
- [x] Existing preview of peds, animations, props, partner/shared emotes and other upstream viewer capabilities.
- [x] Existing Windows build/publish GitHub Actions workflow in `.github/workflows/build.yml`.
- [x] PowerMoves Development branding and upstream MIT attribution in root README.

## B. Preview-production source — implemented
- [x] Offscreen transparent PNG capture and deterministic timeline stepping.
- [x] Fixed export camera framing, playback state restoration, alpha sanity checks.
- [x] PNG sequence capture module with cancellation and progress.
- [x] APNG encoder; production profile currently 320×320, 12 fps, maximum 3 seconds.
- [x] Catalog planning, stable IDs, collision-resistant stems, unsupported-entry skips.
- [x] Sequential batch loading with readiness guards, timeout, per-entry failure tracking.
- [x] Batch runner integrated into viewer, with progress and cancellation.
- [x] Self-contained ZIP fallback and direct-to-selected-folder writer.
- [x] Versioned preview index, input fingerprints, update/rebuild planning.
- [x] Manifest, preview-index and report output; immutable per-run media generations.
- [x] File-existence verification, recovery against published manifest, guarded orphan cleanup.
- [x] Preview-folder selection/disconnection, preflight counts, export summaries and cleanup controls.
- [x] Regression test source for APNG, capture, preview index, publication recovery, ZIP and maintenance.
- [x] PM Emotes manifest consumption was implemented in the **separate** `rpRIGGS/pm-emotes` repository according to its handoff; it is not independently certified by this producer inventory.

## C. Confirmed fixes committed
- [x] Replaced accidental literal escaped newlines in TypeScript source.
- [x] Rejected partial standalone ZIP plans; standalone ZIP forces full rebuild.
- [x] ZIP writer path/duplicate/size guards.
- [x] Manifest-last publication protocol and publication IDs to detect staged producer indexes.
- [x] Recovery invalidates uncommitted fingerprints; missing initial manifest discards staged index records (`55ab268`).
- [x] Standalone ZIP no longer requires verification of a previous preview folder (`270c8d1`).

## D. Final source audit — completed
- [x] Audited frontend/API wiring, Windows host startup, embedded web assets, resource loading, local API routes and build configuration; no additional confirmed integration defects found.
- [x] Batch readiness now waits for the selected main and partner clips, ped meshes and requested prop meshes; prop-load failures are surfaced for that catalog item.
- [x] Reviewed transparent frame capture, camera locking/state restoration, APNG structure, dimensions, timing and maximum duration against the 320×320/12fps/3s contract.
- [x] Retained-media verification now validates PNG chunk boundaries and CRCs, APNG frame sequencing/control data, the fixed output profile and agreement with index frame/duration metadata. Corrupt media is scheduled for regeneration.
- [x] Export reports distinguish new captures, failures, retained media after failed recapture, published total, added, changed, retry, unchanged, removed and skipped counts.
- [x] Reviewed self-contained ZIP planning, direct-folder reuse, cancellation, failed writes, missing/corrupt files, interrupted metadata publication, recovery and cleanup protections.
- [x] Reviewed Windows first-run, GTA/resource setup, folder selection, preflight, update/rebuild, cancellation and error summaries.
- [x] Reconciled development-reference current status. Root `README.md` was intentionally left untouched as required.

## E. Build, packaging and delivery — outstanding
- [x] Execute the complete frontend regression suite and TypeScript production build locally after the audit (92 tests passed).
- [ ] Build and test the .NET application on Windows after the audit; no local .NET SDK is installed in the current workspace.
- [ ] Obtain and inspect a self-contained `EmotePreviewer.exe` from the post-audit Windows workflow artifact.
- [ ] Deliver the verified artifact for desktop acceptance.
- [ ] Provide concise first-run instructions: GTA V Legacy, legally generated key files, local emote resource, preview output folder, full build and incremental update.
- [ ] User performs **desktop acceptance** with real normal/dance/prop/shared animations and reviews APNG animation, transparency, framing and output.
- [ ] Fix actual issues found during user desktop acceptance.
- [ ] Coordinate downstream PM Emotes FiveM preview playback/missing-media fallback in its **separate project**, without withholding the Windows application pending that test.

## Completion definition
The **producer** is deliverable when a runnable Windows executable is available and the user can use it to load their GTA V Legacy emote resources, capture supported animated previews, export a complete manifest/index/report/media library, and safely rebuild/update it. The user's desktop test is the acceptance step; FiveM consumer testing belongs to the separate PM Emotes integration.

## Evidence and limits
The frontend test/build passed locally after the final source changes: 92 tests, TypeScript typecheck and Vite bundle. No local .NET SDK is installed, so Windows host build/test, executable verification and packaging depend on the post-audit GitHub Actions run. Earlier run 43365037280 succeeded at `c9273ec`, before the latest `a4f312d` cleanup-path change and this audit. No real GTA capture run or FiveM playback result has been established. Do not claim any unchecked build or acceptance task is complete.

## Next execution sequence
1. Commit the grouped source-audit corrections and documentation reconciliation to `main`.
2. Run the Windows build and test workflow at that commit and correct any failures.
3. Inspect the resulting distribution artifact and provide first-run instructions.
4. Resolve user-reported desktop acceptance defects; hand off consumer-specific issues to PM Emotes chat.
