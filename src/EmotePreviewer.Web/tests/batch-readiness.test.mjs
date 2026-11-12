import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/viewer/waitForBatchReady.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { waitForBatchReady } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

test("waiter ignores ready state from previous emote", async () => {
  const expected = {};
  let calls = 0;
  const result = await waitForBatchReady({
    id: "new", signal: new AbortController().signal, timeoutMs: 300,
    pollMs: 1, settleMs: 0,
    snapshot: () => ++calls < 3
      ? { id: "old", ready: true, controller: {} }
      : { id: "new", ready: true, controller: expected },
  });
  assert.equal(result, expected);
  assert.ok(calls >= 3);
});
test("waiter immediately reports selected emote load failure", async () => {
  await assert.rejects(() => waitForBatchReady({
    id: "broken", signal: new AbortController().signal, settleMs: 0,
    snapshot: () => ({ id: "broken", ready: false, error: "Missing animation", controller: null }),
  }), /Missing animation/);
});
test("waiter responds to cancellation without waiting for polling timeout", async () => {
  const abort = new AbortController();
  const pending = waitForBatchReady({
    id: "wave", signal: abort.signal, timeoutMs: 10000, pollMs: 5000,
    snapshot: () => ({ id: "wave", ready: false, controller: null }),
  });
  abort.abort();
  await assert.rejects(() => pending, /cancel/i);
});
test("waiter times out when the selected clip never loads", async () => {
  await assert.rejects(() => waitForBatchReady({
    id: "wave", signal: new AbortController().signal,
    timeoutMs: 10, pollMs: 1, settleMs: 0,
    snapshot: () => ({ id: "wave", ready: false, controller: null }),
  }), /Timed out/);
});
