import type { ViewerController } from "./controller";
import { captureSequence } from "./captureSequence";
import { makeZip, type ExportFile } from "./exportZip";
import { encodeApng } from "./encodeApng";
import type { BatchEntry, BatchSkip, BatchPlan } from "./batchPlan";
import { PREVIEW_RENDER_VERSION, type PreviewIndex } from "./previewIndex";

export interface BatchProgress {
  completed: number;
  total: number;
  currentId: string | null;
  captured: number;
  failed: number;
}
export interface BatchResult {
  archive: Blob | null;
  index: PreviewIndex;
  captured: number;
  failed: number;
  skipped: number;
}
/** Load must resolve only after the target entry's rig, clip and ped mesh
 * are ready. The UI adapter is responsible for selection and readiness. */
export interface BatchAdapter {
  load(entry: BatchEntry, signal: AbortSignal): Promise<ViewerController>;
  onProgress?: (progress: BatchProgress) => void;
  signal?: AbortSignal;
  previousIndex?: PreviewIndex;
  fingerprints?: ReadonlyMap<string, string>;
  catalog?: readonly BatchEntry[];
  /** Existing published media verified on disk; a failed recapture must not erase it. */
  verifiedMedia?: ReadonlySet<string>;
  /** Frame capture settings shared by all catalog entries. */
  capture?: { fps?: number; maxSeconds?: number; width?: number; height?: number };
  /** Write files as each emote completes, avoiding an enormous in-memory ZIP. */
  writeFile?: (path: string, data: Uint8Array) => Promise<void>;
}

function textFile(name: string, value: unknown): ExportFile {
  return { name, data: new TextEncoder().encode(JSON.stringify(value, null, 2)) };
}
function check(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Batch export cancelled", "AbortError");
}

/** Sequential execution avoids loading the entire GTA catalog's ped meshes at
 * once. Failed entries are recorded without terminating the remaining batch. */
