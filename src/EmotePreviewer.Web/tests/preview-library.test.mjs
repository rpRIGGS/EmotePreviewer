import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/viewer/previewLibraryMaintenance.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const { planPreviewCleanup, deleteObsoletePreviews } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputText).toString("base64")
);

class MockFile {
  kind = "file";
  constructor(content = "") { this.content = content; }
  async getFile() { return { text: async () => this.content, size: this.content.length }; }
}
class MockDirectory {
  kind = "directory";
  children = new Map();
  add(name, handle) { this.children.set(name, handle); return this; }
  async getFileHandle(name) {
    const handle = this.children.get(name);
    if (handle?.kind !== "file") throw new DOMException("Not found", "NotFoundError");
    return handle;
  }
  async getDirectoryHandle(name) {
    const handle = this.children.get(name);
    if (handle?.kind !== "directory") throw new DOMException("Not found", "NotFoundError");
    return handle;
  }
  async *entries() { yield* this.children.entries(); }
  async removeEntry(name) { if (!this.children.delete(name)) throw new Error("Missing file"); }
}
globalThis.DOMException ??= class DOMException extends Error {};

function library({ manifest, index } = {}) {
  const root = new MockDirectory();
  const previews = new MockDirectory();
  root.add("previews", previews);
  root.add("manifest.json", new MockFile(JSON.stringify(manifest ?? { schemaVersion: 1, entries: [
    { id: "wave", media: "previews/wave/run1/preview.png" },
  ] })));
  if (index !== null) root.add("preview-index.json", new MockFile(JSON.stringify(index ?? {
    schemaVersion: 1, renderVersion: "test", entries: { wave: { media: "previews/wave/run1/preview.png", fingerprint: "prior", status: "generated", updatedAt: "2026-01-01" } },
  })));
  const wave = new MockDirectory();
  previews.add("wave", wave);
  wave.add("run1", new MockDirectory().add("preview.png", new MockFile("good")));
  wave.add("run2", new MockDirectory().add("preview.png", new MockFile("orphan")));
  return { root, previews, wave };
}

test("cleanup plans orphaned media and protects published files", async () => {
  const { root } = library();
  assert.deepEqual(await planPreviewCleanup(root), {
    obsolete: ["previews/wave/run2/preview.png"], inspected: 2, retained: 1,
  });
});

test("cleanup deletes only orphaned media", async () => {
  const { root, wave } = library();
  assert.equal(await deleteObsoletePreviews(root), 1);
  assert.ok((await wave.getDirectoryHandle("run1")).children.has("preview.png"));
  assert.equal((await wave.getDirectoryHandle("run2")).children.has("preview.png"), false);
});

test("cleanup preserves media published by another window before deletion", async () => {
  const { root, wave } = library();
  const manifest = root.children.get("manifest.json");
  const originalGet = root.getFileHandle.bind(root);
  let manifestReads = 0;
  root.getFileHandle = async (name) => {
    if (name === "manifest.json" && ++manifestReads === 2) {
      manifest.content = JSON.stringify({ schemaVersion: 1, entries: [
        { id: "wave", media: "previews/wave/run1/preview.png" },
        { id: "new", media: "previews/wave/run2/preview.png" },
      ] });
    }
    return originalGet(name);
  };
  assert.equal(await deleteObsoletePreviews(root), 0);
  assert.ok((await wave.getDirectoryHandle("run2")).children.has("preview.png"));
});

test("cleanup protects index-only media after interrupted publication", async () => {
  const { root } = library({ index: { schemaVersion: 1, entries: { wave: { media: "previews/wave/run2/preview.png" } } } });
  assert.equal((await planPreviewCleanup(root)).obsolete.length, 0);
});

test("cleanup refuses unsafe manifest paths", async () => {
  const { root } = library({ manifest: { schemaVersion: 1, entries: [{ media: "../outside/preview.png" }] } });
  await assert.rejects(() => planPreviewCleanup(root), /Unsafe manifest/);
});

test("cleanup refuses malformed index rather than deleting referenced media", async () => {
  const { root } = library({ index: { schemaVersion: 1, entries: { wave: { media: "../outside" } } } });
  await assert.rejects(() => planPreviewCleanup(root), /Unsafe index/);
});

test("cleanup rejects generated index records with empty media", async () => {
  const { root } = library({ index: { schemaVersion: 1, entries: {
    wave: { status: "generated", media: "" },
  } } });
  await assert.rejects(() => planPreviewCleanup(root), /Empty media/);
});

test("cleanup permits failed index records without media", async () => {
  const { root } = library({ index: { schemaVersion: 1, entries: {
    wave: { status: "failed", media: "" },
  } } });
  assert.equal((await planPreviewCleanup(root)).obsolete.length, 1);
});

test("cleanup rejects unknown manifest versions", async () => {
  const { root } = library({ manifest: { schemaVersion: 2, entries: [] } });
  await assert.rejects(() => planPreviewCleanup(root), /invalid published manifest/);
});

test("cleanup rejects unknown index versions", async () => {
  const { root } = library({ index: { schemaVersion: 2, entries: {} } });
  await assert.rejects(() => planPreviewCleanup(root), /Invalid preview index/);
});

test("cleanup tolerates absent index and preserves manifest media", async () => {
  const { root } = library({ index: null });
  assert.equal((await planPreviewCleanup(root)).obsolete.length, 1);
});

