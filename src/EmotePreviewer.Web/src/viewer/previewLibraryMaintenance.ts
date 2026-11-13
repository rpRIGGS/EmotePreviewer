/** Preview library maintenance only touches media under the managed previews tree. */
export interface CleanupPlan { obsolete: string[]; retained: number; inspected: number }

function safePath(path: string): boolean {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === "previews" &&
    parts.slice(1, -1).every((p) => /^[a-zA-Z0-9_-]+$/.test(p)) &&
    parts[parts.length - 1] === "preview.png";
}

async function publishedPaths(root: FileSystemDirectoryHandle): Promise<Set<string>> {
  const file = await (await root.getFileHandle("manifest.json")).getFile();
  const data: unknown = JSON.parse(await file.text());
  if (!data || typeof data !== "object" || (data as {schemaVersion?: unknown}).schemaVersion !== 1 || !Array.isArray((data as {entries?: unknown}).entries)) {
    throw new Error("Missing or invalid published manifest. Cleanup refused.");
  }
  const protectedPaths = new Set<string>();
  for (const entry of (data as {entries: unknown[]}).entries) {
    const media = (entry && typeof entry === "object" ? (entry as {media?: unknown}).media : undefined);
    if (typeof media !== "string" || !safePath(media)) throw new Error("Unsafe manifest entry. Cleanup refused.");
    protectedPaths.add(media);
  }
  // Protect index references too, including a partially completed publication.
  try {
    const indexFile = await (await root.getFileHandle("preview-index.json")).getFile();
    const index: unknown = JSON.parse(await indexFile.text());
    const entries = (index as {entries?: unknown} | null)?.entries;
    if (!index || typeof index !== "object" || (index as {schemaVersion?: unknown}).schemaVersion !== 1 || !entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Invalid preview index. Cleanup refused.");
    for (const record of Object.values(entries)) {
      const media = (record && typeof record === "object" ? (record as {media?: unknown}).media : undefined);
      if (media === "") {
        if ((record as {status?: unknown}).status !== "failed") throw new Error("Empty media in non-failed index record. Cleanup refused.");
        continue;
      }
      if (typeof media !== "string" || !safePath(media)) throw new Error("Unsafe index entry. Cleanup refused.");
      protectedPaths.add(media);
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
  return protectedPaths;
}

export async function planPreviewCleanup(root: FileSystemDirectoryHandle): Promise<CleanupPlan> {
  const protectedPaths = await publishedPaths(root);
  const obsolete: string[] = [];
  let inspected = 0, retained = 0;
  let previews: FileSystemDirectoryHandle;
  try { previews = await root.getDirectoryHandle("previews"); }
  catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return {obsolete, inspected, retained};
    throw error;
  }
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    const iterable = directory as FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
    for await (const [name, handle] of iterable.entries()) {
      const relative = `${prefix}/${name}`;
      if (handle.kind === "directory") {
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Unexpected directory entry. Cleanup refused.");
        await walk(handle as FileSystemDirectoryHandle, relative);
      } else if (name === "preview.png" && safePath(relative)) {
        inspected++;
        if (protectedPaths.has(relative)) retained++;
        else obsolete.push(relative);
      } else {
        throw new Error("Unexpected directory entry. Cleanup refused.");
      }
    }
  };
  await walk(previews, "previews");
  return { obsolete: obsolete.sort(), inspected, retained };
}

export async function deleteObsoletePreviews(root: FileSystemDirectoryHandle): Promise<number> {
  const plan = await planPreviewCleanup(root);
  let removed = 0;
  for (const relative of plan.obsolete) {
    // Re-read publication state before each deletion. A separate window may
    // publish a new manifest while this cleanup is in progress.
    if ((await publishedPaths(root)).has(relative)) continue;
    const parts = relative.split("/");
    let directory = root;
    try {
      for (const segment of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(segment);
      await directory.removeEntry(parts[parts.length - 1]);
      removed++;
    } catch (error) {
      // A concurrent cleanup may have removed the same orphan already.
      // Never suppress permission or filesystem I/O failures.
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }
  return removed;
}
