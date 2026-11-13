import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type LoadedClip, type LoadedMesh } from "../shared/api";
import { errorText, useT } from "../shared/i18n";
import { PedPicker, usePedList } from "../shared/PedPicker";
import { selectEntry, selectSecondary, useAppStore, type EmoteRow } from "../shared/store";
import type { ClipMetaDto, EmoteSlot, PropDto, ViewerSettings } from "../shared/types";
import { ViewerController, type ClipTiming, type Slot } from "./controller";
import type { CameraPreset } from "./scene";
import { makeZip } from "./exportZip";
import { captureSequence } from "./captureSequence";
import { exportCatalogBatch } from "./exportCatalogBatch";
import { emptyPreviewIndex, fingerprintEmote, parsePreviewIndex, planIncrementalBatch, type PreviewIndex } from "./previewIndex";
import { planCatalogBatch } from "./batchPlan";
import { verifyPreviewFiles } from "./verifyPreviewFiles";
import { planPreviewCleanup, deleteObsoletePreviews } from "./previewLibraryMaintenance";
import { recoverPreviewLibrary } from "./recoverPreviewLibrary";
import { waitForBatchReady } from "./waitForBatchReady";

type ViewState =
  | { kind: "idle" }
  | { kind: "waitingGta" }
  | { kind: "notPreviewable"; reason: string }
  | { kind: "loading" }
  | { kind: "ready"; meta: ClipMetaDto; layer: EmoteSlot }
  | { kind: "error"; message: string };

const DEFAULT_PED = "mp_m_freemode_01";
const LAYERS: EmoteSlot[] = ["primary", "secondary"];

/** One clip to load into a layer of a rig, with how it sits on the timeline. */
interface ClipSpec {
  key: string;
  timing: ClipTiming;
  load: (signal: AbortSignal) => Promise<LoadedClip>;
}

/** What one rig of the viewer should show: which ped, which clip per animation slot and which props. */
interface SlotSpec {
  ped: string;
  clips: Record<EmoteSlot, ClipSpec | null>;
  props: PropDto[];
}

type ClipState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; key: string; meta: ClipMetaDto } | { kind: "error"; message: string };

/**
 * Loads one layer's clip into the controller; the previous request is aborted when the selection changes quickly.
 * A rebuilt catalog (a rescan, possibly automatic after a converter wrote the file) may mean the clip on screen was
 * rewritten: its meta is re-fetched, and when the ETag differs the data is swapped in place, keeping the playhead.
 */
function useLayerClip(controllerRef: React.RefObject<ViewerController | null>, slot: Slot, layer: EmoteSlot, spec: ClipSpec | null, skeletonReady: boolean, catalogRevision: number): ClipState {
  const [state, setState] = useState<ClipState>({ kind: "idle" });
  const key = spec?.key ?? null;
  const delay = spec?.timing.delay ?? 0;
  const loop = spec?.timing.loop ?? false;
  useEffect(() => {
    const controller = controllerRef.current;
    if (!spec || !skeletonReady) {
      controller?.clearClip(slot, layer);
      setState({ kind: "idle" });
      return;
    }
    const abort = new AbortController();
    setState({ kind: "loading" });
    spec
      .load(abort.signal)
      .then((clip: LoadedClip) => {
        if (abort.signal.aborted) return;
        controllerRef.current?.loadClip(slot, layer, clip, { delay, loop }, true);
        setState({ kind: "ready", key: spec.key, meta: clip.meta });
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        const message = err instanceof ApiError ? errorText(err.code, err.message) : err instanceof Error ? err.message : String(err);
        controllerRef.current?.clearClip(slot, layer);
        setState({ kind: "error", message });
      });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerRef, slot, layer, key, skeletonReady, delay, loop]);

  const loadedETag = useRef<string | null>(null);
  useEffect(() => {
    loadedETag.current = state.kind === "ready" ? state.meta.eTag : null;
  }, [state]);
  useEffect(() => {
    if (!spec || !skeletonReady || loadedETag.current === null) return;
    const abort = new AbortController();
    const load = spec.load;
    load(abort.signal)
      .then((clip: LoadedClip) => {
        if (abort.signal.aborted || clip.meta.eTag === loadedETag.current) return;
        controllerRef.current?.replaceClip(slot, layer, clip);
        setState({ kind: "ready", key: spec.key, meta: clip.meta });
      })
      .catch(() => undefined);
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRevision]);

  return state;
}

