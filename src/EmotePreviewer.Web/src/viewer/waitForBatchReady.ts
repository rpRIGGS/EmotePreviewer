/** Waits for the exact selected clip and ped mesh, not stale viewer state.
 * Abort is event-driven so cancelling a large batch does not wait for a poll. */
export interface BatchReadySnapshot<T> {
  id: string | null;
  ready: boolean;
  error?: string | null;
  controller: T | null;
}
export interface BatchReadyOptions<T> {
  id: string;
  signal: AbortSignal;
  snapshot: () => BatchReadySnapshot<T>;
  timeoutMs?: number;
  pollMs?: number;
  settleMs?: number;
}
function cancelled(): DOMException {
  return new DOMException("Batch cancelled", "AbortError");
}
export async function waitForBatchReady<T>(options: BatchReadyOptions<T>): Promise<T> {
  const { id, signal, snapshot, timeoutMs = 45000, pollMs = 100, settleMs = 100 } = options;
  if (!id) throw new Error("Batch entry ID is required");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs <= 0 ||
      !Number.isFinite(settleMs) || settleMs < 0) throw new RangeError("Invalid readiness wait configuration");
  const started = Date.now();
  const deadline = started + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) throw cancelled();
    const state = snapshot();
    if (state.id === id && state.error) throw new Error(state.error);
    if (state.id === id && state.ready && state.controller && Date.now() - started >= settleMs) return state.controller;
    await new Promise<void>((resolve, reject) => {
      const remaining = Math.max(1, deadline - Date.now());
      const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, Math.min(pollMs, remaining));
      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        reject(cancelled());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
  if (signal.aborted) throw cancelled();
  throw new Error(`Timed out waiting for animation and ped mesh (${Math.round(timeoutMs / 1000)} seconds)`);
}
