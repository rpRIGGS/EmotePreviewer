const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    table[n] = value >>> 0;
  }
  return table;
})();

export interface PreviewApngInfo {
  width: number;
  height: number;
  frameCount: number;
  frameRate: 12;
}

function readU32(bytes: Uint8Array, at: number): number {
  return (bytes[at] * 0x1000000 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]) >>> 0;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[offset]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Validate retained export media before incremental reuse. This checks every
 * chunk boundary and CRC plus the APNG frame controls and fixed production
 * profile; a PNG signature alone cannot establish that a preview is intact. */
export function inspectPreviewApng(bytes: Uint8Array): PreviewApngInfo {
  const fail = (): never => { throw new Error("Invalid or corrupted preview APNG"); };
  if (bytes.length < 8 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) return fail();

  let offset = 8;
  let width = 0;
  let height = 0;
  let declaredFrames = 0;
  let frameCount = 0;
  let expectedSequence = 0;
  let currentFrameHasData = false;
  let idatClosed = false;
  let sawIdat = false;
  let sawIend = false;
  let sawActl = false;
  let sawIhdr = false;

  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) return fail();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const chunkEnd = payloadEnd + 4;
    if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes, offset + 4, payloadEnd) !== readU32(bytes, payloadEnd)) return fail();

    if (!sawIhdr) {
      if (type !== "IHDR" || length !== 13 || offset !== 8) return fail();
      width = readU32(bytes, payloadStart);
      height = readU32(bytes, payloadStart + 4);
      if (width !== 320 || height !== 320 || bytes[payloadStart + 8] !== 8 || bytes[payloadStart + 9] !== 6 ||
          bytes[payloadStart + 10] !== 0 || bytes[payloadStart + 11] !== 0 || bytes[payloadStart + 12] !== 0) return fail();
      sawIhdr = true;
    } else if (type === "IHDR") return fail();

    if (type === "acTL") {
      if (sawActl || sawIdat || length !== 8) return fail();
      declaredFrames = readU32(bytes, payloadStart);
      if (declaredFrames < 1 || declaredFrames > 36 || readU32(bytes, payloadStart + 4) !== 0) return fail();
      sawActl = true;
    } else if (type === "fcTL") {
      if (!sawActl || length !== 26 || (frameCount > 0 && !currentFrameHasData)) return fail();
      if (readU32(bytes, payloadStart) !== expectedSequence++) return fail();
      if (readU32(bytes, payloadStart + 4) !== width || readU32(bytes, payloadStart + 8) !== height ||
          readU32(bytes, payloadStart + 12) !== 0 || readU32(bytes, payloadStart + 16) !== 0 ||
          (bytes[payloadStart + 20] << 8 | bytes[payloadStart + 21]) !== 1 ||
          (bytes[payloadStart + 22] << 8 | bytes[payloadStart + 23]) !== 12 ||
          bytes[payloadStart + 24] !== 0 || bytes[payloadStart + 25] !== 0) return fail();
      if (frameCount === 0 && sawIdat) return fail();
      frameCount++;
      if (frameCount > declaredFrames) return fail();
      currentFrameHasData = false;
    } else if (type === "IDAT") {
      if (!sawActl || frameCount !== 1 || idatClosed) return fail();
      sawIdat = true;
      currentFrameHasData = true;
    } else if (type === "fdAT") {
      if (!sawActl || frameCount < 2 || length < 5 || readU32(bytes, payloadStart) !== expectedSequence++) return fail();
      currentFrameHasData = true;
    } else if (type === "IEND") {
      if (length !== 0 || !sawActl || !sawIdat || frameCount !== declaredFrames || !currentFrameHasData || chunkEnd !== bytes.length) return fail();
      sawIend = true;
      offset = chunkEnd;
      break;
    } else if (type === "PLTE") {
      // Preview captures are RGBA and must not introduce a palette.
      return fail();
    } else if (type !== "IHDR" && (type.charCodeAt(0) & 32) === 0) return fail();

    if (sawIdat && type !== "IDAT") idatClosed = true;
    offset = chunkEnd;
  }

  if (!sawIend || offset !== bytes.length) return fail();
  return { width, height, frameCount, frameRate: 12 };
}