/**
 * Drives one rig of the controller from a spec: loads the ped's skeleton (from the server's cache before indexing,
 * from the game data afterwards), then the mannequin, the props and the clips. A null spec empties the rig.
 */
function useRigSlot(controllerRef: React.RefObject<ViewerController | null>, slot: Slot, spec: SlotSpec | null, gtaReady: boolean, statusSkeleton: string | null, showMesh: boolean, showProps: boolean, catalogRevision: number) {
  const [rigPed, setRigPed] = useState<string | null>(null);
  const [skeletonError, setSkeletonError] = useState<string | null>(null);
  const [meshState, setMeshState] = useState<"none" | "loading" | "ready" | "error">("none");
  const [hasCloth, setHasCloth] = useState(false);
  const [propStatus, setPropStatus] = useState<{ key: string; state: "loading" | "ready" | "error"; message?: string } | null>(null);
  const ped = spec?.ped ?? null;
  const skeletonReady = rigPed !== null && ped !== null && rigPed.toLowerCase() === ped.toLowerCase();

  // A 503 (nothing cached yet) is retried when the game data becomes ready; a 404 (unknown ped) is shown.
  useEffect(() => {
    const controller = controllerRef.current;
    if (!ped) {
      controller?.removeRig(slot);
      setRigPed(null);
      setSkeletonError(null);
      return;
    }
    const abort = new AbortController();
    setSkeletonError(null);
    api
      .skeleton(ped, abort.signal)
      .then((skeleton) => {
        if (abort.signal.aborted) return;
        controllerRef.current?.setSkeleton(slot, skeleton);
        setRigPed(skeleton.name);
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        if (err instanceof ApiError && err.status !== 503) setSkeletonError(errorText(err.code, err.message));
      });
    return () => abort.abort();
  }, [controllerRef, slot, ped, gtaReady, statusSkeleton]);

  // The ped mesh is fetched once per rig (and only when the user turned it on): the server picks the default drawable
  // of every component slot. A partial result (some components failed) is shown but retried on the next status change.
  const meshKey = useRef<string | null>(null);
  useEffect(() => {
    if (!showMesh || !skeletonReady || !gtaReady || !rigPed) return;
    const key = rigPed.toLowerCase();
    if (meshKey.current === key) return;
    meshKey.current = key;
    const abort = new AbortController();
    setMeshState("loading");
    api
      .ped(rigPed, abort.signal)
      .then((p) => Promise.all(p.components.map((c) => api.pedComponent(rigPed, c.slot, abort.signal).catch(() => null))))
      .then((loaded) => {
        if (abort.signal.aborted) {
          meshKey.current = null;
          return;
        }
        const ok = loaded.filter((m): m is LoadedMesh => m !== null);
        if (ok.length < loaded.length) meshKey.current = null;
        controllerRef.current?.setPedMesh(slot, ok);
        setHasCloth(ok.some((m) => m.meta.subMeshes.some((s) => s.cloth)));
        setMeshState(ok.length > 0 ? "ready" : "error");
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        meshKey.current = null;
        controllerRef.current?.setPedMesh(slot, []);
        setHasCloth(false);
        setMeshState("error");
      });
    return () => abort.abort();
  }, [controllerRef, slot, showMesh, skeletonReady, gtaReady, rigPed]);
  useEffect(() => {
    if (!ped) meshKey.current = null;
  }, [ped]);

  // Props: meshes that are unavailable are skipped silently.
  const props = spec?.props ?? [];
  const propKey = props.map((p) => `${p.model}@${p.bone}:${p.available}`).join("|");
  const clipKeys = LAYERS.map((l) => spec?.clips[l]?.key ?? "").join("|");
  useEffect(() => {
    const controller = controllerRef.current;
    if (!spec || !skeletonReady || (!spec.clips.primary && !spec.clips.secondary)) {
      controller?.clearProps(slot);
      setPropStatus({ key: propKey, state: "ready" });
      return;
    }
    const wanted = props.filter((p) => p.available !== false && p.model);
    if (wanted.length === 0) {
      controller?.clearProps(slot);
      setPropStatus({ key: propKey, state: "ready" });
      return;
    }
    const abort = new AbortController();
    setPropStatus({ key: propKey, state: "loading" });
    Promise.all(
      wanted.map((prop) =>
        api
          .propMesh(prop.model, abort.signal)
          .then((mesh): { prop: typeof prop; mesh: LoadedMesh } => ({ prop, mesh })),
      ),
    ).then((loaded) => {
      if (abort.signal.aborted) return;
      controllerRef.current?.setProps(slot, loaded);
      setPropStatus({ key: propKey, state: "ready" });
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      controllerRef.current?.clearProps(slot);
      setPropStatus({ key: propKey, state: "error", message: error instanceof Error ? error.message : String(error) });
    });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerRef, slot, propKey, clipKeys, skeletonReady, rigPed]);

  const primary = useLayerClip(controllerRef, slot, "primary", spec?.clips.primary ?? null, skeletonReady, catalogRevision);
  const secondary = useLayerClip(controllerRef, slot, "secondary", spec?.clips.secondary ?? null, skeletonReady, catalogRevision);

  const propsReady = !showProps || (propStatus?.key === propKey && propStatus.state === "ready");
  const propError = showProps && propStatus?.key === propKey && propStatus.state === "error" ? propStatus.message ?? "Prop mesh failed to load" : null;
  return { rigPed, skeletonReady, skeletonError, clips: { primary, secondary } as Record<EmoteSlot, ClipState>, meshState, hasCloth, propsReady, propError };
}

