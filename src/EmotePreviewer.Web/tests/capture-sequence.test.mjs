import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/viewer/captureSequence.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Type-only imports are removed by TS; the PNG decoder import is substituted
// with a fixture stub to exercise timeline sequencing without WebGL.
const javascript = compiled.replace(/import\s*\{\s*pngDataUrlBytes\s*\}\s*from\s*["\x27]\.\/exportZip(?:\.js)?["\x27];?/,
  "const pngDataUrlBytes = () => new Uint8Array([137,80,78,71]);");
assert.ok(!javascript.includes('from "./exportZip"') && !javascript.includes("from \'./exportZip\'"), "PNG stub import must be replaced");
const { captureSequence } = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));

function controller(duration = 1.2) {
  const times = [];
  const timeline = {
    duration, playing: true,
    pause() { this.playing = false; },
    play() { this.playing = true; },
  };
  return {
    times, timeline, hasPedMesh: () => true,
    captureFramePng(time) { times.push(time); return "data:image/png;base64,AAAA"; },
  };
}
test("captures deterministic frame timestamps and restores playback", async () => {
  const rig = controller(1.2);
  const result = await captureSequence(rig, { sourceId: "wave", fps: 5, maxSeconds: 1 });
  assert.equal(result.frameCount, 5);
  assert.deepEqual(rig.times, [0, .2, .4, .6, .8]);
  assert.equal(rig.timeline.playing, true);
});
test("cancellation restores playback and interrupts frame capture", async () => {
  const rig = controller(1);
  const abort = new AbortController();
  await assert.rejects(() => captureSequence(rig, {
    sourceId: "wave", signal: abort.signal, fps: 10,
    onProgress(done) { if (done === 2) abort.abort(); },
  }), /cancel/i);
  assert.equal(rig.timeline.playing, true);
  assert.equal(rig.times.length, 2);
});
test("invalid capture profile is rejected before rendering", async () => {
  const rig = controller();
  await assert.rejects(() => captureSequence(rig, { sourceId: "wave", width: 0 }), /dimensions/);
  await assert.rejects(() => captureSequence(rig, { sourceId: "wave", fps: 61 }), /Frame rate/);
  await assert.rejects(() => captureSequence(rig, { sourceId: "wave", maxSeconds: 31 }), /Maximum duration/);
  assert.equal(rig.times.length, 0);
});
