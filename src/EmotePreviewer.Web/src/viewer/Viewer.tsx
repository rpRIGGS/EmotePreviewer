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
function useRigSlot(controllerRef: React.RefObject<ViewerController | null>, slot: Slot, spec: SlotSpec | null, gtaReady: boolean, statusSkeleton: string | null, showMesh: boolean, catalogRevision: number) {
  const [rigPed, setRigPed] = useState<string | null>(null);
  const [skeletonError, setSkeletonError] = useState<string | null>(null);
  const [meshState, setMeshState] = useState<"none" | "loading" | "ready" | "error">("none");
  const [hasCloth, setHasCloth] = useState(false);
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
    if (!spec || props.length === 0 || !skeletonReady || (!spec.clips.primary && !spec.clips.secondary)) {
      controller?.clearProps(slot);
      return;
    }
    const abort = new AbortController();
    const wanted = props.filter((p) => p.available !== false && p.model);
    Promise.all(
      wanted.map((prop) =>
        api
          .propMesh(prop.model, abort.signal)
          .then((mesh): { prop: typeof prop; mesh: LoadedMesh | null } => ({ prop, mesh }))
          .catch(() => ({ prop, mesh: null })),
      ),
    ).then((loaded) => {
      if (!abort.signal.aborted) controllerRef.current?.setProps(slot, loaded);
    });
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controllerRef, slot, propKey, clipKeys, skeletonReady, rigPed]);

  const primary = useLayerClip(controllerRef, slot, "primary", spec?.clips.primary ?? null, skeletonReady, catalogRevision);
  const secondary = useLayerClip(controllerRef, slot, "secondary", spec?.clips.secondary ?? null, skeletonReady, catalogRevision);

  return { rigPed, skeletonReady, skeletonError, clips: { primary, secondary } as Record<EmoteSlot, ClipState>, meshState, hasCloth };
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
  useEffect(() => controllerRef.current?.setHelpers(showHelpers), [showHelpers]);
  useEffect(() => controllerRef.current?.setRootMotion(rootMotion), [rootMotion]);
  useEffect(() => controllerRef.current?.setPropsVisible(showProps), [showProps]);
  useEffect(() => controllerRef.current?.setMeshVisible(showMesh), [showMesh]);
  useEffect(() => controllerRef.current?.setTextures(showTextures), [showTextures]);
  useEffect(() => controllerRef.current?.setCloth(showCloth), [showCloth]);

  // The main ped's two animation slots follow the game: an emote whose flag says SECONDARY plays only its upper body,
  // over the primary or, with none, over the movement style's idle (the clip's leg tracks are dropped, as in game);
  // anything else is the primary, whole body. The lower list only offers secondaries and, while it is open, the upper
  // list only primaries, so the two never compete for a slot. A manual clip is a whole-body experiment. Animal peds
  // have no idle clip here, so their secondaries play whole-body instead. With nothing picked the rig just stands.
  const entryPlayable = entry !== null && (manualClip !== null || entry.previewable);
  const idleSet = idleClipSet(activePed);
  const entryLayer: EmoteSlot = entry && entry.slot === "secondary" && manualClip === null && idleSet !== null ? "secondary" : "primary";
  const layers: Record<EmoteSlot, EmoteRow | null> = { primary: null, secondary: null };
  if (entry && entryPlayable) layers[entryLayer] = entry;
  if (secondary && secondary.previewable && !layers.secondary) layers.secondary = secondary;

  const clipOf = (e: EmoteRow, layer: EmoteSlot): ClipSpec => {
    if (e === entry && manualClip) {
      return { key: `manual:${manualClip.dictionary}/${manualClip.clip}@${activePed}`, timing: { delay: 0, loop: e.loop }, load: (signal) => api.dictionaryClip(manualClip.dictionary, manualClip.clip, activePed, signal) };
    }
    // The start delay belongs to the shared-emote pair of the selected entry; a layered secondary starts at once.
    const delay = e === entry ? e.startDelayMs / 1000 : 0;
    return { key: `emote:${e.id}@${activePed}#${layer}`, timing: { delay, loop: e.loop }, load: (signal) => api.emoteClip(e.id, activePed, signal) };
  };
  const idleSpec: ClipSpec | null =
    !layers.primary && layers.secondary && gtaReady && idleSet ? { key: `idle:${idleSet}@${activePed}`, timing: { delay: 0, loop: true }, load: (signal) => api.clipSetClip(idleSet, "idle", activePed, signal) } : null;
  const mainSpec: SlotSpec = {
    ped: activePed,
    clips: {
      primary: layers.primary ? clipOf(layers.primary, "primary") : idleSpec,
      secondary: layers.secondary ? clipOf(layers.secondary, "secondary") : null,
    },
    props: [...(layers.primary?.props ?? []), ...(layers.secondary?.props ?? [])],
  };
  // The partner rig exists only for shared emotes with a resolved, previewable partner while the toggle is on. A
  // manual clip is a solo experiment on the main ped, so the partner steps aside.
  const partnerActive = showPartner && entryPlayable && manualClip === null && partner !== null && partner.previewable;
  const partnerSpec: SlotSpec | null =
    partnerActive && partner
      ? {
          ped: partnerPed,
          clips: {
            primary: { key: `emote:${partner.id}@${partnerPed}`, timing: { delay: partner.startDelayMs / 1000, loop: partner.loop }, load: (signal) => api.emoteClip(partner.id, partnerPed, signal) },
            secondary: null,
          },
          props: partner.props,
        }
      : null;

  const catalogRevision = useAppStore((s) => s.catalogRevision);
  const main = useRigSlot(controllerRef, "main", mainSpec, gtaReady, statusSkeleton, showMesh, catalogRevision);
  const second = useRigSlot(controllerRef, "partner", partnerSpec, gtaReady, statusSkeleton, showMesh, catalogRevision);

  // Placement follows the selected entry; the controller applies it once both rigs exist.
  const placement = partnerActive ? (partner?.placement ?? null) : null;
  useEffect(() => controllerRef.current?.setPlacement(placement), [placement]);

  // Playing state mirrors the timeline: a loaded clip autoplays, anything else stops it.
  useEffect(() => {
    setPlaying(controllerRef.current?.timeline.playing ?? false);
  }, [main.clips.primary, main.clips.secondary]);

  // The overlay and the transport follow the selected entry, or the secondary while nothing is selected.
  const focus = entry ?? secondary;
  const focusLayer: EmoteSlot = entry ? entryLayer : "secondary";
  let view: ViewState;
  if (!focus) view = { kind: "idle" };
  else if (entry && !entryPlayable) view = { kind: "notPreviewable", reason: entry.previewReason ?? "kind" };
  else if (!entry && secondary && !secondary.previewable) view = { kind: "notPreviewable", reason: secondary.previewReason ?? "kind" };
  else if (!main.skeletonReady) view = main.skeletonError ? { kind: "error", message: main.skeletonError } : { kind: "waitingGta" };
  else {
    const state = main.clips[focusLayer];
    if (state.kind === "ready" && state.key === mainSpec.clips[focusLayer]?.key) view = { kind: "ready", meta: state.meta, layer: focusLayer };
    else if (state.kind === "error") view = { kind: "error", message: state.message };
    else view = { kind: "loading" };
  }
  // The asynchronous batch adapter reads the latest React readiness snapshot.
  // Never capture a previously selected animation while the next clip loads.
  readyRef.current = {
    id: entry?.id ?? null,
    ready: view.kind === "ready" && showMesh && main.meshState === "ready" && (!partnerActive || (second.clips.primary.kind === "ready" && second.meshState === "ready")),
    error: view.kind === "error" ? view.message : main.meshState === "error" ? "Ped mesh failed to load" : null,
  };
  const primaryMeta = main.clips.primary.kind === "ready" ? main.clips.primary.meta : null;

  // Space toggles playback unless a form control has the focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA" || target.tagName === "BUTTON")) return;
      e.preventDefault();
      toggle();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const toggle = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || controller.timeline.duration <= 0) return;
    controller.timeline.toggle();
    setPlaying(controller.timeline.playing);
  }, []);

  const setPref = (patch: Partial<ViewerSettings>) => {
    if (!settings) return;
    void saveSettings({ ...settings, viewer: { ...settings.viewer, ...patch } }).catch(() => undefined);
  };

  /**
   * Developer-only proof of concept: export the currently selected, fully loaded
   * emote as a deterministic PNG frame sequence. This does not yet encode WebP/WebM
   * or batch across the catalog.
   */
  const exportSelected = async () => {
    const controller = controllerRef.current;
    if (!controller || !entry || view.kind !== "ready" || exporting || maintenanceLockRef.current) return;
    setExportError(null);
    setExportProgress(null);
    setExporting(true);
    try {
      const safeId = entry.id.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 100);
      const { files } = await captureSequence(controller, {
        sourceId: entry.id,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      const blob = makeZip(files);
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `emote-capture-${safeId || "preview"}.zip`;
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const exportBatch = async () => {
    if (exporting || maintenanceLockRef.current || !gtaReady || !showMesh || main.meshState === "error") return;
    const abort = new AbortController();
    batchAbortRef.current = abort;
    setExporting(true);
    setExportError(null);
    setLastBatchResult(null);
    setBatchProgress("Preparing catalog…");
    const original = useAppStore.getState();
    const originalId = original.selectedId;
    const originalLayering = original.layering;
    const originalSecondary = original.secondaryId;
    const originalManual = original.manualClip;
    try {
      // Keep one visible emote at a time. A prior secondary clip can
      // otherwise contaminate the export of the next selected animation.
      useAppStore.getState().setLayering(false);
      useAppStore.getState().setSecondary(null);
      useAppStore.getState().setManualClip(null);
      // Shared animations must be rendered with both characters when enabled;
      // avoid mutating the saved viewer preference during batch capture.
      const emotes = useAppStore.getState().entries;
      // A selected folder is the source of truth, not a potentially stale browser cache.
      // Re-read its index and verify media immediately before planning each export.
      let activeIndex = previewIndex;
      let activeMedia = verifiedMedia;
      if (previewDirectory) {
        const recovered = await recoverPreviewLibrary(previewDirectory);
        activeIndex = recovered.index;
        activeMedia = recovered.present;
        setPreviewIndex(activeIndex);
        setVerifiedMedia(activeMedia);
        if (recovered.recovered || recovered.reconciled) {
          setBatchProgress(`Recovered ${recovered.recovered} published previews; reconciled ${recovered.reconciled} unpublished index records.`);
        }
      }
      if (!rebuildAll && !activeMedia && Object.values(activeIndex.entries).some((record) => record.status === "generated")) {
        throw new Error("Verify the existing preview folder before an incremental update, or select Rebuild all.");
      }
      const ped = settings?.ped ?? DEFAULT_PED;
      const partnerPed = settings?.partnerPed ?? ped;
      // ZIP downloads must be self-contained; force a full catalog rebuild when
      // there is no selected output folder, regardless of incremental toggle.
      const exportMode = !previewDirectory || rebuildAll ? "rebuild" : "update";
      const incremental = planIncrementalBatch(emotes, activeIndex, ped, partnerPed, showPartner, exportMode, activeMedia ?? undefined);
      const plan = incremental.plan;
      if (!plan.ready.length && !incremental.removed.length && previewDirectory) {
        setBatchProgress(`Nothing to export: ${incremental.unchanged.length} unchanged`);
        return;
      }
      const fingerprints = new Map(emotes.map((e) => [e.id, fingerprintEmote(e, ped, partnerPed, showPartner)]));
      const result = await exportCatalogBatch(plan, {
        signal: abort.signal,
        capture: { fps: 12, width: 320, height: 320, maxSeconds: 3 },
        previousIndex: activeIndex,
        verifiedMedia: activeMedia ?? undefined,
        fingerprints,
        catalog: planCatalogBatch(emotes).ready,
        writeFile: previewDirectory ? async (path, data) => {
          const parts = path.split("/");
          if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes(":"))) {
            throw new Error("Unsafe preview export path");
          }
          let directory = previewDirectory;
          for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
          const handle = await directory.getFileHandle(parts[parts.length - 1], { create: true });
          const writable = await handle.createWritable();
          try { await writable.write(new Blob([new Uint8Array(data)])); await writable.close(); }
          catch (error) {
            // Aborting a failed write is best-effort; an abort failure must not
            // replace the original filesystem error that caused the export to stop.
            try { await writable.abort(); } catch { /* preserve original error */ }
            throw error;
          }
        } : undefined,
        onProgress: (p) => setBatchProgress(`Emotes ${p.completed}/${p.total} · captured ${p.captured} · failed ${p.failed}`),
        load: async (item, signal) => {
          useAppStore.getState().select(null);
          // Force a React render and clip teardown before selecting the next
          // entry; do not reuse the previous clip's ready state.
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
          if (signal.aborted) throw new DOMException("Batch cancelled", "AbortError");
          useAppStore.getState().select(item.id);
          return waitForBatchReady({
            id: item.id, signal, timeoutMs: 45000,
            snapshot: () => ({ ...readyRef.current, controller: controllerRef.current }),
          });
        },
      });
      if (result.archive) {
      const url = URL.createObjectURL(result.archive);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "emote-catalog-apng-previews.zip";
        link.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      }
      if (previewDirectory) {
        // Re-open the published index rather than trusting an in-memory success
        // after a write. The next update will always recheck the folder too.
        const published = await (await previewDirectory.getFileHandle("preview-index.json")).getFile();
        const installedIndex = parsePreviewIndex(JSON.parse(await published.text()));
        const checked = await verifyPreviewFiles(installedIndex, previewDirectory);
        setPreviewIndex(installedIndex);
        localStorage.setItem("emotePreviewer.previewIndex.v1", JSON.stringify(installedIndex));
        setVerifiedMedia(checked.present);
        if (checked.missing.length) {
          throw new Error(`Export completed but ${checked.missing.length} published preview files are missing; verify the folder and retry.`);
        }
      }
      setLastBatchResult({ captured: result.captured, failed: result.failed, skipped: result.skipped, unchanged: incremental.unchanged.length, removed: incremental.removed.length, destination: previewDirectory ? "Selected folder" : "ZIP download" });
      setBatchProgress(`Completed: ${result.captured} captured, ${result.failed} failed, ${incremental.unchanged.length} unchanged, ${incremental.removed.length} removed${previewDirectory ? " · saved to selected folder" : " · ZIP downloaded"}`);
      // The exported preview-index.json is authoritative for future updates.
      // Import it after installing the new media to avoid marking missing files complete.
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
      setBatchProgress(abort.signal.aborted ? "Batch cancelled; previously published previews remain intact." : "Batch interrupted; check the preview folder before retrying.");
    } finally {
      useAppStore.getState().select(originalId);
      useAppStore.getState().setLayering(originalLayering);
      if (originalLayering) useAppStore.getState().setSecondary(originalSecondary);
      useAppStore.getState().setManualClip(originalManual);
      batchAbortRef.current = null;
      setExporting(false);
    }
  };

  const camera = (preset: CameraPreset) => controllerRef.current?.setCamera(preset);

  // Ped switchers in the HUD: popovers with the same picker as the settings page. Write settings.ped / settings.partnerPed.
  const [pedMenu, setPedMenu] = useState<"main" | "partner" | null>(null);
  const pedList = usePedList(gtaReady && pedMenu !== null);
  const pedMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pedMenu) return;
    const onDown = (e: PointerEvent) => {
      if (!pedMenuRef.current?.contains(e.target as Node)) setPedMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPedMenu(null);
    };
    addEventListener("pointerdown", onDown);
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("pointerdown", onDown);
      removeEventListener("keydown", onKey);
    };
  }, [pedMenu]);
  // The popover stays open after a pick so several peds can be tried in a row; Esc, the button or a click outside closes it.
  const choosePed = (ped: string) => {
    if (!settings) return;
    if (pedMenu === "partner") {
      const partnerPedNext = ped === settings.ped ? null : ped;
      if (partnerPedNext === settings.partnerPed) return;
      void saveSettings({ ...settings, partnerPed: partnerPedNext }).catch(() => undefined);
    } else {
      if (ped === settings.ped) return;
      void saveSettings({ ...settings, ped }).catch(() => undefined);
    }
  };

  const hasPartner = partner !== null;
  const anyProps = mainSpec.props.length > 0 || (partner?.props.length ?? 0) > 0;
  return (
    <section className="viewer">
      <div className="viewer-stage">
        <canvas ref={canvasRef} className="viewer-canvas" />
        <div className="viewer-hud" ref={pedMenuRef}>
          <span className="viewer-hud-group peds">
            <button type="button" className={`ped-button mono${pedMenu === "main" ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={pedMenu === "main"} disabled={!gtaReady} title={t("viewer.ped.title")} onClick={() => setPedMenu((v) => (v === "main" ? null : "main"))}>
              {activePed}
              {entry?.ped && animalPeds ? <span className="tag">{t("viewer.ped.animal")}</span> : null}
            </button>
            {partnerActive && (
              <button type="button" className={`ped-button mono${pedMenu === "partner" ? " on" : ""}`} aria-haspopup="listbox" aria-expanded={pedMenu === "partner"} disabled={!gtaReady} title={t("viewer.partner.ped.title")} onClick={() => setPedMenu((v) => (v === "partner" ? null : "partner"))}>
                <span className="tag">{t("viewer.partner.tag")}</span>
                {partnerPed}
                {partner?.ped && animalPeds ? <span className="tag">{t("viewer.ped.animal")}</span> : null}
              </button>
            )}
          </span>
          {pedMenu && (
            <div className="ped-popover" role="dialog" aria-label={pedMenu === "partner" ? t("settings.partnerPed.title") : t("settings.ped.title")}>
              {pedMenu === "partner" && settings?.partnerPed && (
                <button type="button" className="link" onClick={() => choosePed(settings.ped)}>
                  {t("viewer.partner.same")}
                </button>
              )}
              {pedList ? <PedPicker peds={pedList} selected={pedMenu === "partner" ? (settings?.partnerPed ?? settings?.ped ?? DEFAULT_PED) : (settings?.ped ?? DEFAULT_PED)} onSelect={choosePed} autoFocus /> : <p className="hint">{t("common.loading")}</p>}
            </div>
          )}
          <button type="button" className={showHelpers ? "on" : ""} aria-pressed={showHelpers} onClick={() => setPref({ showHelperBones: !showHelpers })} title="MH_ / PH_ / IK_ / RB_">
            {t("viewer.helperBones")}
          </button>
          <button type="button" className={rootMotion ? "on" : ""} aria-pressed={rootMotion} disabled={primaryMeta !== null && !primaryMeta.hasRootMotion} onClick={() => setPref({ rootMotion: !rootMotion })}>
            {t("viewer.rootMotion")}
          </button>
          <button type="button" className={showProps ? "on" : ""} aria-pressed={showProps} disabled={!anyProps} onClick={() => setPref({ showProps: !showProps })}>
            {t("viewer.props")}
          </button>
          <button type="button" className={showMesh ? "on" : ""} aria-pressed={showMesh} disabled={!gtaReady} title={main.meshState === "error" || second.meshState === "error" ? t("viewer.mesh.failed") : undefined} onClick={() => setPref({ showMesh: !showMesh })}>
            {t("viewer.mesh")}
            {showMesh && (main.meshState === "loading" || second.meshState === "loading") && <span className="spinner" aria-hidden="true" />}
          </button>
          <button type="button" className={showTextures ? "on" : ""} aria-pressed={showTextures} disabled={!gtaReady} onClick={() => setPref({ showTextures: !showTextures })}>
            {t("viewer.textures")}
          </button>
          <button
            type="button"
            className={showCloth ? "on" : ""}
            aria-pressed={showCloth}
            disabled={!gtaReady || !showMesh || !(main.hasCloth || second.hasCloth)}
            title={t("viewer.cloth.title")}
            onClick={() => setPref({ showCloth: !showCloth })}
          >
            {t("viewer.cloth")}
          </button>
          <button
            type="button"
            className={animalPeds ? "on" : ""}
            aria-pressed={animalPeds}
            disabled={!entry?.ped && !partner?.ped}
            title={entry?.ped ? t("viewer.animalPed.title", { ped: entry.ped }) : partner?.ped ? t("viewer.animalPed.title", { ped: partner.ped }) : undefined}
            onClick={() => setPref({ animalPeds: !animalPeds })}
          >
            {t("viewer.animalPed")}
          </button>
          <button type="button" className={showPartner ? "on" : ""} aria-pressed={showPartner} disabled={!hasPartner} title={t("viewer.partner.title")} onClick={() => setPref({ showPartner: !showPartner })}>
            {t("viewer.partner")}
            {partnerActive && second.clips.primary.kind === "loading" && <span className="spinner" aria-hidden="true" />}
          </button>
          <span className="viewer-hud-group" role="group" aria-label={t("viewer.camera")}>
            <button type="button" onClick={() => camera("front")}>{t("viewer.camera.front")}</button>
            <button type="button" onClick={() => camera("side")}>{t("viewer.camera.side")}</button>
            <button type="button" onClick={() => camera("top")}>{t("viewer.camera.top")}</button>
            <button type="button" onClick={() => camera("reset")}>{t("viewer.camera.reset")}</button>
          </span>
        </div>
        <div className="viewer-axes mono">
          {main.rigPed ?? ""}
          {second.rigPed && partnerActive ? ` + ${second.rigPed}` : ""}
          {main.rigPed ? " · " : ""}
          {t("viewer.axes")}
        </div>
        <div style={{ position: "absolute", right: 12, bottom: 12, zIndex: 5, display: "flex", alignItems: "center", gap: 8 }}>
          {exportError && <span role="alert" style={{ color: "#ff9c9c", fontSize: 12 }}>{exportError}</span>}
          <label style={{ fontSize: 12 }}><input type="checkbox" checked={rebuildAll} onChange={(e) => setRebuildAll(e.target.checked)} disabled={exporting || maintenanceBusy} /> Rebuild all</label>
          <button type="button" disabled={exporting || maintenanceBusy} title="Select the preview library folder for direct incremental export and verification"
            onClick={() => {
              const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
              if (!picker) { setExportError("Directory verification requires a browser supporting the File System Access API."); return; }
              void picker.call(window).then(async (directory) => {
                const recovered = await recoverPreviewLibrary(directory);
                setPreviewIndex(recovered.index);
                setPreviewDirectory(directory);
                return recovered;
              }).then((result) => {
                setVerifiedMedia(result.present);
                setBatchProgress(`Verified ${result.present.size} previews; ${result.missing.length} missing; ${result.recovered} recovered from manifest; ${result.reconciled} unpublished index records reconciled`);
                setExportError(null);
              }).catch((error: unknown) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                setExportError(error instanceof Error ? error.message : String(error));
              });
            }}>Select preview folder</button>
          {previewDirectory && <span title="Current direct-export destination" style={{ fontSize: 12 }}>Folder: {previewDirectory.name}</span>}
          <button type="button" disabled={exporting || maintenanceBusy || !previewDirectory}
            title="Review obsolete generated media and remove only unreferenced preview files"
            onClick={() => {
              if (!previewDirectory || exporting || maintenanceLockRef.current) return;
              maintenanceLockRef.current = true;
              setMaintenanceBusy(true);
              void (async () => {
                const plan = await planPreviewCleanup(previewDirectory);
                if (!plan.obsolete.length) {
                  setBatchProgress(`Cleanup checked ${plan.inspected} previews; none obsolete.`);
                  return;
                }
                if (!window.confirm(`Delete ${plan.obsolete.length} unreferenced preview files? ${plan.retained} published previews will be retained. This cannot be undone.`)) return;
                const removed = await deleteObsoletePreviews(previewDirectory);
                setBatchProgress(`Removed ${removed} obsolete preview files; published media preserved.`);
              })().catch((error: unknown) => setExportError(error instanceof Error ? error.message : String(error)))
                .finally(() => { maintenanceLockRef.current = false; setMaintenanceBusy(false); });
            }}>Clean old previews</button>
          {previewDirectory && <button type="button" disabled={exporting || maintenanceBusy} onClick={() => {
            setPreviewDirectory(null);
            setVerifiedMedia(null);
            setBatchProgress("Preview folder disconnected; exports will download a ZIP.");
          }}>Disconnect folder</button>}
          <label style={{ fontSize: 12, cursor: "pointer" }}>
            Import preview index
            <input type="file" accept=".json,application/json" disabled={exporting || maintenanceBusy} style={{ width: 120 }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void file.text().then((content) => {
                  const parsed = parsePreviewIndex(JSON.parse(content));
                  setPreviewIndex(parsed);
                  setVerifiedMedia(null);
                  localStorage.setItem("emotePreviewer.previewIndex.v1", JSON.stringify(parsed));
                  setBatchProgress(`Loaded index with ${Object.keys(parsed.entries).length} records`);
                  setExportError(null);
                }).catch((error: unknown) => setExportError(error instanceof Error ? error.message : String(error)));
                e.target.value = "";
              }} />
          </label>
          <button type="button" disabled={exporting || maintenanceBusy} aria-expanded={showExportPlan}
            onClick={() => setShowExportPlan((open) => !open)}>
            {showExportPlan ? "Hide export plan" : "Review export plan"}
          </button>
          {showExportPlan && (
            <div role="region" aria-label="Preview export plan" style={{
              position: "absolute", right: 0, bottom: 48, width: 360, maxWidth: "90vw",
              padding: 14, borderRadius: 8, background: "#171d29", color: "#fff",
              boxShadow: "0 6px 24px #0008", fontSize: 12, lineHeight: 1.7,
            }}>
              <strong>PowerMoves preview production</strong>
              <div>Destination: {exportDestination}</div>
              <div>Mode: {rebuildAll ? "Rebuild all" : "Incremental update"}</div>
              <div>Ready to capture: {exportPlan.plan.ready.length} · Unchanged: {exportPlan.unchanged.length}</div>
              <div>New: {exportPlan.added.length} · Changed: {exportPlan.changed.length} · Retry: {exportPlan.retry.length}</div>
              <div>Removed: {exportPlan.removed.length} · Unsupported: {exportPlan.plan.skipped.length}</div>
              <div>Installed media verified: {verifiedMedia?.size ?? 0}</div>
              {!previewDirectory && <div style={{ color: "#ffd28b" }}>
                No preview folder selected. ZIP output contains only media generated in this run;
                select a folder to preserve unchanged previews.
              </div>}
              {!gtaReady && <div style={{ color: "#ffd28b" }}>GTA V Legacy assets are not ready.</div>}
              {!showMesh && <div style={{ color: "#ffd28b" }}>Enable the ped mesh before exporting.</div>}
            </div>
          )}
          {lastBatchResult && <button type="button" onClick={() => {
            const report = [
              "PowerMoves Development — EmotePreviewer export summary",
              `Captured: ${lastBatchResult.captured}`,
              `Failed: ${lastBatchResult.failed}`,
              `Unsupported/skipped: ${lastBatchResult.skipped}`,
              `Unchanged: ${lastBatchResult.unchanged}`,
              `Removed: ${lastBatchResult.removed}`,
              `Destination: ${lastBatchResult.destination}`,
              "Runtime and FiveM playback verification remain pending.",
            ].join("\n");
            const url = URL.createObjectURL(new Blob([report], { type: "text/plain" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "emotepreviewer-export-summary.txt";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
          }}>Download export summary</button>}
          {batchProgress && <span role="status" style={{ fontSize: 12 }}>{batchProgress}</span>}
          {batchAbortRef.current ? (
            <button type="button" onClick={() => batchAbortRef.current?.abort()}>Cancel batch</button>
          ) : (
            <button type="button" onClick={() => void exportBatch()} disabled={exporting || maintenanceBusy || !gtaReady || !showMesh} title="Export all previewable animations as experimental transparent animated PNG previews">
              Export catalog animated previews
            </button>
          )}
          <button type="button" onClick={() => void exportSelected()} disabled={view.kind !== "ready" || exporting || maintenanceBusy || !showMesh || main.meshState !== "ready"} title="Developer proof of concept: ZIP of transparent PNG frames (requires loaded ped mesh)">
            {exporting ? `Capturing ${exportProgress?.done ?? 0}/${exportProgress?.total ?? "…"}…` : "Export PNG frames"}
          </button>
        </div>
        <ViewerOverlay view={view} />
      </div>
      <Transport controllerRef={controllerRef} playing={playing} onToggle={toggle} enabled={view.kind === "ready"} meta={view.kind === "ready" ? view.meta : null} layer={view.kind === "ready" ? view.layer : "primary"} />
    </section>
  );
}

function ViewerOverlay({ view }: { view: ViewState }) {
  const t = useT();
  const status = useAppStore((s) => s.status);
  if (view.kind === "ready") return null;
  let text: string;
  let sub: string | null = null;
  switch (view.kind) {
    case "idle":
      text = t("viewer.state.idle");
      break;
    case "loading":
      text = t("viewer.state.loading");
      break;
    case "waitingGta":
      text = t("viewer.state.waitingGta");
      sub = status ? describeGta(status.gta, status.progressDone, status.progressTotal, t) : null;
      break;
    case "notPreviewable":
      text = t("viewer.state.notPreviewable");
      sub = t(`reason.${view.reason}` as "reason.kind");
      break;
    default:
      text = t("viewer.state.error", { message: view.message });
  }
  return (
    <div className={`viewer-overlay ${view.kind}`} role="status">
      <p>{text}</p>
      {sub && <p className="sub">{sub}</p>}
    </div>
  );
}

function describeGta(state: string, done: number, total: number, t: ReturnType<typeof useT>): string {
  switch (state) {
    case "indexing":
      return total > 0 ? t("status.indexingProgress", { done, total }) : t("status.indexing");
    case "missingGta":
      return t("status.missingGta");
    case "missingKeys":
      return t("status.missingKeys");
    default:
      return "";
  }
}

interface TransportProps {
  controllerRef: React.RefObject<ViewerController | null>;
  playing: boolean;
  enabled: boolean;
  meta: ClipMetaDto | null;
  /** The layer of the main ped whose clip the frame counter shows. */
  layer: EmoteSlot;
  onToggle: () => void;
}

/**
 * Play / scrub / speed / loop over the shared timeline (as long as the longest clip incl. its start delay); the frame
 * counter shows the selected entry's clip. Re-renders only itself ~30× per second while a clip plays.
 */
function Transport({ controllerRef, playing, enabled, meta, layer, onToggle }: TransportProps) {
  const t = useT();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const scrubbing = useRef(false);
  const fps = meta?.fps ?? 30;

  useEffect(() => {
    let frame = 0;
    let last = 0;
    const loopFn = (now: number) => {
      frame = requestAnimationFrame(loopFn);
      if (now - last < 33) return;
      last = now;
      const controller = controllerRef.current;
      if (!controller) return;
      setDuration(controller.timeline.duration);
      if (!scrubbing.current) setTime(controller.timeline.time);
    };
    frame = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(frame);
  }, [controllerRef]);

  const seek = (value: number) => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.seek(value);
    setTime(value);
  };

  const clipTime = controllerRef.current?.layerTime("main", layer) ?? 0;
  const frameIndex = Math.min(meta ? meta.frames - 1 : 0, Math.round(clipTime * fps));
  return (
    <div className="transport">
      <button type="button" className="play" onClick={onToggle} disabled={!enabled} aria-label={playing ? t("viewer.pause") : t("viewer.play")}>
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(0.001, duration)}
        step={1 / fps}
        value={Math.min(time, duration)}
        disabled={!enabled}
        aria-label={t("viewer.frame")}
        onPointerDown={() => (scrubbing.current = true)}
        onPointerUp={() => (scrubbing.current = false)}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="time mono">
        <b>{time.toFixed(2)}</b> / {duration.toFixed(2)} s · f <b>{frameIndex}</b>
        {meta ? `/${meta.frames - 1}` : ""}
      </span>
      <label className="check">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => {
            setLoop(e.target.checked);
            controllerRef.current?.setLoop(e.target.checked);
          }}
        />
        {t("viewer.loop")}
      </label>
      <select
        value={speed}
        aria-label={t("viewer.speed")}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSpeed(v);
          controllerRef.current?.setSpeed(v);
        }}
      >
        <option value={0.25}>0.25×</option>
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
    </div>
  );
}
