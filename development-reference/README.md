# PowerMoves Development — EmotePreviewer references

This directory records the implementation, audit evidence and current acceptance boundary for the standalone Windows producer. The [completion checklist](completion-checklist.md) is the authoritative status record. Dated source-inventory notes retain history and should not be read as current task lists.

## Project boundary

- **Producer:** `rpRIGGS/EmotePreviewer` — Windows x64, .NET 10, React, TypeScript and Three.js. It reads GTA V Legacy animation resources, previews supported emotes and generates local APNG media.
- **Consumer:** `rpRIGGS/pm-emotes` — separate FiveM resource that consumes the generated preview library.
- Preview capture and encoding happen in EmotePreviewer, never inside FiveM.
- GTA archive key files and extracted game assets are not included in this repository or distribution.
- Upstream viewer and license attribution: [Acc-Off/EmotePreviewer](https://github.com/Acc-Off/EmotePreviewer), MIT.

## Current status — 2026-11-13

- Source audit, regression corrections, Windows build, tests and packaging are complete.
- [Workflow run 43368359942](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368359942) passed the final source build and produced the inspected Windows distribution.
- [Workflow run 43368761952](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368761952) passed on the documentation-reconciled commit and uploaded the same named distribution.
- The artifact `EmotePreviewer-win-x64` contains the self-contained executable, `START-HERE.txt` and `SHA256.txt`; GitHub retains it for 30 days.
- No actual capture from the user's GTA installation or FiveM playback has been observed. Those are separate desktop/server acceptance tests.

## Documents

1. [Completion checklist](completion-checklist.md) — implemented work, CI evidence and open acceptance.
2. [Milestones](milestones.md) — current project completion state and historical notes.
3. [Preview export architecture](preview-export-architecture.md) — capture profile, output formats, update/rebuild, publication and recovery.
4. [Source inventory](source-inventory-2026-11-12.md) — dated defect findings; later superseded status is labeled.
5. [PM Emotes consumer integration](pm-emotes-integration.md) — producer/consumer contract.
6. [Build and technical guide](../Docs/development.md) — solution layout, build, API and developer tools.

## Export contract

The current profile is transparent 320×320 APNG at 12 fps for up to 3 seconds. Export writes media, consumer `manifest.json`, producer `preview-index.json` and `report.json`. A selected-folder update may retain only verified unchanged media; a standalone ZIP forces a complete rebuild. The manifest is the consumer publication boundary. Recovery reconciles staged index data against it, and cleanup protects published paths.
