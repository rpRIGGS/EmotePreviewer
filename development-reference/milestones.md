# EmotePreviewer — active milestones and historical implementation record

**Authoritative current task checklist:** [Implementation and delivery checklist](completion-checklist.md). This file replaces the former mixed historical/active checkboxes as the execution reference. Historical details are retained in [source inventory](source-inventory-2026-11-12.md).

## Active milestones
- [x] **1 — Export/recovery safety implemented in source.** Immutable preview paths, index/manifest publication IDs, manifest-last publication, recovery, verified-media checks and guarded cleanup.
- [x] **2 — Animation production implemented in source.** Capture, APNG encoder, sequential batch, readiness, retries and failure reports.
- [x] **3 — Windows developer workflow implemented in source.** Folder selection, update/rebuild, ZIP fallback, preflight, progress/cancellation and summaries.
- [x] **4 — Consumer integration source implemented in separate PM Emotes repository**, per integration handoff; not independently audited in this repository.
- [x] **5 — Final source audit.** Frontend/.NET host/API wiring, viewer readiness, capture/export/recovery and delivery workflow reviewed. Retained APNG validation and prop readiness/reporting defects corrected; development references reconciled. The post-audit Windows build and artifact delivery are still pending.
- [ ] **6 — Post-audit Windows build, distribution delivery and user acceptance.** Complete the outstanding build and desktop acceptance tasks in [completion-checklist.md](completion-checklist.md).

**Important:** [x] indicates source audit or implementation. Earlier Windows CI run 43365037280 passed at commit `c9273ec`; it predates `a4f312d` and the final audit corrections. The post-audit Windows run remains required. Real desktop/server acceptance has not occurred. User is the acceptance tester. Do not require the user to reauthorize each correction.

## Historical record (not an active planning backlog)
The project progressed from renderer feasibility, selected-emote PNG sequences, batch queue, APNG encoding, incremental index, verified folder export, immutable generations, recovery and cleanup to a Windows developer workflow. Historical earlier checklists showing batch capture, manifest and consumer loader as unimplemented are superseded by later commits. See [source inventory](source-inventory-2026-11-12.md) for identified defects and corrections.

## Open deliverable
An earlier CI artifact exists (`EmotePreviewer-win-x64`, run 43365037280). The remaining deliverable is the post-audit Windows `EmotePreviewer.exe` with instructions for desktop acceptance. APNG quality and PM Emotes FiveM playback are not claimed to have been observed.