test("recovery reconstructs missing index from published manifest", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: null });
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.recovered, 1);
  assert.equal(result.index.entries.wave.media, "previews/wave/run1/preview.png");
  assert.equal(result.index.entries.wave.fingerprint, "");
  assert.ok(result.present.has("wave"));
});

test("recovery restores manifest media when index points at interrupted generation", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: { schemaVersion: 1, renderVersion: "test", entries: {
    wave: { media: "previews/wave/run2/preview.png", fingerprint: "new", status: "generated", updatedAt: "2026-01-01" },
  } } });
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.recovered, 1);
  assert.equal(result.index.entries.wave.media, "previews/wave/run1/preview.png");
  assert.ok(result.present.has("wave"));
});

test("recovery rejects a generated index without a manifest", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library();
  root.children.delete("manifest.json");
  await assert.rejects(() => recoverPreviewLibrary(root), /without a published manifest/);
});

test("recovery detects published files that are absent or empty", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root, wave } = library();
  (await wave.getDirectoryHandle("run1")).children.delete("preview.png");
  const result = await recoverPreviewLibrary(root);
  assert.deepEqual(result.missing, ["wave"]);
  assert.equal(result.present.size, 0);
});

test("recovery propagates permission failures instead of claiming previews are missing", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root, wave } = library();
  wave.getDirectoryHandle = async () => { throw new DOMException("Access revoked", "NotAllowedError"); };
  await assert.rejects(() => recoverPreviewLibrary(root), /Access revoked/);
});

test("recovery treats empty published media as missing", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root, wave } = library();
  (await wave.getDirectoryHandle("run1")).add("preview.png", new MockFile(""));
  const result = await recoverPreviewLibrary(root);
  assert.deepEqual(result.missing, ["wave"]);
});

test("recovery removes unpublished failed records", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: { schemaVersion: 1, renderVersion: "test", entries: {
    wave: { media: "previews/wave/run1/preview.png", fingerprint: "old", status: "generated", updatedAt: "2026-01-01" },
    ghost: { media: "", fingerprint: "old", status: "failed", updatedAt: "2026-01-01" },
  } } });
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.reconciled, 1);
  assert.equal(Object.hasOwn(result.index.entries, "ghost"), false);
});

test("recovery rejects duplicate manifest identifiers", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ manifest: { schemaVersion: 1, entries: [
    { id: "wave", media: "previews/wave/run1/preview.png" },
    { id: "wave", media: "previews/wave/run2/preview.png" },
  ] } });
  await assert.rejects(() => recoverPreviewLibrary(root), /duplicate published/);
});

test("recovery preserves timing metadata from the published manifest", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: null, manifest: { schemaVersion: 1, entries: [
    { id: "wave", media: "previews/wave/run1/preview.png", frameCount: 48, durationSeconds: 4 },
  ] } });
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.index.entries.wave.frameCount, 48);
  assert.equal(result.index.entries.wave.durationSeconds, 4);
});

test("recovery rejects path traversal in published manifest", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ manifest: { schemaVersion: 1, entries: [
    { id: "wave", media: "previews/../outside/preview.png" },
  ] } });
  await assert.rejects(() => recoverPreviewLibrary(root), /Unsafe or duplicate/);
});

test("recovery invalidates fingerprints from older renderer versions", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library();
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.index.entries.wave.fingerprint, "");
});

test("recovery clears failed records when no manifest was ever published", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: { schemaVersion: 1, renderVersion: "test", entries: {
    abandoned: { media: "", fingerprint: "old", status: "failed", updatedAt: "2026-01-01" },
  } } });
  root.children.delete("manifest.json");
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.reconciled, 1);
  assert.deepEqual(Object.keys(result.index.entries), []);
});

test("recovery accepts an empty unpublished library", async () => {
  const { recoverPreviewLibrary } = await loadRecovery();
  const { root } = library({ index: null });
  root.children.delete("manifest.json");
  const result = await recoverPreviewLibrary(root);
  assert.equal(result.recovered, 0);
  assert.equal(result.present.size, 0);
});

async function loadRecovery() {
  const base = new URL("../src/viewer/", import.meta.url);
  const indexSource = readFileSync(new URL("previewIndex.ts", base), "utf8");
  const verifySource = readFileSync(new URL("verifyPreviewFiles.ts", base), "utf8");
  const recoverySource = readFileSync(new URL("recoverPreviewLibrary.ts", base), "utf8");
  // Recovery imports type-bearing TS modules. Use TypeScript's compiler
  // via a temporary ESM data URL graph, without GTA assets or a browser.
  const indexModule = ts.transpileModule(indexSource.replace(/^import .* from "\.\/batchPlan";?$/gm, ""), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const indexUrl = "data:text/javascript;base64," + Buffer.from(indexModule).toString("base64");
  const verifyModule = ts.transpileModule(verifySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const verifyUrl = "data:text/javascript;base64," + Buffer.from(verifyModule).toString("base64");
  const recoveryModule = ts.transpileModule(recoverySource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace('from "./previewIndex"', `from "${indexUrl}"`).replace('from "./verifyPreviewFiles"', `from "${verifyUrl}"`);
  return import("data:text/javascript;base64," + Buffer.from(recoveryModule).toString("base64"));
}
