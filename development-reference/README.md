# PowerMoves Development — EmotePreviewer reference

## Purpose
This folder is the project-specific source of truth for the PowerMoves RP EmotePreviewer fork. It supplements, rather than replaces, the original developer's `Docs/development.md`.

**Owner:** PowerMoves Development  
**Target platform:** Offline Windows developer tool, producing preview media consumed by the PM Emotes FiveM NUI.  
**Upstream:** https://github.com/Acc-Off/EmotePreviewer  
**Consumer:** PowerMoves RP / PM Emotes.

## Confirmed foundation
- The upstream viewer reads GTA V Legacy archives and resource Lua catalogs, decodes animation clips, and renders peds and attached props with three.js.
- The application uses a .NET 10 local API and React/TypeScript frontend.
- It supports local resource folders, shared emotes, walk styles, props, and custom resource files.
- The upstream documentation does **not** establish an automated media-export feature.

## Approved direction
1. Extend the existing offline renderer rather than recreate animation playback inside FiveM.
2. Export an optimized, local preview library for PM Emotes; PM Emotes displays media, not GTA archive assets.
3. Current source implementation produces experimental APNG at 320×320 and 12 fps; retain the format as provisional until real FiveM Chromium playback is verified.
4. Generate stable, deterministic catalog-to-file mappings and a manifest.
5. Preserve original viewer operation and upstream attribution.
6. Do not embed game archive keys or copyrighted GTA game assets in the repository or exported source packages.

## Scope boundaries
- The exporter is a **development-time tool**, not a FiveM server resource.
- PM Emotes retains its existing gameplay and NoPixel-inspired interface; only the preview-loading contract is under consideration.
- Batch export, manifest/index generation, recovery, and folder workflow are implemented in source. No successful CI run, Windows runtime capture, server test, or generated production preview library is claimed.

## Documents
- [Architecture and open technical questions](preview-export-architecture.md)
- [Milestones and acceptance checks](milestones.md)
- [Current implementation inventory](source-inventory-2026-11-12.md)
- [Original technical guide](../Docs/development.md)

## Working conventions
Document architectural decisions before modifying the preview contract. Prefer substantial, coherent implementation milestones with verification rather than isolated speculative changes. Keep upstream documentation and licensing intact.
