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

## E. Build, packaging and delivery — complete for desktop acceptance
- [x] Execute the complete frontend regression suite and TypeScript production build locally after the audit (92 tests passed).
- [x] Build and test the .NET application on Windows after the audit using GitHub Actions run `43368359942` at `d3c518c`; all workflow jobs passed.
- [x] Publish and inspect the self-contained `EmotePreviewer.exe` and Windows distribution ZIP from that run. Both ZIP levels passed integrity checks; the executable's SHA-256 matches the packaged `SHA256.txt`.
- [x] Make the verified distribution available for desktop acceptance.
- [x] Include first-run instructions for extracting and launching the application, setting GTA V Legacy and required key files, loading a local emote resource, selecting an output folder and running Batch Export.
- [ ] User performs **desktop acceptance** with real normal/dance/prop/shared animations and reviews APNG animation, transparency, framing and output.
- [ ] Fix actual issues found during user desktop acceptance.
- [ ] Coordinate downstream PM Emotes FiveM preview playback/missing-media fallback in its **separate project**, without withholding the Windows application pending that test.

## Completion definition
The **producer** is deliverable when a runnable Windows executable is available and the user can use it to load their GTA V Legacy emote resources, capture supported animated previews, export a complete manifest/index/report/media library, and safely rebuild/update it. The user's desktop test is the acceptance step; FiveM consumer testing belongs to the separate PM Emotes integration.

## Evidence and limits
The frontend suite passed locally after the audit: 92 tests, TypeScript typecheck and Vite bundle. Windows GitHub Actions run `43368359942` passed at `d3c518c`, including the frontend suite/build, .NET build/test, self-contained publish, executable/UI checks and artifact upload. The downloaded artifact ZIP and nested distribution ZIP both passed integrity checks. The executable SHA-256 is `d9635dac5973ab7c6ee6e1e32538423a49c98cd3d128e666e18faa974eb6726e`, matching the value in the distribution's `SHA256.txt`. The artifact is `EmotePreviewer-win-x64`. No real GTA animation capture or FiveM playback has been established; these remain desktop/server acceptance tasks.

## Next execution sequence
1. User extracts the Windows distribution ZIP and follows `START-HERE.txt`.
2. Exercise normal, dance, prop and shared animations on the Windows desktop; review transparent 320×320 APNG output, timing, framing, update/rebuild, reports and interruption recovery.
3. Correct any defects found during desktop acceptance. Keep PM Emotes consumer playback testing in its separate project.
