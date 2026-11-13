# PowerMoves Development — EmotePreviewer reference

This directory documents the implemented Windows producer, known defects and remaining delivery work. The [completion checklist](completion-checklist.md) is the **single authoritative execution backlog**. Historical milestone and inventory notes are supporting records, not competing planning lists.

## Project
- Producer: `rpRIGGS/EmotePreviewer` (`main`), standalone Windows .NET 10 + React/Three.js GTA V Legacy animation viewer/exporter.
- Consumer: `rpRIGGS/pm-emotes` (`master`), separate FiveM resource that displays generated local previews.
- Upstream: [Acc-Off/EmotePreviewer](https://github.com/Acc-Off/EmotePreviewer), MIT license.
- Media: APNG 320×320, 12 fps, max 3s, currently experimental until user desktop/FiveM acceptance.
- No game encryption keys or extracted GTA assets in repository. No preview generation inside FiveM.

## Documents
1. [Completion checklist — implemented and outstanding](completion-checklist.md)
2. [Active milestone status](milestones.md)
3. [Implemented preview export architecture](preview-export-architecture.md)
4. [Source inventory and defect history](source-inventory-2026-11-12.md)
5. [Original developer guide](../Docs/development.md)

## Status discipline
Implemented source is marked [x]; unperformed delivery, build and user acceptance is marked [ ]. No claims of a successful Windows executable or FiveM playback without evidence. The user performs desktop and FiveM acceptance; build checks are developer work, not a reason to halt source development. No Microsoft/GitHub outage is an established dependency.
