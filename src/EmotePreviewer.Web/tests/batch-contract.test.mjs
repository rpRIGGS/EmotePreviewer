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

test("rejects malformed catalog records before any output", async () => {
  await assert.rejects(run([null]), /Invalid batch catalog entry/);
  await assert.rejects(run([{ ...entry("one"), command: 42 }]), /empty preview identity field/);
});
test("rejects malformed previous index before capture", async () => {
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    previousIndex: { schemaVersion: 1, entries: null },
    load: async () => { throw new Error("unexpected load"); },
  }), /Invalid previous preview index/);
});

// A valid no-op incremental export must still publish a complete manifest
// from verified on-disk media, without invoking the animation renderer.
test("publishes a verified unchanged preview without recapturing", async () => {
  const e = entry("one");
  const media = "previews/stem_one/run_1/preview.png";
  const writes = new Map();
  const result = await exportCatalogBatch({ ready: [], skipped: [] }, {
    catalog: [e],
    previousIndex: {
      schemaVersion: 1, renderVersion: "apng-320x320-12fps-v1",
      entries: { one: { fingerprint: "stable", media, status: "generated",
        updatedAt: "2026-11-12T00:00:00Z", frameCount: 12, durationSeconds: 1 } },
    },
    verifiedMedia: new Set(["one"]),
    writeFile: async (path, bytes) => { writes.set(path, JSON.parse(new TextDecoder().decode(bytes))); },
    load: async () => { throw new Error("unexpected capture"); },
  });
  assert.equal(result.captured, 0);
  assert.equal(result.failed, 0);
  assert.equal(writes.get("manifest.json").entries.length, 1);
  assert.equal(writes.get("manifest.json").entries[0].media, media);
  assert.equal(writes.get("preview-index.json").entries.one.status, "generated");
});
test("does not publish an unverified imported preview", async () => {
  const e = entry("one");
  const writes = new Map();
  const result = await exportCatalogBatch({ ready: [], skipped: [] }, {
    catalog: [e],
    previousIndex: {
      schemaVersion: 1, renderVersion: "apng-320x320-12fps-v1",
      entries: { one: { fingerprint: "stable", media: "previews/stem_one/run_1/preview.png",
        status: "generated", updatedAt: "2026-11-12T00:00:00Z", frameCount: 12, durationSeconds: 1 } },
    },
    writeFile: async (path, bytes) => { writes.set(path, JSON.parse(new TextDecoder().decode(bytes))); },
    load: async () => { throw new Error("unexpected capture"); },
  });
  assert.equal(result.captured, 0);
  assert.equal(writes.get("manifest.json").entries.length, 0);
  assert.equal(writes.get("preview-index.json").entries.one.status, "failed");
});
test("rejects invalid retained metadata before publishing a manifest", async () => {
  const e = entry("one");
  const writes = [];
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    catalog: [e],
    previousIndex: {
      schemaVersion: 1, renderVersion: "apng-320x320-12fps-v1",
      entries: { one: { fingerprint: "stable", media: "previews/stem_one/run_1/preview.png",
        status: "generated", updatedAt: "2026-11-12T00:00:00Z", frameCount: NaN, durationSeconds: 1 } },
    },
    verifiedMedia: new Set(["one"]),
    writeFile: async (path) => { writes.push(path); },
    load: async () => { throw new Error("unexpected capture"); },
  }), /Incomplete preview capture metadata/);
  assert.deepEqual(writes, []);
});

test("rejects prototype-sensitive catalog identifiers", async () => {
  await assert.rejects(run([entry("__proto__")]), /Unsafe export catalog identifier/);
});
test("rejects malformed imported index records before publishing", async () => {
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    previousIndex: { schemaVersion: 1, entries: { ghost: null } },
    writeFile: async () => { throw new Error("unexpected write"); },
    load: async () => { throw new Error("unexpected load"); },
  }), /Invalid previous preview index record/);
});
test("rejects cancellation before writing report or manifest", async () => {
  const controller = new AbortController();
  controller.abort();
  const writes = [];
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    signal: controller.signal,
    catalog: [],
    writeFile: async (path) => { writes.push(path); },
    load: async () => { throw new Error("unexpected load"); },
  }), /Batch export cancelled/);
  assert.deepEqual(writes, []);
});

test("preflight does not publish any metadata for a malformed imported index", async () => {
  const writes = [];
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    previousIndex: { schemaVersion: 1, entries: { bad: { status: "generated", fingerprint: null, media: "x" } } },
    writeFile: async (name) => { writes.push(name); },
    load: async () => { throw new Error("unexpected load"); },
  }), /Invalid previous preview index record/);
  assert.deepEqual(writes, []);
});

test("standalone ZIP refuses incremental plan that omits catalog media", async () => {
  const writes = [];
  await assert.rejects(exportCatalogBatch({ ready: [entry("one")], skipped: [] }, {
    catalog: [entry("one"), entry("two")],
    load: async () => { throw new Error("unexpected load"); },
    writeFile: undefined,
    onProgress: () => { writes.push("progress"); },
  }), /Standalone ZIP requires a full rebuild/);
  assert.deepEqual(writes, []);
});

test("manifest is the final publication write for a folder export", async () => {
  const written = [];
  const result = await exportCatalogBatch({ ready: [], skipped: [] }, {
    catalog: [],
    load: async () => { throw new Error("unexpected load"); },
    writeFile: async (name) => { written.push(name); },
  });
  assert.equal(result.captured, 0);
  assert.deepEqual(written, ["report.json", "preview-index.json", "manifest.json"]);
});
test("manifest is not advanced when index staging fails", async () => {
  const written = [];
  await assert.rejects(exportCatalogBatch({ ready: [], skipped: [] }, {
    catalog: [],
    load: async () => { throw new Error("unexpected load"); },
    writeFile: async (name) => {
      written.push(name);
      if (name === "preview-index.json") throw new Error("disk full");
    },
  }), /disk full/);
  assert.deepEqual(written, ["report.json", "preview-index.json"]);
});
