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

## D. Remaining source work — execute, do not restart planning
- [ ] Audit **all remaining** application/frontend and .NET host integration files, imports, API routes, file paths and startup/build wiring; correct confirmed defects.
- [ ] Reconcile batch readiness with selected clip/ped/prop/partner state; check loading transitions and error paths; fix confirmed defects.
- [ ] Review capture camera/alpha, APNG encoder and output timing against the implemented 320×320/12fps/3s contract; fix confirmed defects.
- [ ] Review export progress and completion labels so **newly captured**, retained, unchanged, failed, skipped and removed are not conflated.
- [ ] Verify ZIP contents are self-contained and direct-folder incremental publication includes all valid retained media.
- [ ] Audit interruption/cancellation, failed writes, missing manifest/index, failed recapture and recovery/cleanup safety; fix confirmed defects.
- [ ] Review Windows user flow: GTA Legacy/resource selection, output folder permissions, export preflight, update/rebuild, cancellation, errors and summary.
- [ ] Reconcile root README and all development-reference documents against the current implementation; remove contradictory *current-status* claims while preserving historical logs.

## E. Build, packaging and delivery — outstanding
- [x] Execute existing Node regression tests and TypeScript production build; successful GitHub Actions run 43362399158 (commit 68f89c1).
- [x] Build/publish the Windows .NET application; successful Windows build, tests and self-contained publication in GitHub Actions run 43362399158.
- [x] Obtain a nonempty self-contained `EmotePreviewer.exe` in GitHub Actions artifact `EmotePreviewer-win-x64` (run 43362399158).\n- [ ] Final audit and post-audit rebuild, then deliver verified artifact for desktop acceptance.
- [ ] Provide concise first-run instructions: GTA V Legacy, legally generated key files, local emote resource, preview output folder, full build and incremental update.
- [ ] User performs **desktop acceptance** with real normal/dance/prop/shared animations and reviews APNG animation, transparency, framing and output.
- [ ] Fix actual issues found during user desktop acceptance.
- [ ] Coordinate downstream PM Emotes FiveM preview playback/missing-media fallback in its **separate project**, without withholding the Windows application pending that test.

## Completion definition
The **producer** is deliverable when a runnable Windows executable is available and the user can use it to load their GTA V Legacy emote resources, capture supported animated previews, export a complete manifest/index/report/media library, and safely rebuild/update it. The user's desktop test is the acceptance step; FiveM consumer testing belongs to the separate PM Emotes integration.

## Evidence and limits
Source implementation is not equivalent to observed Windows behavior. GitHub Actions run 43362399158 succeeded on commit 68f89c1, including frontend tests/build, .NET build/tests, self-contained Windows publish, executable verification, packaging and artifact upload. No real GTA capture run or FiveM playback result has been established. Passing CI does not close the application audit or desktop acceptance. Do not claim any unchecked task is complete. Do not turn developer build checks into a reason to stop source development.

## Next execution sequence
1. Complete source audit and defect corrections, grouped into substantial commits.
2. Close producer export/recovery and Windows UI defects, without recreating implemented components.
3. Re-run builds/tests after final source corrections and package the final Windows executable; fix failures.
4. Deliver executable and instructions for user desktop acceptance.
5. Resolve user-reported defects; hand off consumer-specific issues to PM Emotes chat.
