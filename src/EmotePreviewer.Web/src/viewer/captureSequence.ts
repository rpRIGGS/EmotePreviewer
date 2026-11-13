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
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048) {
    throw new RangeError("Capture dimensions must be positive integers no greater than 2048");
  }
  if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  if (!controller.hasPedMesh()) throw new Error("Ped mesh is not loaded");
  const duration = Math.min(controller.timeline.duration, maxSeconds);
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error("No valid loaded animation duration");
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  if (frameCount > 1800) throw new RangeError("Capture exceeds maximum APNG frame count");
  const files: ExportFile[] = [];
  const wasPlaying = controller.timeline.playing;
  controller.timeline.pause();
  let captureStarted = false;
  try {
    // Include beginCapture in the protected region. If camera setup throws,
    // the developer's playback must still be restored.
    controller.beginCapture?.();
    captureStarted = true;
    onProgress?.(0, frameCount);
    for (let index = 0; index < frameCount; index++) {
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      // Give the UI a chance to paint progress between expensive WebGL reads.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      // Avoid floating-point drift past the loaded clip endpoint. The last
      // frame represents the last full frame interval before duration.
      const sampleTime = Math.min(index / fps, duration);
      const png = controller.captureFramePng(sampleTime, width, height);
      files.push({ name: `frames/${String(index).padStart(4, "0")}.png`, data: pngDataUrlBytes(png) });
      onProgress?.(index + 1, frameCount);
    }
    files.push({
      name: "capture.json",
      data: new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1, sourceId, frameRate: fps, frameCount, width, height,
        durationSeconds: duration, frameFormat: "png",
        note: "Developer PNG frame sequence; the catalog batch exporter encodes animated APNG separately",
      }, null, 2)),
    });
    return { files, frameCount, durationSeconds: duration };
  } finally {
    try { if (captureStarted) controller.endCapture?.(); }
    finally { if (wasPlaying) controller.timeline.play(); }
  }
}
