import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import ts from "typescript";

const source = readFileSync(new URL("../src/viewer/encodeApng.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics?.length ?? 0, 0);
const { encodeApng } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputText).toString("base64"));
const signature = Buffer.from([137,80,78,71,13,10,26,10]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}
function png({ rgba = true, width = 2, height = 2, alpha = 128 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = rgba ? 6 : 2;
  const channels = rgba ? 4 : 3;
  const raw = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * channels);
    for (let x = 0; x < width; x++) {
      const at = start + 1 + x * channels;
      raw[at] = 200;
      raw[at + 1] = 40;
      raw[at + 2] = 90;
      if (rgba) raw[at + 3] = alpha;
    }
  }
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND")]);
}
function chunks(bytes) {
  const result = [];
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = Buffer.from(bytes).readUInt32BE(at);
    const type = Buffer.from(bytes.subarray(at + 4, at + 8)).toString();
    result.push({ type, data: bytes.subarray(at + 8, at + 8 + length) });
    at += length + 12;
    if (type === "IEND") break;
  }
  return result;
}

test("APNG encodes a transparent multi-frame animation with correct sequence numbers", () => {
  const bytes = encodeApng([png({alpha:0}), png({alpha:200}), png({alpha:255})], 12);
  const parsed = chunks(bytes);
  assert.deepEqual(parsed.map((c) => c.type), [
    "IHDR", "acTL", "fcTL", "IDAT", "fcTL", "fdAT", "fcTL", "fdAT", "IEND",
  ]);
  assert.equal(Buffer.from(parsed[1].data).readUInt32BE(0), 3);
  assert.equal(Buffer.from(parsed[1].data).readUInt32BE(4), 0);
  assert.deepEqual(parsed.filter((c) => c.type === "fcTL").map((c) => Buffer.from(c.data).readUInt32BE(0)), [0, 1, 3]);
  assert.deepEqual(parsed.filter((c) => c.type === "fdAT").map((c) => Buffer.from(c.data).readUInt32BE(0)), [2, 4]);
  assert.deepEqual(parsed.filter((c) => c.type === "fcTL").map((c) => Buffer.from(c.data).readUInt16BE(22)), [12, 12, 12]);
});

test("APNG refuses RGB-only frames that cannot guarantee transparency", () => {
  assert.throws(() => encodeApng([png({rgba:false})]), /RGBA/);
});

test("APNG refuses frame dimension mismatches", () => {
  assert.throws(() => encodeApng([png(), png({width:3})]), /identical/);
});

test("APNG detects corrupted frame checksums", () => {
  const bytes = png();
  bytes[bytes.length - 7] ^= 0xff;
  assert.throws(() => encodeApng([bytes]), /CRC mismatch/);
});

test("APNG refuses unsupported frame rates and empty sequences", () => {
  assert.throws(() => encodeApng([]), /No PNG frames/);
  assert.throws(() => encodeApng([png()], 0), /frame rate/);
});

test("APNG rejects malformed PNG header and trailing bytes", () => {
  const valid = png();
  const badSignature = Buffer.from(valid);
  badSignature[0] = 0;
  assert.throws(() => encodeApng([badSignature]), /signature/);
  assert.throws(() => encodeApng([Buffer.concat([valid, Buffer.from([1])])]), /end chunk/);
});

test("APNG rejects truncated chunks and missing IEND", () => {
  const valid = png();
  assert.throws(() => encodeApng([valid.subarray(0, valid.length - 8)]), /required chunks/);
  const damaged = Buffer.from(valid);
  const firstIdat = chunks(valid).find((c) => c.type === "IDAT");
  assert.ok(firstIdat);
  damaged.writeUInt32BE(0xffffffff, 33);
  assert.throws(() => encodeApng([damaged]), /Truncated PNG chunk/);
});

test("APNG rejects nonconsecutive IDAT data and unsupported critical chunks", () => {
  const valid = png();
  const sections = chunks(valid);
  const ihdr = sections.find((c) => c.type === "IHDR").data;
  const idat = sections.find((c) => c.type === "IDAT").data;
  const interrupted = Buffer.concat([
    signature, chunk("IHDR", ihdr), chunk("IDAT", idat),
    chunk("tEXt", Buffer.from("note\\0hello")), chunk("IDAT", idat), chunk("IEND"),
  ]);
  assert.throws(() => encodeApng([interrupted]), /image data order/);
  const critical = Buffer.concat([
    signature, chunk("IHDR", ihdr), chunk("ZZZZ"), chunk("IDAT", idat), chunk("IEND"),
  ]);
  assert.throws(() => encodeApng([critical]), /Unsupported critical/);
});

test("APNG refuses nested animated PNG source frames", () => {
  const animated = encodeApng([png(), png()]);
  assert.throws(() => encodeApng([animated]), /already animated/);
});

test("APNG enforces frame count and maximum capture dimensions", () => {
  assert.throws(() => encodeApng(Array(1801).fill(png())), /Too many/);
  assert.throws(() => encodeApng([png({width:2049})]), /dimensions/);
});

test("APNG rejects invalid frame chunk checksums even when signature is valid", () => {
  const damaged = Buffer.from(png());
  damaged[32] ^= 0x20;
  assert.throws(() => encodeApng([damaged]), /CRC mismatch/);
});
