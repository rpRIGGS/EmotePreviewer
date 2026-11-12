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
  async getFile() { return { text: async () => this.content }; }
}
class MockDirectory {
  kind = "directory";
  children = new Map();
  add(name, handle) { this.children.set(name, handle); return this; }
  async getFileHandle(name) {
    const handle = this.children.get(name);
    if (handle?.kind !== "file") throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
    return handle;
  }
  async getDirectoryHandle(name) {
    const handle = this.children.get(name);
    if (handle?.kind !== "directory") throw Object.assign(new Error("Not found"), { name: "NotFoundError" });
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
  root.add("manifest.json", new MockFile(JSON.stringify(manifest ?? { entries: [
    { media: "previews/wave/run1/preview.png" },
  ] })));
  if (index !== null) root.add("preview-index.json", new MockFile(JSON.stringify(index ?? {
    entries: { wave: { media: "previews/wave/run1/preview.png" } },
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

test("cleanup protects index-only media after interrupted publication", async () => {
  const { root } = library({ index: { entries: { wave: { media: "previews/wave/run2/preview.png" } } } });
  assert.equal((await planPreviewCleanup(root)).obsolete.length, 0);
});

test("cleanup refuses unsafe manifest paths", async () => {
  const { root } = library({ manifest: { entries: [{ media: "../outside/preview.png" }] } });
  await assert.rejects(() => planPreviewCleanup(root), /Unsafe manifest/);
});

test("cleanup refuses malformed index rather than deleting referenced media", async () => {
  const { root } = library({ index: { entries: { wave: { media: "../outside" } } } });
  await assert.rejects(() => planPreviewCleanup(root), /Unsafe index/);
});

test("cleanup tolerates absent index and preserves manifest media", async () => {
  const { root } = library({ index: null });
  assert.equal((await planPreviewCleanup(root)).obsolete.length, 1);
});
