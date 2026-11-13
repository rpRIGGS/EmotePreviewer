# Preview export architecture — design baseline

**Status:** Milestone 2 source implementation complete; Windows/GTA/CEF validation deferred. Milestone 3 Windows desktop workflow is active.

## Goal
Turn EmotePreviewer's existing GTA V animation preview into an automated, repeatable media-production workflow. The output is an optimized local animation library read by PM Emotes without loading a full 3D renderer or game archive parser into its NUI.

## Implemented pipeline and remaining validation
1. **Catalog:** Load the intended PM Emotes resource folder into EmotePreviewer; identify previewable animations and their stable IDs.
2. **Render:** Reuse the upstream three.js scene, animation data, ped skeleton/meshes, textures, props, and partner placements where supported.
3. **Capture:** Implement deterministic frame stepping, framing, background alpha if technically supported, and repeatable loop timing.
4. **Encode:** APNG encoder is implemented as an experimental candidate. WebP/WebM comparison and actual FiveM NUI playback remain part of final format validation.
5. **Package:** Write category-organized preview assets and a generated manifest, with explicit skipped/failed entries.
6. **Consume:** PM Emotes loads a matching local file on demand from the manifest. Preview playback remains independent of gameplay actions.

## Historical illustrative output (not the implemented layout)
```text
client/NUI/previews/
  emotes/wave.webp
  dances/dance1.webp
  props/guitar.webp
  shared/handshake.webp
  manifest.json
```
These are examples only. The final path layout, extension, and naming must be agreed against the real PM Emotes catalog and loader.

## Manifest concept (illustrative)
```json
{
  "Emotes:wave": "previews/emotes/wave.webp",
  "Dances:dance1": "previews/dances/dance1.webp",
  "PropEmotes:guitar": "previews/props/guitar.webp"
}
```
Actual PM Emotes identifiers and case sensitivity must be audited before implementation. The upstream EmotePreviewer uses `source/category/command` IDs, so a mapping layer will be required rather than assuming the two catalog IDs are identical.

## Technical investigation
- Locate the three.js renderer, scene/camera ownership, and AnimationMixer lifecycle.
- Verify alpha-capable rendering and whether capture can step frames independently of wall-clock time.
- Determine whether the browser canvas can be exported reliably without a visible window; assess batch processing and memory cleanup.
- Confirm handling of attached props, shared partner peds, looping, clipping, and animations without a supported preview.
- Test file sizes and transparency with normal, dance, and prop emotes; expand to shared emotes before committing to the final format.
- Check browser/FiveM NUI decoding support for the selected media type, including autoplay and alpha.
- Confirm resource packaging and lazy loading; folder organization alone does not reduce download bytes.

## Non-goals
- Rebuilding a second GTA animation engine.
- Shipping GTA V encryption keys or extracted raw game archives.
- Running EmotePreviewer itself as a FiveM server resource.
- Reworking unrelated PM Emotes gameplay functionality.

## Decision log
- **2026-11-12:** Select upstream EmotePreviewer as the foundation for offline preview production.
- **2026-11-12:** Keep PM Emotes player-facing UI lightweight with locally hosted media and manifest lookup.
- **2026-11-12:** Defer WebP versus WebM until measured export tests.
- **2026-11-12:** Preserve upstream viewer and docs; maintain PowerMoves-specific notes in `development-reference/`.


## Current exporter contract (Milestone 2)

The producer writes `manifest.json`, `preview-index.json`, `report.json`, and immutable `previews/<stem>/<runId>/preview.png` APNG files. The complete manifest uses original catalog identifiers and source/category/command fields, not an assumed PM Emotes identifier mapping. The output is either a self-contained ZIP or a selected local directory; retained previews are referenced only when verified on disk. Unsuccessful recaptures preserve verified prior media and invalidate its fingerprint for the next retry.

The current render fingerprint is tied to 320×320, 12 fps, maximum three seconds. Different capture profiles must receive a new render version before being enabled. The export camera frames visible animated meshes at the first frame and stays fixed for the sequence to prevent jitter. These behaviors are implemented but not visually validated on Windows.

**Integration boundary:** Milestone 4 will reconcile exact PM Emotes IDs and implement the NUI manifest consumer. Milestone 5 will verify the Windows build, real GTA V Legacy capture, APNG transparency/looping, and FiveM Chromium playback before the format is declared production-ready.
