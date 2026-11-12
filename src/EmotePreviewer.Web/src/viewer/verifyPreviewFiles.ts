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
    if (segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
      missing.push(id);
      continue;
    }
    try {
      let dir = root;
      for (const segment of segments.slice(0, -1)) dir = await dir.getDirectoryHandle(segment);
      const file = await (await dir.getFileHandle(segments[segments.length - 1])).getFile();
      if (file.size > 0) present.add(id);
      else missing.push(id);
    } catch {
      missing.push(id);
    }
  }
  return { present, missing, checked };
}
