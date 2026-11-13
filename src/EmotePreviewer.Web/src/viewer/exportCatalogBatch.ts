import type { ViewerController } from "./controller";
import { captureSequence } from "./captureSequence";
import { makeZip, type ExportFile } from "./exportZip";
import { encodeApng } from "./encodeApng";
import type { BatchEntry, BatchSkip, BatchPlan } from "./batchPlan";
import { PREVIEW_RENDER_VERSION, type PreviewIndex } from "./previewIndex";

export interface BatchProgress {
  completed: number;
  total: number;
  currentId: string | null;
  captured: number;
  failed: number;
}
export interface BatchResult {
  archive: Blob | null;
  index: PreviewIndex;
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
  previousIndex?: PreviewIndex;
  fingerprints?: ReadonlyMap<string, string>;
  catalog?: readonly BatchEntry[];
  /** Counts from the incremental planner for an accurate complete-run report. */
  summary?: { added?: number; changed?: number; retry?: number; unchanged?: number; removed?: number };
  /** Existing published media verified on disk; a failed recapture must not erase it. */
  verifiedMedia?: ReadonlySet<string>;
  /** Frame capture settings shared by all catalog entries. */
  capture?: { fps?: number; maxSeconds?: number; width?: number; height?: number };
  /** Write files as each emote completes, avoiding an enormous in-memory ZIP. */
  writeFile?: (path: string, data: Uint8Array) => Promise<void>;
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
  // Refuse ambiguous catalogs before writing a single file. Duplicate IDs
  // would otherwise let one capture silently replace another in the index.
  // Validate the complete catalog even when no emotes need recapturing.
  // Otherwise a no-op incremental export can silently publish ambiguous IDs.
  if (!plan || !adapter) throw new Error("Invalid batch export plan or adapter");
  const completeCatalog = adapter.catalog ?? plan.ready;
  if (!Array.isArray(completeCatalog) || !Array.isArray(plan.ready) || !Array.isArray(plan.skipped)) {
    throw new Error("Invalid batch export plan or catalog");
  }
  if (completeCatalog.some((entry) => !entry || typeof entry !== "object") ||
      plan.ready.some((entry) => !entry || typeof entry !== "object")) {
    throw new Error("Invalid batch catalog entry");
  }
  // Reject unsafe imported IDs before using them as object-map keys.
  if (completeCatalog.some((entry) => typeof entry.id !== "string" ||
      entry.id === "__proto__" || entry.id === "constructor" || entry.id === "prototype")) {
    throw new Error("Unsafe export catalog identifier");
  }
  // A downloaded ZIP cannot borrow media from a folder. Reject an incremental
  // plan that would publish a partial package; the desktop UI requests rebuild.
  if (!adapter.writeFile && plan.ready.length !== completeCatalog.length) {
    throw new Error("Standalone ZIP requires a full rebuild of the export catalog");
  }
  const catalogIds = completeCatalog.map((entry) => entry.id);
  const catalogIdSet = new Set(catalogIds);
  if (catalogIdSet.size !== catalogIds.length) throw new Error("Duplicate emote identifiers in export catalog.");
  if (plan.ready.some((entry) => !catalogIdSet.has(entry.id))) throw new Error("Export plan contains an emote absent from the full catalog.");
  if (new Set(plan.ready.map((entry) => entry.id)).size !== plan.ready.length) throw new Error("Duplicate emote identifiers in export plan.");
  // Stems are filesystem components, not trusted display labels. Two distinct
  // emotes sharing a stem would overwrite one another inside the same run.
  const stems = plan.ready.map((entry) => entry.outputStem);
  if (stems.some((stem) => !/^[a-zA-Z0-9_-]+$/.test(stem))) throwãİí¢G§²ÚîÆ­yÚ\ÚYYYXK™Ù]
][KšY
HOOH™XÛÜ™›YYXJHÛÛ[YNÂˆËÈÈ›İ[™[[ˆ[œİ[Yš[HÜˆ™\Ù\™H]Èš[™Ù\œš[\Èİ\œ™[‚ˆËÈX\šÈ]˜Z[YÛÈH™^[˜Ü™[Y[[\ÜÈ™]šY\ÈHZ\ÜÚ[™È™]šY]Ë‚ˆ\]Y[™^™[šY\ÖÚ][KšYHHÂˆš[™Ù\œš[ˆ™XÛÜ™™š[™Ù\œš[ˆYYXNˆˆ‹ˆİ]\Îˆ™˜Z[Y‹ˆ\]Y]ˆ™]È]J
KÒTÓÔİš[™Ê
KˆNÂˆBˆËÈHH[[İ\ÈÛÛœİ[Y\ˆ[™^\ÈHÜšYÚ[˜[Ûİ\˜ÙKØØ]YÛÜKØÛÛ[X[™š\K‚ˆËÈ™Z™Xİ[XšYİ[İ\È^ÜÈ™Y›Ü™HX›XØ][Ûˆ[œİXYÙˆÚ[[H›Ü[™ÂˆËÈ[ˆ[HÜˆ\ÜÚYÛš[™ÈHÜ›Û™È[š[X]Y™]šY]È[ˆH•RK‚ˆÛÛœİY[]RÙ^\ÈH™]ÈÙ]İš[™ÏŠ
NÂˆÛÛœİX›\ÚYYÈH™]ÈÙ]İš[™ÏŠ
NÂˆ›Üˆ
ÛÛœİ][HÙˆÛÛ\]SX[šY™\İ
HÂˆÛÛœİY[]HH”ÓÓ‹œİš[™ÚYJÚ][KœÛİ\˜ÙKÓİÙ\Ø\ÙJ
K][K˜Ø]YÛÜKÓİÙ\Ø\ÙJ
K][K˜ÛÛ[X[™ÓİÙ\Ø\ÙJ
WJNÂˆYˆ
Y[]RÙ^\Ëš\ÊY[]JJH›İÈ™]È\œ›ÜŠ\XØ]HX›\ÚY™]šY]ÈY[]Nˆ	ÚY[]_X
NÂˆYˆ
X›\ÚYYËš\Ê][KšY
JH›İÈ™]È\œ›ÜŠ\XØ]HX›\ÚY™]šY]ÈQˆ	Ú][KšYX
NÂˆY[]RÙ^\Ë˜Y
Y[]JNÂˆX›\ÚYYË˜Y
][KšY
NÂˆYˆ
Z][KœÛİ\˜ÙHZ][K˜Ø]YÛÜHZ][K˜ÛÛ[X[™Z][KšY
HÂˆ›İÈ™]È\œ›ÜŠ”X›\ÚY™]šY]ÈY[]HÛÛZ[œÈ[ˆ[\HšY[ŠNÂˆBˆBˆËÈH™\šYšYYš[H\È›İ›ÛÙˆ][\ÜYØ\\™HY]Y]H\È˜[Y‚ˆËÈÚXÚÈ[X™\ˆ\\È™Y›Ü™H\š]Y]XÎˆ˜Sˆİ\Ú\ÙHÛ\È›İYÚ]™\BˆËÈÛÛ\\š\ÛÛˆ[™Ø[ˆ™HX›\ÚY\ÈH]\ÚX›HX[šY™\İ™XÛÜ™‚ˆ›Üˆ
ÛÛœİ][HÙˆÛÛ\]SX[šY™\İ
HÂˆYˆ
S[X™\‹š\Ò[YÙ\Š][K™œ˜[YPÛİ[
H][K™œ˜[YPÛİ[HˆS[X™\‹š\Ñš[š]J][K™\˜][Û”ÙXÛÛ™ÊH][K™\˜][Û”ÙXÛÛ™ÈHˆS[X™\‹š\Ò[YÙ\Š][K™œ˜[YT˜]JH][K™œ˜[YT˜]HHˆS[X™\‹š\Ò[YÙ\Š][KÚY
H][KÚYHˆS[X™\‹š\Ò[YÙ\Š][KšZYÚ
H][KšZYÚJHÂˆ›İÈ™]È\œ›ÜŠ[˜ÛÛ\]H™]šY]ÈØ\\™HY]Y]Nˆ	Ú][KšYX
NÂˆBˆYˆ
][K™œ˜[YT˜]HOOHœÈ][KÚYOOHÚY][KšZYÚOOHZYÚ
HÂˆ›İÈ™]È\œ›ÜŠ™]šY]È›Ùš[HZ\ÛX]Ú›Üˆ	Ú][KšYX
NÂˆBˆYˆ
][K™\˜][Û”ÙXÛÛ™ÈˆX^ÙXÛÛ™È][K™œ˜[YPÛİ[ˆX]˜ÙZ[
X^ÙXÛÛ™È
ˆœÊHˆ][K™œ˜[YPÛİ[OOHX]˜ÙZ[
][K™\˜][Û”ÙXÛÛ™È
ˆœÊJHÂˆ›İÈ™]È\œ›ÜŠ™]šY]È\˜][Û‹Ùœ˜[YHZ\ÛX]Ú›Üˆ	Ú][KšYX
NÂˆBˆBˆËÈHÛÛ\]HX[šY™\İ]\İ™]™\ˆÛÛZ[ˆ\XØ]H]Ë]™[ˆÚ[ˆBˆËÈY[]Y\ÈY™™\‹ˆXXÚT‘È\ÈİÛ™YH^XİHÛ™HØ][ÙÈ[K‚ˆÛÛœİX›\ÚY]ÈH™]ÈÙ]İš[™ÏŠ
NÂˆ›Üˆ
ÛÛœİ][HÙˆÛÛ\]SX[šY™\İ
HÂˆYˆ
X›\ÚY]Ëš\Ê][K›YYXJJHÂˆ›İÈ™]È\œ›ÜŠ][\H™]šY]ÈY[]Y\È™Y™\™[˜ÙHHØ[YHYYXNˆ	Ú][K›YYX_X
NÂˆBˆX›\ÚY]Ë˜Y
][K›YYXJNÂˆBˆËÈ˜[Y]H[š[˜[X›XØ][Ûˆ™Y™\™[˜Ù\È™Y›Ü™H[Z][™ÈY]Y]K‚ˆËÈYYXH]È]\İ™[XZ[ˆÚ][ˆİ\ˆ[[]]X›H™]šY]È™YK‚ˆ›Üˆ
ÛÛœİ][HÙˆÛÛ\]SX[šY™\İ
HÂˆYˆ
K×œ™]šY]Ü×ÖØK^KVŒNWËWJ×ÖØK^KVŒNWËWJ×Ü™]šY]×œ™ÉË\İ
][K›YYXJJHÂˆ›İÈ™]È\œ›ÜŠ[œØY™HX›\ÚYYYXH]›Üˆ	Ú][KšYX
NÂˆBˆBˆÚXÚÊY\\‹œÚYÛ˜[
NÂˆ]ØZ][Z]
^š[Jœ™\ÜšœÛÛˆ‹ÂˆØÚ[XU™\œÚ[ÛˆKˆ[›™Yˆİ[Ø\\™YˆX[šY™\İ›[™İ˜Z[Yˆ˜Z[\™\Ë›[™İˆX›\ÚYˆÛÛ\]SX[šY™\İ›[™İˆ™]Z[™YY\‘˜Z[\™Nˆ™]Z[™YY\‘˜Z[\™KœÚ^™KˆYYˆY\\‹œİ[[X\OË˜YYÏÈˆÚ[™ÙYˆY\\‹œİ[[X\OË˜Ú[™ÙYÏÈˆ™]NˆY\\‹œİ[[X\OËœ™]HÏÈˆ[˜Ú[™ÙYˆY\\‹œİ[[X\OË[˜Ú[™ÙYÏÈˆ™[[İ™YˆY\\‹œİ[[X\OËœ™[[İ™YÏÈˆÚÚ\Yˆ[‹œÚÚ\Y›[™İØ\\™T›Ùš[K˜Z[\™\ËÚÚ\Y[šY\Îˆ[‹œÚÚ\YˆJJNÂˆËÈİYÙHH›ÙXÙ\ˆ[™^š\œİˆHÛÛœİ[Y\ˆX[šY™\İ\ÈHTÕˆËÈX›XØ][ÛˆÜš]Nˆ˜Z[\™H™Y›Ü™H]X]™\ÈH™]š[İ\ÈX[šY™\İ[XİˆËÈ[™™XÛİ™\H™XÛÛ˜Ú[\È[HİYÙY[™^™XÛÜ™ÈYØZ[œİ]X[šY™\İ‚ˆËÈ\È\ÈH™XÛİ™\˜X›HÛÛ[Z]›İØÛÛ›İH][KYš[H]ÛZXÈ™[˜[YK‚ˆ]ØZ][Z]
^š[Jœ™]šY]ËZ[™^šœÛÛˆ‹\]Y[™^
JNÂˆ]ØZ][Z]
^š[J›X[šY™\İšœÛÛˆ‹ÂˆØÚ[XU™\œÚ[ÛˆKˆX›XØ][Û’Yˆ[’Yˆ›Ü›X]ˆ™^\š[Y[[X\™È‹ˆØ\\™T›Ùš[Kˆ›İNˆ[š[X]Y‘ÈØ[™Y]NÈš]™SH•RH^X˜XÚÈ[™H[[İ\È[YÜ˜][Ûˆ›İY]˜[Y]Y‹ˆ[šY\ÎˆÛÛ\]SX[šY™\İˆJJNÂˆ™]\›ˆÈ\˜Ú]™NˆY\\‹Üš]Qš[HÈ[ˆXZÙVš\
š[\ÊK[™^ˆ\]Y[™^Ø\\™YˆX[šY™\İ›[™İ˜Z[Yˆ˜Z[\™\Ë›[™İÚÚ\Yˆ[‹œÚÚ\Y›[™İNÂŸB