/**
 * The movement clip set whose `idle` stands in for an empty primary slot (the game's neutral pose is the movement
 * style's idle, not the bind pose): the female generic set for female peds, none for animals (their sets are
 * per-creature and rarely have a plain idle).
 */
function idleClipSet(ped: string): string | null {
  const name = ped.toLowerCase();
  if (name.startsWith("a_c_")) return null;
  return /(^|_)f_/.test(name) ? "move_f@generic" : "move_m@generic";
}

/** Canvas, overlay messages and the transport bar. three.js state lives in ViewerController, not in React. */
export function Viewer() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<ViewerController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [showExportPlan, setShowExportPlan] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<{ captured: number; failed: number; skipped: number; unchanged: number; removed: number; destination: string } | null>(null);
  const [previewIndex, setPreviewIndex] = useState<PreviewIndex>(() => {
    try { return parsePreviewIndex(JSON.parse(localStorage.getItem("emotePreviewer.previewIndex.v1") ?? "null")); }
    catch { return emptyPreviewIndex(); }
  });
  const [rebuildAll, setRebuildAll] = useState(false);
  const [verifiedMedia, setVerifiedMedia] = useState<ReadonlySet<string> | null>(null);
  const [previewDirectory, setPreviewDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);
  const maintenanceLockRef = useRef(false);
  const batchAbortRef = useRef<AbortController | null>(null);
  const readyRef = useRef<{ id: string | null; ready: boolean; error: string | null }>({ id: null, ready: false, error: null });

  const status = useAppStore((s) => s.status);
  const connected = useAppStore((s) => s.connected);
  const settings = useAppStore((s) => s.settings);
  const catalogEntries = useAppStore((s) => s.entries);
  const entry = useAppStore(selectEntry);
  const secondary = useAppStore(selectSecondary);
  const manualClip = useAppStore((s) => s.manualClip);
  const saveSettings = useAppStore((s) => s.saveSettings);

  const showHelpers = settings?.viewer.showHelperBones ?? false;
  const rootMotion = settings?.viewer.rootMotion ?? false;
  const showProps = settings?.viewer.showProps ?? true;
  const showMesh = settings?.viewer.showMesh ?? false;
  const showTextures = settings?.viewer.showTextures ?? true;
  const showCloth = settings?.viewer.showCloth ?? true;
  const animalPeds = settings?.viewer.animalPeds ?? true;
  const showPartner = settings?.viewer.showPartner ?? true;
  const exportPlan = planIncrementalBatch(
    catalogEntries, previewIndex, settings?.ped ?? DEFAULT_PED,
    settings?.partnerPed ?? settings?.ped ?? DEFAULT_PED,
    showPartner, rebuildAll ? "rebuild" : "update", verifiedMedia ?? undefined,
  );
  const exportDestination = previewDirectory ? "Selected preview folder" : "Self-contained ZIP download";
  const gtaReady = status?.gta === "ready";
  const statusSkeleton = status?.skeleton ?? null;
  // Animal emotes switch the viewer to their animal ped; everything else uses the configured one.
  const activePed = (animalPeds && entry?.ped) || settings?.ped || DEFAULT_PED;
  const partner = entry?.partner ?? null;
  const partnerPed = (animalPeds && partner?.ped) || settings?.partnerPed || settings?.ped || DEFAULT_PED;

  // Create / dispose the three.js controller with the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new ViewerController(canvas);
    controller.onFinished = () => setPlaying(false);
    controllerRef.current = controller;
    (window as unknown as { __emotePreviewer?: unknown }).__emotePreviewer = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // While the server is gone the "exited" overlay (blurred, full screen) covers the canvas; drawing under it would
  // only make the compositor re-blur the whole window every frame, so the loop stops until the connection is back.
  useEffect(() => controllerRef.current?.scene.setPaused(connected === false), [connected]);
  useEffect(() => controllerRef.current?.setHelpers(}yçÝ-¢G§²ÚîÆ­yÔotype" ||
    !record || typeof record !== "object" ||
    typeof record.fingerprint !== "string" || typeof record.media !== "string" ||
    (record.status !== "generated" && record.status !== "failed"))) {
    throw new Error("Invalid previous preview index record");
  }
  const updatedIndex: PreviewIndex = {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION, publicationId: runId,
    entries: Object.assign(Object.create(null) as PreviewIndex["entries"], adapter.previousIndex?.entries ?? {}),
  };
  const progress = (completed: number, currentId: string | null) =>
    adapter.onProgress?.({ completed, total, currentId, captured: manifest.length, failed: failures.length });
  progress(0, null);
  for (let i = 0; i < total; i++) {
    check(adapter.signal);
    const entry = plan.ready[i];
    progress(i, entry.id);
    // Capture/encode failures are per-emote and should not stop the catalog.
    // Filesystem failures are different: abort immediately so we never publish
    // a manifest that claims to reference media that could not be installed.
    let encoded: Uint8Array | null = null;
    let frameCount = 0;
    let durationSeconds = 0;
    try {
      const controller = await adapter.load(entry, adapter.signal ?? new AbortController().signal);
      check(adapter.signal);
      const capture = await captureSequence(controller, { sourceId: entry.id, signal: adapter.signal, fps, width, height, maxSeconds });
      const frameFiles = capture.files.filter((file) => file.name.endsWith(".png"));
      encoded = encodeApng(frameFiles.map((file) => file.data), fps);
      frameCount = capture.frameCount;
      durationSeconds = capture.durationSeconds;
    } catch (error) {
      check(adapter.signal);
      failures.push({ id: entry.id, reason: error instanceof Error ? error.message : String(error) });
      // Preserve verified last-known-good media. Keep its original fingerprint
      // so the next incremental update still attempts regeneration.
      const previous = Object.hasOwn(updatedIndex.entries, entry.id) ? updatedIndex.entries[entry.id] : undefined;
      if (previous?.status === "generated" && previous.media && adapter.writeFile && adapter.verifiedMedia?.has(entry.id) &&
          Number.isInteger(previous.frameCount) && (previous.frameCount ?? 0) > 0 &&
          Number.isFinite(previous.durationSeconds) && (previous.durationSeconds ?? 0) > 0 &&
          (previous.durationSeconds ?? 0) <= maxSeconds &&
          previous.frameCount === Math.ceil((previous.durationSeconds ?? 0) * fps)) {
        // Keep the old preview visible, but invalidate its fingerprint so the
        // next update retries even if the rendering inputs are unchanged.
        updatedIndex.entries[entry.id] = { ...previous, fingerprint: "" };
        retainedAfterFailure.add(entry.id);
      } else {
        updatedIndex.entries[entry.id] = {
          fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media: "",
          status: "failed", updatedAt: new Date().toISOString(),
        };
      }
    }
    if (encoded) {
      const folder = `previews/${entry.outputStem}/${runId}`;
      const media = `${folder}/preview.png`;
      // Do not catch writer errors here: incomplete exports must never publish
      // a new manifest or index.
      await emit({ name: media, data: encoded });
      updatedIndex.entries[entry.id] = {
        fingerprint: adapter.fingerprints?.get(entry.id) ?? "", media,
        status: "generated", updatedAt: new Date().toISOString(), frameCount, durationSeconds,
      };
      manifest.push({
        id: entry.id, source: entry.source, category: entry.category,
        command: entry.command, folder, media, frameCount,
        durationSeconds, frameRate: fps,
        width, height, format: "apng",
      });
    }
    progress(i + 1, null);
  }
  // A delta export must still publish a complete manifest.
  const catalog = adapter.catalog ?? plan.ready;
  const currentIds = catalogIdSet;
  for (const id of Object.keys(updatedIndex.entries)) {
    if (!currentIds.has(id)) delete updatedIndex.entries[id];
  }
  const capturedById = new Map(manifest.map((item) => [item.id, item]));
  // ZIP output must be self-contained. Only direct-to-folder export can
  // reference existing verified media from a previous generation.
  const completeManifest = catalog.flatMap((item) => {
    const record = Object.hasOwn(updatedIndex.entries, item.id) ? updatedIndex.entries[item.id] : undefined;
    if (!record || record.status !== "generated" || !record.media) return [];
    // Only newly written media or previously verified on-disk media may be
    // published. An imported index alone is not evidence that a file exists.
    if (!capturedById.has(item.id) && (!adapter.writeFile || !adapter.verifiedMedia?.has(item.id))) return [];
    const captured = capturedById.get(item.id);
    return [captured ?? {
      id: item.id, source: item.source, category: item.category,
      command: item.command, folder: record.media.slice(0, record.media.lastIndexOf("/")),
      media: record.media, frameCount: record.frameCount ?? 0, durationSeconds: record.durationSeconds ?? 0,
      frameRate: fps, width, height, format: "apng" as const,
    }];
  });
  // The published index and manifest must describe the same installed media.
  // An imported index may contain stale generated entries that were never
  // copied to this folder; those are NOT a valid source for future deltas.
  const publishedMedia = new Map(completeManifest.map((entry) => [entry.id, entry.media]));
  for (const item of catalog) {
    const record = Object.hasOwn(updatedIndex.entries, item.id) ? updatedIndex.entries[item.id] : undefined;
    if (!record || record.status !== "generated") continue;
    if (publishedMedia.get(item.id) === record.media) continue;
    // Do not invent an installed file or preserve its fingerprint as current.
    // Mark it failed so the next incremental pass retries the missing preview.
    updatedIndex.entries[item.id] = {
      fingerprint: record.fingerprint,
      media: "",
      status: "failed",
      updatedAt: new Date().toISOString(),
    };
  }
  // The PM Emotes consumer indexes the original source/category/command triple.
  // Reject ambiguous exports before publication instead of silently dropping
  // an entry or assigning the wrong animated preview in the NUI.
  const identityKeys = new Set<string>();
  const publishedIds = new Set<string>();
  for (const item of completeManifest) {
    const identity = JSON.stringify([item.source.toLowerCase(), item.category.toLowerCase(), item.command.toLowerCase()]);
    if (identityKeys.has(identity)) throw new Error(`Duplicate published preview identity: ${identity}`);
    if (publishedIds.has(item.id)) throw new Error(`Duplicate published preview ID: ${item.id}`);
    identityKeys.add(identity);
    publishedIds.add(item.id);
    if (!item.source || !item.category || !item.command || !item.id) {
      throw new Error("Published preview identity contains an empty field");
    }
  }
  // A verified file is not proof that imported capture metadata is valid.
  // Check number types before arithmetic: NaN otherwise slips through every
  // comparison and can be published as a plausible manifest record.
  for (const item of completeManifest) {
    if (!Number.isInteger(item.frameCount) || item.frameCount < 1 ||
        !Number.isFinite(item.durationSeconds) || item.durationSeconds <= 0 ||
        !Number.isInteger(item.frameRate) || item.frameRate < 1 ||
        !Number.isInteger(item.width) || item.width < 1 ||
        !Number.isInteger(item.height) || item.height < 1) {
      throw new Error(`Incomplete preview capture metadata: ${item.id}`);
    }
    if (item.frameRate !== fps || item.width !== width || item.height !== height) {
      throw new Error(`Preview profile mismatch for ${item.id}`);
    }
    if (item.durationSeconds > maxSeconds || item.frameCount > Math.ceil(maxSeconds * fps) ||
        item.frameCount !== Math.ceil(item.durationSeconds * fps)) {
      throw new Error(`Preview duration/frame mismatch for ${item.id}`);
    }
  }
  // A complete manifest must never contain duplicate paths, even when the
  // identities differ. Each APNG is owned by exactly one catalog entry.
  const publishedPaths = new Set<string>();
  for (const item of completeManifest) {
    if (publishedPaths.has(item.media)) {
      throw new Error(`Multiple preview identities reference the same media: ${item.media}`);
    }
    publishedPaths.add(item.media);
  }
  // Validate all final publication references before emitting metadata.
  // Media paths must remain within our immutable preview tree.
  for (const item of completeManifest) {
    if (!/^previews\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/preview\.png$/.test(item.media)) {
      throw new Error(`Unsafe published media path for ${item.id}`);
    }
  }
  check(adapter.signal);
  await emit(textFile("report.json", {
    schemaVersion: 1,
    planned: total, captured: manifest.length, failed: failures.length,
    published: completeManifest.length,
    retainedAfterFailure: retainedAfterFailure.size,
    added: adapter.summary?.added ?? 0,
    changed: adapter.summary?.changed ?? 0,
    retry: adapter.summary?.retry ?? 0,
    unchanged: adapter.summary?.unchanged ?? 0,
    removed: adapter.summary?.removed ?? 0,
    skipped: plan.skipped.length, captureProfile, failures, skippedEntries: plan.skipped,
  }));
  // Stage the producer index first. The consumer manifest is the LAST
  // publication write: failure before it leaves the previous manifest intact,
  // and recovery reconciles any staged index records against that manifest.
  // This is a recoverable commit protocol, not a multi-file atomic rename.
  await emit(textFile("preview-index.json", updatedIndex));
  await emit(textFile("manifest.json", {
    schemaVersion: 1,
    publicationId: runId,
    format: "experimental-apng",
    captureProfile,
    note: "Animated PNG candidate; FiveM NUI playback and PM Emotes integration not yet validated",
    entries: completeManifest,
  }));
  return { archive: adapter.writeFile ? null : makeZip(files), index: updatedIndex, captured: manifest.length, failed: failures.length, skipped: plan.skipped.length };
}
