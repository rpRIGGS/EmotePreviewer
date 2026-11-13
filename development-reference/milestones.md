# EmotePreviewer — active milestones and historical implementation record

**Authoritative current task checklist:** [Implementation and delivery checklist](completion-checklist.md). This file replaces the former mixed historical/active checkboxes as the execution reference. Historical details are retained in [source inventory](source-inventory-2026-11-12.md).

## Active milestones
- [x] **1 — Export/recovery safety implemented in source.** Immutable preview paths, index/manifest publication IDs, manifest-last publication, recovery, verified-media checks and guarded cleanup.
- [x] **2 — Animation production implemented in source.** Capture, APNG encoder, sequential batch, readiness, retries and failure reports.
- [x] **3 — Windows developer workflow implemented in source.** Folder selection, update/rebuild, ZIP fallback, preflight, progress/cancellation and summaries.
- [x] **4 — Consumer integration source implemented in separate PM Emotes repository**, per integration handoff; not independently audited in this repository.
- [ ] **5 — Source reconciliation, executable delivery and user acceptance.** Complete outstanding tasks in [completion-checklist.md](completion-checklist.md).

**Important:** [x] indicates implementation in source, not a passed build or real desktop/server acceptance. User is the acceptance tester. Do not require the user to reauthorize each correction.

## Historical record (not an active planning backlog)
The project progressed from renderer feasibility, selected-emote PNG sequences, batch queue, APNG encoding, incremental index, verified folder export, immutable generations, recovery and cleanup to a Windows developer workflow. Historical earlier checklists showing batch capture, manifest and consumer loader as unimplemented are superseded by later commits. See [source inventory](source-inventory-2026-11-12.md) for identified defects and corrections.

## Open deliverable
A usable Windows `EmotePreviewer.exe` with instructions for the user's own desktop acceptance. APNG quality and PM Emotes FiveM playback are not claimed to have been observed. Source work must continue independently of any unproven external outage explanation.
