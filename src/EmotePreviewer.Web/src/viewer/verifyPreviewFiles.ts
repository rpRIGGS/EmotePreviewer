import type { PreviewIndex } from "./previewIndex";

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
      // The media is a PNG/APNG, not just an arbitrary nonempty file.
      // Checking the fixed signature catches partial/incorrect copies before
      // an incremental update marks them safe to retain.
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (file.size >= 33 && pngSignature.every((byte, at) => header[at] === byte)) present.add(id);
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
