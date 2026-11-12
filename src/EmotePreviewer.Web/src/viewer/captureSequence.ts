import type { ViewerController } from "./controller";
import { pngDataUrlBytes, type ExportFile } from "./exportZip";

/** Reusable deterministic capture unit. The batch coordinator can call this
 * after each catalog entry has finished loading; it never selects entries. */
export interface CaptureOptions {
  sourceId: string;
  fps?: number;
  maxSeconds?: number;
  width?: number;
  height?: number;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface CapturedSequence {
  files: ExportFile[];
  frameCount: number;
  durationSeconds: number;
}

export async function captureSequence(controller: ViewerController, options: CaptureOptions): Promise<CapturedSequence> {
  const { sourceId, fps = 12, maxSeconds = 3, width = 320, height = 320, signal, onProgress } = options;
  if (!sourceId.trim()) throw new Error("A source ID is required");
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new RangeError("Frame rate must be between 1 and 60");
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > 30) throw new RangeError("Maximum duration must be between 0 and 30 seconds");
  if (!controller.hasPedMesh()) throw new Error("Ped mesh is not loaded");
  const duration = Math.min(controller.timeline.duration, maxSeconds);
  if (!(duration > 0)) throw new Error("No loaded animation duration");
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  const files: ExportFile[] = [];
  const wasPlaying = controller.timeline.playing;
  controller.timeline.pause();
  try {
    onProgress?.(0, frameCount);
    for (let index = 0; index < frameCount; index++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      // Give the UI a chance to paint progress between expensive WebGL reads.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      const png = controller.captureFramePng(index / fps, width, height);
      files.push({ name: `frames/${String(index).padStart(4, "0")}.png`, data: pngDataUrlBytes(png) });
      onProgress?.(index + 1, frameCount);
    }
    files.push({
      name: "capture.json",
      data: new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1, sourceId, frameRate: fps, frameCount, width, height,
        durationSeconds: duration, frameFormat: "png",
        note: "Developer PNG sequence; animated encoding and PM Emotes manifest not yet implemented",
      }, null, 2)),
    });
    return { files, frameCount, durationSeconds: duration };
  } finally {
    if (wasPlaying) controller.timeline.play();
  }
}
