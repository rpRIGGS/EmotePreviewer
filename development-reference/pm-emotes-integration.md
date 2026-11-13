# PM Emotes integration — producer/consumer contract

This reference describes how the standalone producer and FiveM consumer divide work. The repositories remain separate:

- Producer: [rpRIGGS/EmotePreviewer](https://github.com/rpRIGGS/EmotePreviewer), Windows desktop application.
- Consumer: [rpRIGGS/pm-emotes](https://github.com/rpRIGGS/pm-emotes), FiveM resource.

EmotePreviewer reads local GTA V Legacy animation data and emote-resource definitions, previews supported entries and generates the preview media. PM Emotes reads the exported manifest and media to display previews in its NUI. Preview generation does not happen in FiveM.

## Producer output

The current generated profile is transparent 320×320 APNG, 12 fps and up to 3 seconds. Each output set includes:

- Preview files under immutable run-specific paths such as `previews/<stem>/<runId>/preview.png`.
- `manifest.json`, the consumer-facing list of successful published previews and their IDs, source/category/command identity, media path and timing/capture metadata.
- `preview-index.json`, producer-side fingerprint and generation state for incremental updates.
- `report.json`, per-run capture, failure, retention and publication counts.

Direct-folder updates can retain verified unchanged media and regenerate changed, missing or corrupt media. Standalone ZIP export forces a full rebuild so the manifest does not refer to files outside the archive. The manifest is the publication boundary; recovery reconciles staged producer index state against the published manifest.

## Consumer responsibilities

PM Emotes consumes the exported manifest and media in its own FiveM NUI. It owns mapping those identities to the resource's menu entries and rendering/loading behavior. Changes to the FiveM consumer belong in the PM Emotes repository and chat; this producer project does not modify that repository.

## Verification boundary

The EmotePreviewer source audit, 92 frontend tests, Windows .NET build/tests, self-contained publish, and distribution checks passed in GitHub Actions runs [43368359942](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368359942) and [43368761952](https://github.com/rpRIGGS/EmotePreviewer/actions/runs/43368761952). Automated checks validate export structures and packaging, but they do not prove real animation capture quality from the user's game installation or APNG playback in FiveM. Those remain desktop/server acceptance tests.

See [preview-export-architecture.md](preview-export-architecture.md) for the implementation details and [completion-checklist.md](completion-checklist.md) for current status.
