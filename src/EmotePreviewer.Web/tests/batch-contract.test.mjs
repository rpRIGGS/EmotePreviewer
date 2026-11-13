import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Exercise preflight without a WebGL renderer or filesystem writes. Every
// dependency is replaced explicitly; an unexpected import fails the suite.
const source = readFileSync(new URL("../src/viewer/exportCatalogBatch.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const imports = [...compiled.outputText.matchAll(/^import .*;$/gm)];
assert.equal(imports.length, 4, "Batch exporter runtime import count changed; update the test harness");
const js = compiled.outputText.replace(/^import .*;$/gm, "").replace(
  "export async function exportCatalogBatch", "async function exportCatalogBatch"
);
const factory = new Function("captureSequence", "makeZip", "encodeApng", "PREVIEW_RENDER_VERSION",
  js + "\nreturn exportCatalogBatch;");
const exportCatalogBatch = factory(
  async () => { throw new Error("unexpected capture"); },
  () => { throw new Error("unexpected ZIP"); },
  () => { throw new Error("unexpected encode"); },
  "apng-320x320-12fps-v1",
);
const entry = (id, command = id) => ({
  id, source: "rpemotes", category: "dances", command, outputStem: "stem_" + id,
});
const run = (ready, catalog = ready) => exportCatalogBatch({ ready, skipped: [] }, {
  catalog, writeFile: async () => { throw new Error("unexpected file write"); },
  load: async () => { throw new Error("unexpected load"); },
});
test("rejects duplicate consumer identities before loading any animation", async () => {
  await assert.rejects(run([entry("one", "wave"), entry("two", "wave")]), /Duplicate export catalog preview identity/);
});
test("rejects case-insensitive identity collisions before loading", async () => {
  await assert.rejects(run([entry("one", "wave"), entry("two", "WAVE")]), /Duplicate export catalog preview identity/);
});
test("rejects planned capture whose metadata differs from full catalog", async () => {
  await assert.rejects(run([entry("one", "wave")], [entry("one", "dance")]), /plan\/catalog identity mismatch/i);
});
test("rejects duplicate output stems", async () => {
  const a = entry("one"), b = { ...entry("two"), outputStem: a.outputStem };
  await assert.rejects(run([a, b]), /Duplicate preview output stems/);
});
test("rejects missing identity fields", async () => {
  await assert.rejects(run([{ ...entry("one"), category: "" }]), /empty preview identity field/);
});

test("rejects invalid coordinator arrays before capture or writes", async () => {
  await assert.rejects(exportCatalogBatch({ ready: null, skipped: [] }, {
    load: async () => { throw new Error("unexpected load"); },
  }), /Invalid batch export plan/);
});
test("rejects invalid capture profiles before loading any animation", async () => {
  await assert.rejects(exportCatalogBatch({ ready: [entry("one")], skipped: [] }, {
    capture: { fps: 61 }, load: async () => { throw new Error("unexpected load"); },
  }), /Invalid batch frame rate/);
});
