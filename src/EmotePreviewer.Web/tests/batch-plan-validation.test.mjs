import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/viewer/batchPlan.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const { planCatalogBatch } = await import("data:text/javascript;base64," +
  Buffer.from(compiled.outputText).toString("base64"));
const emote = (id, command=id) => ({
  id, source: "rpemotes", category: "emotes", command,
  kind: "animation", dictionary: "anim@mp_player_intcelebrationmale@wave", clip: "wave", previewable: true,
});
test("batch plan rejects null and missing identifiers", () => {
  assert.throws(() => planCatalogBatch([null]), /Invalid animation catalog entry/);
  assert.throws(() => planCatalogBatch([{ command: "wave" }]), /Invalid animation catalog entry/);
});
test("batch plan gives distinct safe stems to colliding normalized commands", () => {
  const result = planCatalogBatch([emote("a", "hello/world"), emote("b", "hello world")]);
  assert.equal(result.ready.length, 2);
  assert.notEqual(result.ready[0].outputStem, result.ready[1].outputStem);
  for (const item of result.ready) assert.match(item.outputStem, /^[a-zA-Z0-9_-]+$/);
});
test("batch plan sorts deterministically and skips unsupported entries", () => {
  const unsupported = { ...emote("z"), previewable: false, previewReason: "no supported clip" };
  const result = planCatalogBatch([unsupported, emote("b"), emote("a")]);
  assert.deepEqual(result.ready.map((x) => x.id), ["a", "b"]);
  assert.deepEqual(result.skipped.map((x) => x.id), ["z"]);
});
