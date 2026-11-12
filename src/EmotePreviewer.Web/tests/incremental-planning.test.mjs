import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const base = new URL("../src/viewer/", import.meta.url);
const indexSource = readFileSync(new URL("previewIndex.ts", base), "utf8");
const planSource = readFileSync(new URL("batchPlan.ts", base), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const asUrl = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const planUrl = asUrl(compile(planSource));
const indexJs = compile(indexSource).replace('from "./batchPlan"', 'from "' + planUrl + '"');
const { planIncrementalBatch, emptyPreviewIndex } = await import(asUrl(indexJs));

function emote(id) {
  return {
    id, source: "test", category: "emotes", command: id,
    previewable: true, kind: "animation", dictionary: "anim@test",
    clip: "idle", props: [], ped: null, partner: null,
  };
}
test("unverified imported index never skips regeneration", () => {
  const item = emote("wave");
  const index = emptyPreviewIndex();
  index.entries.wave = { fingerprint: "stale", media: "previews/wave/run1/preview.png",
    status: "generated", updatedAt: "2026-01-01" };
  const result = planIncrementalBatch([item], index, "ped", "ped", false);
  assert.deepEqual(result.plan.ready.map((entry) => entry.id), ["wave"]);
  assert.deepEqual(result.retry, ["wave"]);
  assert.deepEqual(result.unchanged, []);
});
test("verified media with changed fingerprint is regenerated", () => {
  const item = emote("wave");
  const index = emptyPreviewIndex();
  index.entries.wave = { fingerprint: "stale", media: "previews/wave/run1/preview.png",
    status: "generated", updatedAt: "2026-01-01" };
  const result = planIncrementalBatch([item], index, "ped", "ped", false, "update", new Set(["wave"]));
  assert.deepEqual(result.changed, ["wave"]);
  assert.equal(result.plan.ready.length, 1);
});
test("missing disk file forces retry even with an unchanged index", () => {
  const item = emote("wave");
  const index = emptyPreviewIndex();
  index.entries.wave = { fingerprint: "whatever", media: "previews/wave/run1/preview.png",
    status: "generated", updatedAt: "2026-01-01" };
  const result = planIncrementalBatch([item], index, "ped", "ped", false, "update", new Set());
  assert.deepEqual(result.retry, ["wave"]);
});
