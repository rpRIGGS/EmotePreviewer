/** Dependency-free APNG encoder for the RGBA PNG frames captured by WebGL.
 * APNG remains an experimental export format until verified in FiveM NUI.
 * Source PNG frames must share dimensions, color type and bit depth. */
const signature = new Uint8Array([137,80,78,71,13,10,26,10]);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] * 0x1000000) + ((bytes[at+1] << 16) | (bytes[at+2] << 8) | bytes[at+3])) >>> 0;
}
function write32(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value >>> 24; bytes[at+1] = value >>> 16; bytes[at+2] = value >>> 8; bytes[at+3] = value;
}
function write16(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = value >>> 8; bytes[at+1] = value;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function chunk(type: string, payload: Uint8Array): Uint8Array {
  const body = concat([encoder.encode(type), payload]);
  const result = new Uint8Array(body.length + 8);
  write32(result, 0, payload.length);
  result.set(body, 4);
  write32(result, result.length - 4, crc32(body));
  return result;
}
interface ParsedFrame { ihdr: Uint8Array; imageData: Uint8Array[]; ancillary: Uint8Array[]; }
function parsePng(png: Uint8Array): ParsedFrame {
  if (png.length < 33 || signature.some((byte, i) => png[i] !== byte)) throw new Error("Invalid PNG signature");
  let offset = 8;
  let ihdr: Uint8Array | null = null;
  const imageData: Uint8Array[] = [];
  const ancillary: Uint8Array[] = [];
  let ended = false;
  while (offset + 12 <= png.length) {
    const length = u32(png, offset);
    if (length > png.length - offset - 12) throw new Error("Truncated PNG chunk");
    const type = decoder.decode(png.subarray(offset + 4, offset + 8));
    const payload = png.slice(offset + 8, offset + 8 + length);
    const expected = u32(png, offset + 8 + length);
    if (crc32(png.subarray(offset + 4, offset + 8 + length)) !== expected) throw new Error("PNG CRC mismatch");
    if (type === "IHDR") ihdr = payload;
    else if (type === "IDAT") imageData.push(payload);
    else if (type === "IEND") { ended = true; break; }
    else if (type === "PLTE" || type === "tRNS") ancillary.push(chunk(type, payload));
    offset += 12 + length;
  }
  if (!ended || !ihdr || ihdr.length !== 13 || !imageData.length) throw new Error("PNG missing required chunks");
  return { ihdr, imageData, ancillary };
}
/** APNG with an infinite loop and frame delays of 1/fps. */
export function encodeApng(pngFrames: readonly Uint8Array[], fps = 12): Uint8Array {
  if (!pngFrames.length) throw new Error("No PNG frames supplied");
  if (!Number.isInteger(fps) || fps < 1 || fps > 60) throw new RangeError("Invalid APNG frame rate");
  const frames = pngFrames.map(parsePng);
  const header = frames[0].ihdr;
  if (frames.some((frame) => frame.ihdr.some((byte, i) => byte !== header[i]))) {
    throw new Error("APNG frames must have identical PNG dimensions and format");
  }
  const width = u32(header, 0), height = u32(header, 4);
  if (!width || !height) throw new Error("Invalid APNG frame dimensions");
  // WebGL captures are RGBA PNGs. RGB or indexed PNGs can silently lose
  // transparency when packaged as previews; reject them explicitly.
  if (header[8] !== 8 || header[9] !== 6 || header[12] !== 0) {
    throw new Error("APNG preview frames must be non-interlaced 8-bit RGBA PNGs");
  }
  if (frames.some((frame) => frame.ancillary.length !== frames[0].ancillary.length ||
    frame.ancillary.some((part, i) => part.length !== frames[0].ancillary[i].length ||
      part.some((byte, at) => byte !== frames[0].ancillary[i][at])))) {
    throw new Error("APNG frames have inconsistent palette or transparency metadata");
  }
  const parts: Uint8Array[] = [signature, chunk("IHDR", header), ...frames[0].ancillary];
  const animation = new Uint8Array(8);
  write32(animation, 0, frames.length);
  write32(animation, 4, 0);
  parts.push(chunk("acTL", animation));
  let sequence = 0;
  frames.forEach((frame, index) => {
    const control = new Uint8Array(26);
    write32(control, 0, sequence++);
    write32(control, 4, width);
    write32(control, 8, height);
    write16(control, 20, 1);
    write16(control, 22, fps);
    control[24] = 0; // dispose none
    control[25] = 0; // blend source
    parts.push(chunk("fcTL", control));
    for (const data of frame.imageData) {
      if (index === 0) parts.push(chunk("IDAT", data));
      else {
        const payload = new Uint8Array(data.length + 4);
        write32(payload, 0, sequence++);
        payload.set(data, 4);
        parts.push(chunk("fdAT", payload));
      }
    }
  });
  parts.push(chunk("IEND", new Uint8Array()));
  return concat(parts);
}
