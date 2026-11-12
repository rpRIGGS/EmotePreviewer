# PM Emotes integration — target architecture

PM Emotes is an RPEmotes-based resource undergoing a NoPixel-style NUI redesign. Its current preview overlay and WebP manifest are **legacy implementation details, not requirements** for EmotePreviewer. Do not make exporter architecture conform to the temporary UI.

## Agreed division of responsibility

- **EmotePreviewer (Windows developer tool):** read animation catalog and GTA assets, generate animated transparent media, maintain fingerprints and incremental index, and write media plus manifest to a user-selected output directory.
- **PM Emotes (FiveM runtime):** consume the finalized manifest and animated media in its redesigned NUI, display placeholders for missing previews, and load previews efficiently.
- Media format (APNG currently experimental), identifier mapping, file structure and manifest schema must be validated before declaring a production contract. PM Emotes will adapt to the finalized contract.

## Existing repository observations (reference only)

- Current `rpRIGGS/pm-emotes` `fxmanifest.lua` has `ui_page 'client/NUI/index.html'` and `client/NUI/previews/*`.
- Current `client/NUI/js/autoshot-previews.js` expects flat WebP paths and a keyed manifest. **This is not a compatibility constraint** and may be replaced during the NUI redesign.
- The exporter should use original emote IDs/commands, not infer them from filenames. The eventual NUI must map those IDs to the correct menu entries.

## Exporter deliverables

1. Stable complete manifest including unchanged generated previews and excluding failed/removed entries.
2. Incremental output with safe file writes and a recoverable index.
3. Configurable output directory, with no hardcoded prohibition based on legacy PM Emotes folder names.
4. Actual Windows build, animation playback and performance tests before declaring ready.

**Current status:** folder export and APNG generation exist in source; no Windows build or FiveM playback validation. Do not treat direct installation as production-ready yet.
