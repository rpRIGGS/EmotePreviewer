import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/viewer/previewIndex.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(output.diagnostics?.length ?? 0, 0);
const js = output.outputText.replace(/^import .*;$/gm, "")
  .replace(/export (const|function) /g, "$1 ");
const makePlan = () => ({ ready: [{ id: "wave", source: "rpemotes", category: "emotes", command: "wave", outputStem: "wave_1" }], skipped: [] });
const { planIncrementalBatch, fingerprintEmote, PREVIEW_RENDER_VERSION } = new Function("planCatalogBatch",
  js + "\nreturn {planIncrementalBatch, fingerprintEmote, PREVIEW_RENDER_VERSION};"
)(makePlan);
const emote = { id: "wave", ped: null, props: [], partner: null };
const fp = fingerprintEmote(emote, "mp_m_freemode_01", "mp_f_freemode_01", false);
function run(record) {
  return planIncrementalBatch([emote], {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION, entries: { wave: record },
  }, "mp_m_freemode_01", "mp_f_freemode_01", false, "update", new Set(["wave"]));
}
const record = { fingerprint: fp, media: "previews/wave_1/run_1/preview.png", status: "generated",
  updatedAt: "2026-11-12T00:00:00Z", frameCount: 12, durationSeconds: 1 };
test("verified valid capture remains unchanged", () => {
  const result = run(record);
  assert.equal(result.unchanged.length, 1);
  assert.equal(result.plan.ready.length, 0);
});
test("missing or invalid retained capture metadata schedules recapture", () => {
  for (const patch of [{frameCount: undefined}, {durationSeconds: undefined},
    {durationSeconds: NaN}, {frameCount: 11}, {durationSeconds: 4}]) {
    const result = run({ ...record, ...patch });
    assert.deepEqual(result.changed, ["wave"]);
    assert.equal(result.plan.ready.length, 1);
  }
});

test("new entries are scheduled for capture", () => {
  const result = planIncrementalBatch([emote], {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION, entries: {},
  }, "mp_m_freemode_01", "mp_f_freemode_01", false, "update", new Set());
  assert.deepEqual(result.added, ["wave"]);
  assert.equal(result.plan.ready.length, 1);
});
test("unverified generated media retries even with matching fingerprint", () => {
  const result = planIncrementalBatch([emote], {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION, entries: { wave: record },
  }, "mp_m_freemode_01", "mp_f_freemode_01", false, "update", new Set());
  assert.deepEqual(result.retry, ["wave"]);
  assert.equal(result.plan.ready.length, 1);
});
test("rebuild schedules valid previews again", () => {
  const result = planIncrementalBatch([emote], {
    schemaVersion: 1, renderVersion: PREVIEW_RENDER_VERSION, entries: { wave: record },
  }, "mp_m_freemode_01", "mp_f_freemode_01", false, "rebuild", new Set(["wave"]));
  assert.equal(result.plan.ready.length, 1);
});
