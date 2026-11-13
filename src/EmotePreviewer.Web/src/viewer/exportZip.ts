/** Minimal STORE-only ZIP writer for offline PNG frame exports. No runtime dependencies. */
export interface ExportFile { name: string; data: Uint8Array }

const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let j = 0; j < 8; j++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  table[n] = c >>> 0;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function u16(view: DataView, at: number, n: number): void { view.setUint16(at, n, true); }
function u32(view: DataView, at: number, n: number): void { view.setUint32(at, n, true); }

export function makeZip(files: ExportFile[]): Blob {
  if (files.length > 65535) throw new RangeError("Too many files");
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const names = new Set<string>();
  for (const file of files) {
    const name = encoder.encode(file.name);
    if (!name.length || name.length > 65535 ||
        file.name.startsWith("/") || file.name.includes("\\") ||
        file.name.split("/").some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
      throw new Error("Invalid ZIP entry name");
    }
    if (names.has(file.name)) throw new Error("Duplicate ZIP entry name");
    names.add(file.name);
    if (!(file.data instanceof Uint8Array) || file.data.byteLength > 0xffffffff) {
      throw new RangeError("ZIP entry exceeds classic ZIP limits");
    }
    if (offset + 30 + name.length + file.data.byteLength > 0xffffffff) {
      throw new RangeError("ZIP archive exceeds classic ZIP limits");
    }
    const checksum = crc32(file.data);
    const head = new Uint8Array(30 + name.length);
    const h = new DataView(head.buffer);
    u32(h, 0, 0x04034b50); u16(h, 4, 20); u16(h, 6, 0x0800);
    u32(h, 14, checksum); u32(h, 18, file.data.length); u32(h, 22, file.data.length);
    u16(h, 26, name.length); head.set(name, 30);
    const directory = new Uint8Array(46 + name.length);
    const d = new DataView(directory.buffer);
    u32(d, 0, 0x02014b50); u16(d, 4, 20); u16(d, 6, 20); u16(d, 8, 0x0800);
    u32(d, 16, checksum); u32(d, 20, file.data.length); u32(d, 24, file.data.length);
    u16(d, 28, name.length); u32(d, 42, offset); directory.set(name, 46);
    local.push(head, new Uint8Array(file.data));
    central.push(directory);
    offset += head.length + file.data.length;
  }
  const directorySize = central.reduce((sum, bytes) => sum + bytes.length, 0);
  if (offset + directorySize + 22 > 0xffffffff) throw new RangeError("ZIP archive exceeds classic ZIP limits");
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  u32(e, 0, 0x06054b50); u16(e, 8, files.length); u16(e, 10, files.length);
  u32(e, 12, directorySize); u32(e, 16, offset);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}

export function pngDataUrlBytes(url: string): Uint8Array {
  const prefix = "data:image/png;base64,";
  if (!url.startsWith(prefix)) throw new Error("Expected PNG data URL");
  const binary = atob(url.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
