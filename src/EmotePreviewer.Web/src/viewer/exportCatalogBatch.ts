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
    try {
      const controller = await adapter.load(entry, adapter.signal ?? new AbortController().signal);
      check(adapter.signal);
      const capture = await captureSequence(controller, { sourceId: entry.id, signal: adapter.signal });
      const folder = `previews/${entry.outputStem}`;
      const frameFiles = capture.files.filter((file) => file.name.endsWith(".png"));
      const media = `${folder}/preview.png`;
      await emit({ name: media, data: encodeApng(frameFiles.map((file) => file.data), 12) });
      updatedIndex.entries[entry.id] = {
        fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media,
        status: "generated", updatedAt: new Date().toISOString(),
      };
      manifest.push({
        id: entry.id, source: entry.source, category: entry.category,
        command: entry.command, folder, media, frameCount: capture.frameCount,
        durationSeconds: capture.durationSeconds, frameRate: 12,
        width: 320, height: 320, format: "apng",
      });
    } catch (error) {
      check(adapter.signal);
      failures.push({ id: entry.id, reason: error instanceof Error ? error.message : String(error) });
      updatedIndex.entries[entry.id] = {
        fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media: "",
        status: "failed", updatedAt: new Date().toISOString(),
      };
    }
    progress(i + 1, null);
  }
  // A delta export must still publish a complete manifest.
  const catalog = adapter.catalog ?? plan.ready;
  const currentIds = new Set(catalog.map((item) => item.id));
  for (const id of Object.keys(updatedIndex.entries)) {
    if (!currentIds.has(id)) delete updatedIndex.entries[id];
  }
  const capturedById = new Map(manifest.map((item) => [item.id, item]));
  const completeManifest = catalog.flatMap((item) => {
    const record = Object.hasOwn(updatedIndex.entries, item.id) ? updatedIndex.entries[item.id] : undefined;
    if (!record || record.status !== "generated" || !record.media) return [];
    const captured = capturedById.get(item.id);
    return [captured ?? {
      id: item.id, source: item.source, category: item.category,
      command: item.command, folder: record.media.slice(0, record.media.lastIndexOf("/")),
      media: record.media, frameCount: 0, durationSeconds: 0,
      frameRate: 12, width: 320, height: 320, format: "apng" as const,
    }];
  });
  await emit(textFile("report.json", {
    schemaVersion: 1,
    planned: total, captured: manifest.length, failed: failures.length,
    skipped: plan.skipped.length, failures, skippedEntries: plan.skipped,
  }));
  await emit(textFile("preview-index.json", updatedIndex));
  // Publish the consumer manifest last, after all media and bookkeeping.
  await emit(textFile("manifest.json", {
    schemaVersion: 1,
    format: "experimental-apng",
    note: "Animated PNG candidate; FiveM NUI playback and PM Emotes integration not yet validated",
    entries: completeManifest,
  }));
  return { archive: adapter.writeFile ? null : makeZip(files), index: updatedIndex, captured: manifest.length, failed: failures.length, skipped: plan.skipped.length };
}
