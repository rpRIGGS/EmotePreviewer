# EmotePreviewer — active milestones and historical implementation record

**Authoritative current task checklist:** [Implementation and delivery checklist](completion-checklist.md). This file replaces the former mixed historical/active checkboxes as the execution reference. Historical details are retained in [source inventory](source-inventory-2026-11-12.md).

## Active milestones
- [x] **1 — Export/recovery safety implemented in source.** Immutable preview paths, index/manifest publication IDs, manifest-last publication, recovery, verified-media checks and guarded cleanup.
- [x] **2 — Animation production implemented in source.** Capture, APNG encoder, sequential batch, readiness, retries and failure reports.
- [x] **3 — Windows developer workflow implemented in source.** Folder selection, update/rebuild, ZIP fallback, preflight, progress/cancellation and summaries.
- [x] **4 — Consumer integration source implemented in separate PM Emotes repository**, per integration handoff; not independently audited in this repository.
- [x] **5 — Final source audit.** Frontend/.NET host/API wiring, viewer readiness, capture/export/recovery and delivery workflow reviewed. Retained APNG validation and prop readiness/reporting defects corrected; development references reconciled.
- [x] **6 — Post-audit Windows build and distribution.** GitHub Actions run 43368359942 passed at `d3c518c`. The self-contained executable and nested distribution ZIP were downloaded and integrity-checked; packaged executable SHA-256 matches `SHA256.txt`.
- [ ] **7 — User desktop acceptance.** Exercise real GTA V Legacy animation resources and inspect exported media, incremental updates, reports and recovery as listed in [completion-checklist.md](completion-checklist.md).

**Important:** [x] indicates source audit, implementation, or the build and package checks stated in the milestone. No real desktop capture or FiveM playback has been demonstrated. User desktop acceptance is still required. Do not require the user to reauthorize each correction.

## Historical record (not an active planning backlog)
The project progressed from renderer feasibility, selected-emote PNG sequences, batch queue, APNG encoding, incremental index, verified folder export, immutable generations, recovery and cleanup to a Windows developer workflow. Historical earlier checklists showing batch capture, manifest and consumer loader as unimplemented are superseded by later commits. See [source inventory](source-inventory-2026-11-12.md) for identified defects and corrections.

## Open acceptance
The post-audit Windows distribution (`EmotePreviewer-win-x64`, run 43368359942) is available with `START-HERE.txt` and `SHA256.txt`. The remaining work is real desktop acceptance and, separately, PM Emotes FiveM consumer playback. APNG output quality in GTA and FiveM playback are not claimed to have been observed.
