import type { ViewerController } from "./controller";
import { captureSequence } from "./captureSequence";
import { makeZip, type ExportFile } from "./exportZip";
import { encodeApng } from "./encodeApng";
import type { BatchEntry, BatchSkip, BatchPlan } from "./batchPlan";

export interface BatchProgress {
  completed: number;
  total: number;
  currentId: string | null;
  captured: number;
  failed: number;
}
export interface BatchResult {
  archive: Blob;
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
  const failures: BatchSkip[] = [];
  const manifest: Array<{
    id: string; source: string; category: string; command: string;
    folder: string; media: string; frameCount: number; durationSeconds: number;
    frameRate: number; width: number; height: number; format: "apng";
  }> = [];
  const total = plan.ready.length;
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
      files.push({ name: media, data: encodeApng(frameFiles.map((file) => file.data), 12) });
      manifest.push({
        id: entry.id, source: entry.source, category: entry.category,
        command: entry.command, folder, media, frameCount: capture.frameCount,
        durationSeconds: capture.durationSeconds, frameRate: 12,
        width: 320, height: 320, format: "apng",
      });
    } catch (error) {
      check(adapter.signal);
      failures.push({ id: entry.id, reason: error instanceof Error ? error.message : String(error) });
    }
    progress(i + 1, null);
  }
  files.push(textFile("manifest.json", {
    schemaVersion: 1,
    format: "experimental-apng",
    note: "Animated PNG candidate; FiveM NUI playback and PM Emotes integration not yet validated",
    entries: manifest,
  }));
  files.push(textFile("report.json", {
    schemaVersion: 1,
    planned: total, captured: manifest.length, failed: failures.length,
    skipped: plan.skipped.length, failures, skippedEntries: plan.skipped,
  }));
  return { archive: makeZip(files), captured: manifest.length, failed: failures.length, skipped: plan.skipped.length };
}