export async function exportCatalogBatch(plan: BatchPlan, adapter: BatchAdapter): Promise<BatchResult> {
  // Refuse ambiguous catalogs before writing a single file. Duplicate IDs
  // would otherwise let one capture silently replace another in the index.
  // Validate the complete catalog even when no emotes need recapturing.
  // Otherwise a no-op incremental export can silently publish ambiguous IDs.
  const completeCatalog = adapter.catalog ?? plan.ready;
  if (!Array.isArray(completeCatalog) || !Array.isArray(plan.ready) || !Array.isArray(plan.skipped)) {
    throw new Error("Invalid batch export plan or catalog");
  }
  const catalogIds = (adapter.catalog ?? plan.ready).map((entry) => entry.id);
  const catalogIdSet = new Set(catalogIds);
  if (catalogIdSet.size !== catalogIds.length) throw new Error("Duplicate emote identifiers in export catalog.");
  if (plan.ready.some((entry) => !catalogIdSet.has(entry.id))) throw new Error("Export plan contains an emote absent from the full catalog.");
  if (new Set(plan.ready.map((entry) => entry.id)).size !== plan.ready.length) throw new Error("Duplicate emote identifiers in export plan.");
  // Stems are filesystem components, not trusted display labels. Two distinct
  // emotes sharing a stem would overwrite one another inside the same run.
  const stems = plan.ready.map((entry) => entry.outputStem);
  if (stems.some((stem) => !/^[a-zA-Z0-9_-]+$/.test(stem))) throw new Error("Unsafe preview output stem in export plan.");
  if (new Set(stems).size !== stems.length) throw new Error("Duplicate preview output stems in export plan.");
  // The full catalog must also be unambiguous: even unchanged entries may be
  // included in a complete published manifest during an incremental export.
  const catalogStems = (adapter.catalog ?? plan.ready).map((entry) => entry.outputStem);
  if (catalogStems.some((stem) => !/^[a-zA-Z0-9_-]+$/.test(stem))) throw new Error("Unsafe preview output stem in export catalog.");
  if (new Set(catalogStems).size !== catalogStems.length) throw new Error("Duplicate preview output stems in export catalog.");
  // Validate every catalog identity before the first capture or file write.
  // The consumer uses this exact triple; duplicates are never safe to publish.
  const identities = new Set<string>();
  for (const entry of adapter.catalog ?? plan.ready) {
    if (!entry.id || !entry.source || !entry.category || !entry.command) {
      throw new Error("Export catalog contains an empty preview identity field.");
    }
    const identity = JSON.stringify([entry.source.toLowerCase(), entry.category.toLowerCase(), entry.command.toLowerCase()]);
    if (identities.has(identity)) {
      throw new Error(`Duplicate export catalog preview identity: ${identity}`);
    }
    identities.add(identity);
  }
  // A caller supplying a full catalog must not silently omit a planned entry
  // with a mismatched source/category/command identity.
  const catalogById = new Map((adapter.catalog ?? plan.ready).map((entry) => [entry.id, entry]));
  for (const entry of plan.ready) {
    const original = catalogById.get(entry.id);
    if (!original || original.source !== entry.source || original.category !== entry.category ||
        original.command !== entry.command || original.outputStem !== entry.outputStem) {
      throw new Error(`Export plan/catalog identity mismatch: ${entry.id}`);
    }
  }
  const files: ExportFile[] = [];
  const emit = async (file: ExportFile): Promise<void> => {
    check(adapter.signal);
    if (adapter.writeFile) await adapter.writeFile(file.name, file.data);
    else files.push(file);
    check(adapter.signal);
  };
  const failures: BatchSkip[] = [];
  const manifest: Array<{
    id: string; source: string; category: string; command: string;
    folder: string; media: string; frameCount: number; durationSeconds: number;
    frameRate: number; width: number; height: number; format: "apng";
  }> = [];
  const total = plan.ready.length;
  const fps = adapter.capture?.fps ?? 12;
  const width = adapter.capture?.width ?? 320;
  const height = adapter.capture?.height ?? 320;
  const maxSeconds = adapter.capture?.maxSeconds ?? 3;
  const captureProfile = { fps, width, height, maxSeconds };
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new RangeError("Invalid batch frame rate");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048) throw new RangeError("Invalid batch dimensions");
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 30) throw new RangeError("Invalid batch duration");
  if (Math.ceil(maxSeconds * fps) > 1800) throw new RangeError("Batch capture profile exceeds APNG frame budget");
  // The current incremental fingerprint identifies precisely this production
  // profile. Different profiles require a new render version and fingerprint.
  if (fps !== 12 || width !== 320 || height !== 320 || maxSeconds !== 3) {
    throw new Error("Unsupported capture profile for current preview render version");
  }
  // Every export run writes immutable media paths. A failed/interrupted run
  // cannot overwrite previews referenced by the last published manifest.
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const updatedIndex: PreviewIndex = {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION,
    entries: Object.assign(Object.create(null) as PreviewIndex["entries"], adapter.previousIndex?.entries ?? {}),
  };
  const progress = (completed: number, currentId: string | null) =>
    adapter.onProgress?.({ completed, total, currentId, captured: manifest.length, failed: failures.length });
  progress(0, null);
  for (let i = 0; i < total; i++) {
    check(adapter.signal);
    const entry = plan.ready[i];
    progress(i, entry.id);
    // Capture/encode failures are per-emote and should not stop the catalog.
    // Filesystem failures are different: abort immediately so we never publish
    // a manifest that claims to reference media that could not be installed.
    let encoded: Uint8Array | null = null;
    let frameCount = 0;
    let durationSeconds = 0;
    try {
      const controller = await adapter.load(entry, adapter.signal ?? new AbortController().signal);
      check(adapter.signal);
      const capture = await captureSequence(controller, { sourceId: entry.id, signal: adapter.signal, fps, width, height, maxSeconds });
      const frameFiles = capture.files.filter((file) => file.name.endsWith(".png"));
      encoded = encodeApng(frameFiles.map((file) => file.data), fps);
      frameCount = capture.frameCount;
      durationSeconds = capture.durationSeconds;
    } catch (error) {
      check(adapter.signal);
      failures.push({ id: entry.id, reason: error instanceof Error ? error.message : String(error) });
      // Preserve verified last-known-good media. Keep its original fingerprint
      // so the next incremental update still attempts regeneration.
      const previous = Object.hasOwn(updatedIndex.entries, entry.id) ? updatedIndex.entries[entry.id] : undefined;
      if (previous?.status === "generated" && previous.media && adapter.writeFile && adapter.verifiedMedia?.has(entry.id)) {
        // Keep the old preview visible, but invalidate its fingerprint so the
        // next update retries even if the rendering inputs are unchanged.
        updatedIndex.entries[entry.id] = { ...previous, fingerprint: "" };
      } else {
        updatedIndex.entries[entry.id] = {
          fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media: "",
          status: "failed", updatedAt: new Date().toISOString(),
        };
      }
    }
    if (encoded) {
      const folder = `previews/${entry.outputStem}/${runId}`;
      const media = `${folder}/preview.png`;
      // Do not catch writer errors here: incomplete exports must never publish
      // a new manifest or index.
      await emit({ name: media, data: encoded });
      updatedIndex.entries[entry.id] = {
        fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media,
        status: "generated", updatedAt: new Date().toISOString(), frameCount, durationSeconds,
      };
      manifest.push({
        id: entry.id, source: entry.source, category: entry.category,
        command: entry.command, folder, media, frameCount,
        durationSeconds, frameRate: fps,
        width, height, format: "apng",
      });
    }
    progress(i + 1, null);
  }
  // A delta export must still publish a complete manifest.
  const catalog = adapter.catalog ?? plan.ready;
  const currentIds = catalogIdSet;
  for (const id of Object.keys(updatedIndex.entries)) {
    if (!currentIds.has(id)) delete updatedIndex.entries[id];
  }
  const capturedById = new Map(manifest.map((item) => [item.id, item]));
  // ZIP output must be self-contained. Only direct-to-folder export can
  // reference existing verified media from a previous generation.
  const completeManifest = catalog.flatMap((item) => {
    const record = Object.hasOwn(updatedIndex.entries, item.id) ? updatedIndex.entries[item.id] : undefined;
    if (!record || record.status !== "generated" || !record.media) return [];
    // Only newly written media or previously verified on-disk media may be
    // published. An imported index alone is not evidence that a file exists.
    if (!capturedById.has(item.id) && (!adapter.writeFile || !adapter.verifiedMedia?.has(item.id))) return [];
    const captured = capturedById.get(item.id);
    return [captured ?? {
      id: item.id, source: item.source, category: item.category,
      command: item.command, folder: record.media.slice(0, record.media.lastIndexOf("/")),
      media: record.media, frameCount: record.frameCount ?? 0, durationSeconds: record.durationSeconds ?? 0,
      frameRate: fps, width, height, format: "apng" as const,
    }];
  });
  // The published index and manifest must describe the same installed media.
  // An imported index may contain stale generated entries that were never
  // copied to this folder; those are NOT a valid source for future deltas.
  const publishedMedia = new Map(completeManifest.map((entry) => [entry.id, entry.media]));
  for (const item of catalog) {
    const record = Object.hasOwn(updatedIndex.entries, item.id) ? updatedIndex.entries[item.id] : undefined;
    if (!record || record.status !== "generated") continue;
    if (publishedMedia.get(item.id) === record.media) continue;
    // Do not invent an installed file or preserve its fingerprint as current.
    // Mark it failed so the next incremental pass retries the missing preview.
    updatedIndex.entries[item.id] = {
      fingerprint: record.fingerprint,
      media: "",
      status: "failed",
      updatedAt: new Date().toISOString(),
    };
  }
  // The PM Emotes consumer indexes the original source/category/command triple.
  // Reject ambiguous exports before publication instead of silently dropping
  // an entry or assigning the wrong animated preview in the NUI.
  const identityKeys = new Set<string>();
  const publishedIds = new Set<string>();
  for (const item of completeManifest) {
    const identity = JSON.stringify([item.source.toLowerCase(), item.category.toLowerCase(), item.command.toLowerCase()]);
    if (identityKeys.has(identity)) throw new Error(`Duplicate published preview identity: ${identity}`);
    if (publishedIds.has(item.id)) throw new Error(`Duplicate published preview ID: ${item.id}`);
    identityKeys.add(identity);
    publishedIds.add(item.id);
    if (!item.source || !item.category || !item.command || !item.id) {
      throw new Error("Published preview identity contains an empty field");
    }
  }
  // Never publish a previously generated file with a stale or incompatible
  // rendering profile. A verified path proves existence, not that its
  // frame timing and dimensions match this manifest's declared profile.
  for (const item of completeManifest) {
    if (item.frameRate !== fps || item.width !== width || item.height !== height) {
      throw new Error(`Preview profile mismatch for ${item.id}`);
    }
    if (item.durationSeconds > maxSeconds || item.frameCount > Math.ceil(maxSeconds * fps) ||
        item.frameCount !== Math.ceil(item.durationSeconds * fps)) {
      throw new Error(`Preview duration/frame mismatch for ${item.id}`);
    }
  }
  // A complete manifest must never contain duplicate paths, even when the
  // identities differ. Each APNG is owned by exactly one catalog entry.
  const publishedPaths = new Set<string>();
  for (const item of completeManifest) {
    if (publishedPaths.has(item.media)) {
      throw new Error(`Multiple preview identities reference the same media: ${item.media}`);
    }
    publishedPaths.add(item.media);
    if (!Number.isInteger(item.frameCount) || item.frameCount < 1 ||
        !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0 ||
        !Number.isInteger(item.frameRate) || item.frameRate < 1 ||
        !Number.isInteger(item.width) || item.width < 1 ||
        !Number.isInteger(item.height) || item.height < 1) {
      throw new Error(`Incomplete preview capture metadata: ${item.id}`);
    }
  }
  // Validate all final publication references before emitting metadata.
  // Media paths must remain within our immutable preview tree.
  for (const item of completeManifest) {
    if (!/^previews\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/preview\.png$/.test(item.media)) {
      throw new Error(`Unsafe published media path for ${item.id}`);
    }
  }
  await emit(textFile("report.json", {
    schemaVersion: 1,
    planned: total, captured: manifest.length, failed: failures.length,
    skipped: plan.skipped.length, captureProfile, failures, skippedEntries: plan.skipped,
  }));
  // Commit the consumer manifest after media. Only advance the producer index
  // once that manifest has been successfully published.
  await emit(textFile("manifest.json", {
    schemaVersion: 1,
    format: "experimental-apng",
    captureProfile,
    note: "Animated PNG candidate; FiveM NUI playback and PM Emotes integration not yet validated",
    entries: completeManifest,
  }));
  await emit(textFile("preview-index.json", updatedIndex));
  return { archive: adapter.writeFile ? null : makeZip(files), index: updatedIndex, captured: manifest.length, failed: failures.length, skipped: plan.skipped.length };
}
