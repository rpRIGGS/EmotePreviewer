import type { PreviewIndex } from "./previewIndex";
import { inspectPreviewApng } from "./inspectPreviewApng";

export interface PreviewDiskCheck {
  present: Set<string>;
  missing: string[];
  checked: number;
}
/** Check files under a user-selected preview-library root. No browser storage
 * permissions are assumed; the caller obtains a directory handle by gesture. */
export async function verifyPreviewFiles(
  index: PreviewIndex, root: FileSystemDirectoryHandle,
): Promise<PreviewDiskCheck> {
  const present = new Set<string>();
  const missing: string[] = [];
  let checked = 0;
  for (const [id, record] of Object.entries(index.entries)) {
    if (record.status !== "generated") continue;
    checked++;
    const segments = record.media.split("/");
    if (segments.length !== 4 || segments[0] !== "previews" || segments[segments.length - 1] !== "preview.png" ||
      segments.slice(1, -1).some((segment) => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
      missing.push(id);
      continue;
    }
    try {
      let dir = root;
      for (const segment of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(segment);
      const file = await (await dir.getFileHandle(segments[segments.length - 1])).getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      let info;
      try { info = inspectPreviewApng(bytes); }
      catch { missing.push(id); continue; }
      // The index is also untrusted. Retain media only when its bytes agree
      // with the capture metadata that the consumer manifest will publish.
      if (record.frameCount === info.frameCount && record.durationSeconds === info.frameCount / info.frameRate) present.add(id);
      else missing.push(id);
    } catch (error) {
      // Missing media is recoverable. Permission revocation, disk I/O errors,
      // and other failures must not be mistaken for a deleted preview.
      if (!(error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError"))) throw error;
      missing.push(id);
    }
  }
  return { present, missing, checked };
}
