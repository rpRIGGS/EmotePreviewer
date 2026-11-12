import { emptyPreviewIndex, parsePreviewIndex, PREVIEW_RENDER_VERSION, type PreviewIndex } from "./previewIndex";
import { verifyPreviewFiles } from "./verifyPreviewFiles";

export interface RecoveredLibrary {
  index: PreviewIndex;
  present: ReadonlySet<string>;
  missing: string[];
  recovered: number;
  reconciled: number;
}

function notFound(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

async function readJson(root: FileSystemDirectoryHandle, filename: string): Promise<unknown | null> {
  try {
    const file = await (await root.getFileHandle(filename)).getFile();
    return JSON.parse(await file.text()) as unknown;
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

function safeMedia(media: string): boolean {
  const parts = media.split("/");
  return parts.length >= 3 && parts[0] === "previews" &&
    parts.slice(1, -1).every((part) => /^[a-zA-Z0-9_-]+$/.test(part)) &&
    parts[parts.length - 1] === "preview.png";
}

/** The consumer manifest is the publication boundary. An index left behind
 * by an interrupted export cannot override what was actually published.
 * Recovered records deliberately have an empty fingerprint so they regenerate
 * on the next incremental update, but remain visible until replacement works. */
export async function recoverPreviewLibrary(root: FileSystemDirectoryHandle): Promise<RecoveredLibrary> {
  const rawIndex = await readJson(root, "preview-index.json");
  const index = rawIndex === null ? emptyPreviewIndex() : parsePreviewIndex(rawIndex);
  const rawManifest = await readJson(root, "manifest.json");
  if (rawManifest === null) {
    if (Object.values(index.entries).some((record) => record.status === "generated")) {
      throw new Error("Preview index exists without a published manifest. Recovery refused; preserve the folder and inspect it.");
    }
    // Without a manifest there is no published library. Failed index records
    // are uncommitted attempts and must not survive recovery.
    const reconciled = Object.keys(index.entries).length;
    index.entries = Object.create(null) as PreviewIndex["entries"];
    return { index, present: new Set(), missing: [], recovered: 0, reconciled };
  }
  if (!rawManifest || typeof rawManifest !== "object" ||
    (rawManifest as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((rawManifest as { entries?: unknown }).entries)) {
    throw new Error("Invalid published manifest. Recovery refused.");
  }
  const published = new Map<string, { media: string; frameCount?: number; durationSeconds?: number }>();
  for (const item of (rawManifest as { entries: unknown[] }).entries) {
    if (!item || typeof item !== "object") throw new Error("Invalid published preview record.");
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || ["__proto__", "constructor", "prototype"].includes(record.id) ||
      typeof record.media !== "string" || !safeMedia(record.media) || published.has(record.id)) {
      throw new Error("Unsafe or duplicate published preview record. Recovery refused.");
    }
    published.set(record.id, {
      media: record.media,
      frameCount: typeof record.frameCount === "number" && Number.isFinite(record.frameCount) && record.frameCount > 0 ? record.frameCount : undefined,
      durationSeconds: typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds) && record.durationSeconds > 0 ? record.durationSeconds : undefined,
    });
  }
  let recovered = 0, reconciled = 0;
  for (const [id, record] of published) {
    const old = Object.hasOwn(index.entries, id) ? index.entries[id] : undefined;
    if (old?.status === "generated" && old.media === record.media) {
      // A matching path is not sufficient if the previous index was written
      // for a different renderer; invalidate its fingerprint to force retry.
      if (index.renderVersion !== PREVIEW_RENDER_VERSION) old.fingerprint = "";
      if (!old.frameCount && record.frameCount) old.frameCount = record.frameCount;
      if (!old.durationSeconds && record.durationSeconds) old.durationSeconds = record.durationSeconds;
      continue;
    }
    index.entries[id] = {
      fingerprint: "", media: record.media, status: "generated",
      updatedAt: new Date().toISOString(), frameCount: record.frameCount,
      durationSeconds: record.durationSeconds,
    };
    recovered++;
  }
  for (const id of Object.keys(index.entries)) {
    // The manifest defines all published records, including removals.
    // An unpublished failed record is not a published preview either.
    if (!published.has(id)) {
      delete index.entries[id];
      reconciled++;
    }
  }
  // If the manifest is ahead of the index, all entries with an unknown
  // fingerprint are retried, while verified media remains usable.
  const check = await verifyPreviewFiles(index, root);
  return { index, present: check.present, missing: check.missing, recovered, reconciled };
}
