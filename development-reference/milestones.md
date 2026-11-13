# EmotePreviewer — active milestones and historical implementation record

**Authoritative current task checklist:** [Implementation and delivery checklist](completion-checklist.md). This file replaces the former mixed historical/active checkboxes as the execution reference. Historical details are retained in [source inventory](source-inventory-2026-11-12.md).

## Active milestones
- [x] **1 — Export/recovery safety implemented in source.** Immutable preview paths, index/manifest publication IDs, manifest-last publication, recovery, verified-media checks and guarded cleanup.
- [x] **2 — Animation production implemented in source.** Capture, APNG encoder, sequential batch, readiness, retries and failure reports.
- [x] **3 — Windows developer workflow implemented in source.** Folder selection, update/rebuild, ZIP fallback, preflight, progress/cancellation and summaries.
- [x] **4 — Consumer integration source implemented in separate PM Emotes repository**, per integration handoff; not independently audited in this repository.
- [x] **5 — Final source audit.** Frontend/.NET host/API wiring, viewer readiness, capture/export/recovery and delivery workflow reviewed. Retained APNG validation and prop readiness/reporting defects corrected.
- [x] **6 — Windows build, tests and distribution.** GitHub Actions runs [43368359942](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368359942) and [43368761952](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368761952) passed. The self-contained executable and distribution ZIP were downloaded and integrity-checked; packaged executable SHA-256 matches `SHA256.txt`.
- [x] **7 — Documentation reconciliation.** Root and Japanese README, reference index, checklist, milestones and architecture now describe the producer workflow and acceptance boundary.
- [ ] **8 — User desktop acceptance.** Exercise real GTA V Legacy animation resources and inspect exported media, incremental updates, reports and recovery as listed in [completion-checklist.md](completion-checklist.md).

**Important:** [x] indicates source audit, implementation, documentation, or the build/package checks stated in the milestone. No real desktop capture or FiveM playback has been demonstrated. User desktop acceptance is still required.

## Historical record (not an active planning backlog)
The project progressed from renderer feasibility, selected-emote PNG sequences, batch queue, APNG encoding, incremental index, verified folder export, immutable generations, recovery and cleanup to a Windows developer workflow. Historical earlier checklists showing batch capture, manifest and consumer loader as unimplemented are superseded by later commits. See [source inventory](source-inventory-2026-11-12.md) for identified defects and corrections.

## Open acceptance
The Windows distribution (`EmotePreviewer-win-x64`) is available from the latest successful [Build workflow](https://github.com/rpRIGGS/EmotePreviewer/actions/workflows/build.yml) with `START-HERE.txt` and `SHA256.txt`. The remaining work is real desktop acceptance and, separately, PM Emotes FiveM consumer playback. APNG output quality in GTA and FiveM playback are not claimed to have been observed.
