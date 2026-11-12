import type { EmoteDto } from "../shared/types";

/** Deterministic catalog plan shared by a future batch coordinator and the
 * PM Emotes package writer. Does not load animations or assume NUI paths. */
export interface BatchEntry {
  id: string;
  source: string;
  category: string;
  command: string;
  outputStem: string;
}
export interface BatchSkip {
  id: string;
  reason: string;
}
export interface BatchPlan {
  ready: BatchEntry[];
  skipped: BatchSkip[];
}

function safeSegment(value: string): string {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "emote";
}

// FNV-1a hash disambiguates names that normalize to the same filename.
function hashId(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function planCatalogBatch(entries: readonly EmoteDto[]): BatchPlan {
  const ready: BatchEntry[] = [];
  const skipped: BatchSkip[] = [];
  const seen = new Set<string>();
  for (const entry of [...entries].sort((a, b) => a.id.localeCompare(b.id))) {
    if (seen.has(entry.id)) {
      skipped.push({ id: entry.id, reason: "duplicate catalog ID" });
      continue;
    }
    seen.add(entry.id);
    if (!entry.previewable || entry.kind !== "animation" || !entry.dictionary || !entry.clip) {
      skipped.push({ id: entry.id, reason: entry.previewReason ?? `unsupported kind: ${entry.kind}` });
      continue;
    }
    ready.push({
      id: entry.id,
      source: entry.source,
      category: entry.category,
      command: entry.command,
      outputStem: `${safeSegment(entry.source)}_${safeSegment(entry.category)}_${safeSegment(entry.command)}_${hashId(entry.id)}`,
    });
  }
  return { ready, skipped };
}
