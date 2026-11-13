import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/viewer/exportZip.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const { makeZip } = await import("data:text/javascript;base64," +
  Buffer.from(compiled.outputText).toString("base64"));
const file = (name) => ({ name, data: new Uint8Array([1, 2, 3]) });
test("ZIP rejects duplicate names instead of publishing ambiguous files", () => {
  assert.throws(() => makeZip([file("manifest.json"), file("manifest.json")]), /Duplicate ZIP entry name/);
});
test("ZIP rejects traversal, absolute and Windows-unsafe names", () => {
  for (const name of ["../outside", "previews/../x", "/absolute", "C:/absolute", "a\\b", "a//b", "a/./b"]) {
    assert.throws(() => makeZip([file(name)]), /Invalid ZIP entry name/, name);
  }
});
test("ZIP creates a nonempty archive for a valid relative preview path", () => {
  const archive = makeZip([file("previews/wave/run/preview.png"), file("manifest.json")]);
  assert.equal(archive.type, "application/zip");
  assert.ok(archive.size > 100);
});
