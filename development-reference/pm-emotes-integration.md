# PM Emotes integration contract — repository-verified findings

Verified against `rpRIGGS/pm-emotes` default-branch source on 2026-11-12. This is a compatibility audit, **not** approval to install experimental previews into the live NUI.

## Existing consumer

- `fxmanifest.lua`: `ui_page 'client/NUI/index.html'`; currently lists `client/NUI/previews/*` (nonrecursive), `client/NUI/js/*.js`, and NUI HTML/CSS.
- `client/NUI/index.html`: loads `js/autoshot-previews.js`.
- `client/NUI/js/autoshot-previews.js`: fetches `previews/manifest.json`; expects `{version:1,entries:{[emoteType+':'+emoteId]:'previews/<name>.webp'}}`. It only accepts flat `.webp` paths matching its regex. It uses button attributes `data-emotetype` and `data-emoteid`, and silently hides the preview when no mapping exists.
- Existing NUI also requests in-game `PREVIEW_EMOTE`; generated media should complement rather than inadvertently replace this behavior.

## Current producer mismatch

- EmotePreviewer produces **experimental APNG** at `previews/<outputStem>/preview.png`, a schemaVersion 1 manifest with an **array** of records, and a separate `preview-index.json`.
- Existing NUI rejects APNG paths and does not understand the exporter manifest. Its `fxmanifest.lua` does not include nested preview files. Emote category/type normalization and command identity must be verified before mapping IDs.
- Selecting a PM Emotes `previews` directory is blocked in the exporter as a safety measure; use a staging folder while this contract is unresolved.

## Required before direct PM Emotes installation

1. Approve APNG vs WebP after actual FiveM Chromium playback, transparency, performance, and filesize tests.
2. Define a single canonical `emoteType:emoteId` mapping from catalog source to NUI button attributes; reject collisions.
3. Generate a complete current manifest including unchanged previews, not only the incremental batch. Remove stale entries and do not point failed entries to nonexistent files.
4. Support correct `fxmanifest.lua` asset globs for the chosen folder layout; confirm file URLs resolve in NUI.
5. Implement atomic or recoverable installation: do not overwrite the active manifest until all referenced media is installed. Retain last-good files and index on partial failures.
6. Run TypeScript build, Windows desktop filesystem tests, and in-game NUI smoke test.

**Scope:** producer work belongs to EmotePreviewer. PM Emotes changes should be coordinated through its own project and handoff; do not silently modify that repository.
