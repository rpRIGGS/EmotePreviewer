import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/viewer/recoverPreviewLibrary.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const imports = [...compiled.outputText.matchAll(/^import .*;$/gm)];
assert.equal(imports.length, 2, "Recovery runtime imports changed; update harness");
const js = compiled.outputText.replace(/^import .*;$/gm, "")
  .replace("export async function recoverPreviewLibrary", "async function recoverPreviewLibrary");
const parsePreviewIndex = (raw) => structuredClone(raw);
const emptyPreviewIndex = () => ({ schemaVersion: 1, renderVersion: "apng-320x320-12fps-v1", entries: {} });
const recover = new Function("emptyPreviewIndex", "parsePreviewIndex", "PREVIEW_RENDER_VERSION", "verifyPreviewFiles",
  js + "\nreturn recoverPreviewLibrary;")(emptyPreviewIndex, parsePreviewIndex, "apng-320x320-12fps-v1",
  async (index) => ({ present: new Set(Object.keys(index.entries)), missing: [], checked: 1 }));
const media = "previews/wave/run/preview.png";
const root = (indexId, manifestId) => ({
  getFileHandle: async (name) => ({
    getFile: async () => ({
      text: async () => JSON.stringify(name === "preview-index.json" ? {
        schemaVersion: 1, renderVersion: "apng-320x320-12fps-v1", publicationId: indexId,
        entries: { wave: { fingerprint: "staged-fingerprint", media, status: "generated", updatedAt: "2026-11-12", frameCount: 36, durationSeconds: 3 } },
      } : {
        schemaVersion: 1, publicationId: manifestId,
        entries: [{ id: "wave", media, frameCount: 36, durationSeconds: 3 }],
      }),
    }),
  }),
});
test("recovery invalidates uncommitted index fingerprints", async () => {
  const result = await recover(root("new", "old"));
  assert.equal(result.index.entries.wave.fingerprint, "");
  assert.equal(result.index.publicationId, undefined);
});
test("recovery retains committed matching index fingerprints", async () => {
  const result = await recover(root("same", "same"));
  assert.equal(result.index.entries.wave.fingerprint, "staged-fingerprint");
  assert.equal(result.index.publicationId, "same");
});
test("legacy manifests force safe regeneration", async () => {
  const result = await recover(root(undefined, undefined));
  assert.equal(result.index.entries.wave.fingerprint, "");
});

test("index staged before first manifest publication is discarded", async () => {
  const staged = root("staged", "staged");
  const original = staged.getFileHandle;
  staged.getFileHandle = async (name) => {
    if (name === "manifest.json") throw new DOMException("Not found", "NotFoundError");
    return original(name);
  };
  const result = await recover(staged);
  assert.equal(Object.keys(result.index.entries).length, 0);
  assert.equal(result.reconciled, 1);
  assert.equal(result.recovered, 0);
});
