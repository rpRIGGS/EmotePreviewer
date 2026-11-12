import type { EmoteDto } from "../shared/types";
import { planCatalogBatch, type BatchEntry, type BatchPlan } from "./batchPlan";

export const PREVIEW_INDEX_VERSION = 1;
export const PREVIEW_RENDER_VERSION = "apng-320x320-12fps-v1";

export interface PreviewIndexRecord {
  fingerprint: string;
  media: string;
  status: "generated" | "failed";
  updatedAt: string;
  /** Original metadata retained for unchanged previews in the complete manifest. */
  frameCount?: number;
  durationSeconds?: number;
}
export interface PreviewIndex {
  schemaVersion: 1;
  renderVersion: string;
  entries: Record<string, PreviewIndexRecord>;
}
export interface IncrementalPlan {
  plan: BatchPlan;
  unchanged: BatchEntry[];
  removed: string[];
  changed: string[];
  added: string[];
  retry: string[];
}
export function emptyPreviewIndex(): PreviewIndex {
  return { schemaVersion: PREVIEW_INDEX_VERSION, renderVersion: PREVIEW_RENDER_VERSION, entries: Object.create(null) as Record<string, PreviewIndexRecord> };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ":" + stable(obj[key])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}
/** Fingerprints rendering inputs rather than display labels or catalog order. */
export function fingerprintEmote(emote: EmoteDto, ped: string, partnerPed: string, showPartner: boolean): string {
  return stable({
    renderVersion: PREVIEW_RENDER_VERSION,
    dictionary: emote.dictionary, clip: emote.clip, flag: emote.flag,
    slot: emote.slot, upperBody: emote.upperBody, loop: emote.loop,
    durationMs: emote.durationMs, startDelayMs: emote.startDelayMs,
    ped: emote.ped ?? ped, props: emote.props,
    partner: showPartner ? emote.partner : null,
    partnerPed: showPartner ? partnerPed : null,
    animalPedSelection: emote.ped !== null,
  });
}
export function parsePreviewIndex(value: unknown): PreviewIndex {
  if (!value || typeof value !== "object") throw new Error("Invalid preview index");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || typeof input.entries !== "object" || !input.entries || Array.isArray(input.entries)) {
    throw new Error("Unsupported preview index format");
  }
  const entries: Record<string, PreviewIndexRecord> = Object.create(null);
  for (const [id, raw] of Object.entries(input.entries)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    if (typeof record.fingerprint !== "string" || typeof record.media !== "string" ||
      (record.status !== "generated" && record.status !== "failed") || typeof record.updatedAt !== "string") continue;
    // Imported indexes are untrusted JSON; never accept prototype keys.
    if (id === "__proto__" || id === "constructor" || id === "prototype") continue;
    const frameCount = typeof record.frameCount === "number" && Number.isFinite(record.frameCount) && record.frameCount > 0 ? record.frameCount : undefined;
    const durationSeconds = typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds) && record.durationSeconds > 0 ? record.durationSeconds : undefined;
    entries[id] = { fingerprint: record.fingerprint, media: record.media, status: record.status, updatedAt: record.updatedAt, frameCount, durationSeconds };
  }
  return { schemaVersion: 1, renderVersion: typeof input.renderVersion === "string" ? input.renderVersion : "", entries };
}
/** Caller must ensure retained media actually exists in the installed preview library.
 * An index alone cannot prove a file is still present on disk. */
export function planIncrementalBatch(
  emotes: readonly EmoteDto[], index: PreviewIndex, ped: string, partnerPed: string,
  showPartner: boolean, mode: "update" | "rebuild" = "update", verifiedMedia?: ReadonlySet<string>,
): IncrementalPlan {
  const full = planCatalogBatch(emotes);
  // Imported metadata is never proof of an installed preview. Without
  // explicit verification, schedule regeneration of every existing entry.
  const byId = new Map(emotes.map((emote) => [emote.id, emote]));
  const ready: BatchEntry[] = [], unchanged: BatchEntry[] = [];
  const added: string[] = [], changed: string[] = [], retry: string[] = [];
  for (const entry of full.ready) {
    const previous = Object.hasOwn(index.entries, entry.id) ? index.entries[entry.id] : undefined;
    const fingerprint = fingerprintEmote(byId.get(entry.id)!, ped, partnerPed, showPartner);
    if (!previous) added.push(entry.id);
    else if (previous.status !== "generated" || !verifiedMedia?.has(entry.id)) retry.push(entry.id);
    else if (previous.fingerprint !== fingerprint || index.renderVersion !== PREVIEW_RENDER_VERSION) changed.push(entry.id);
    else if (mode === "update") { unchanged.push(entry); continue; }
    ready.push(entry);
  }
  const present = new Set(full.ready.map((emote) => emote.id));
  const removed = Object.keys(index.entries).filter((id) => !present.has(id)).sort();
  return { plan: { ready, skipped: full.skipped }, unchanged, removed, added, changed, retry };
}
