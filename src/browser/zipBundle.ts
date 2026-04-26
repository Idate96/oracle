import fs from "node:fs/promises";

export interface ZipBundleEntry {
  path: string;
  content: string | Buffer;
}

interface PreparedEntry {
  path: string;
  data: Buffer;
  crc: number;
  localHeaderOffset: number;
}

const DOS_TIME_MIDNIGHT = 0;
const DOS_DATE_1980_01_01 = 0x21;

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let value = i;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[i] = value >>> 0;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sanitizeZipPath(filePath: string, fallbackName: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
  const parts = normalized
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "." && part !== "..");
  return parts.join("/") || fallbackName;
}

function uniquifyPath(pathName: string, seen: Set<string>): string {
  if (!seen.has(pathName)) {
    seen.add(pathName);
    return pathName;
  }

  const slash = pathName.lastIndexOf("/");
  const dir = slash >= 0 ? `${pathName.slice(0, slash + 1)}` : "";
  const base = slash >= 0 ? pathName.slice(slash + 1) : pathName;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";

  for (let index = 2; ; index += 1) {
    const candidate = `${dir}${stem}-${index}${ext}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function localFileHeader(entry: PreparedEntry): Buffer {
  const name = Buffer.from(entry.path, "utf8");
  return Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(DOS_TIME_MIDNIGHT),
    u16(DOS_DATE_1980_01_01),
    u32(entry.crc),
    u32(entry.data.length),
    u32(entry.data.length),
    u16(name.length),
    u16(0),
    name,
  ]);
}

function centralDirectoryHeader(entry: PreparedEntry): Buffer {
  const name = Buffer.from(entry.path, "utf8");
  return Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(DOS_TIME_MIDNIGHT),
    u16(DOS_DATE_1980_01_01),
    u32(entry.crc),
    u32(entry.data.length),
    u32(entry.data.length),
    u16(name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(entry.localHeaderOffset),
    name,
  ]);
}

function endOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
): Buffer {
  return Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entryCount),
    u16(entryCount),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ]);
}

export async function writeZipBundle(entries: ZipBundleEntry[], outputPath: string): Promise<void> {
  const seen = new Set<string>();
  const prepared: PreparedEntry[] = entries.map((entry, index) => {
    const data = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, "utf8");
    return {
      path: uniquifyPath(sanitizeZipPath(entry.path, `file-${index + 1}`), seen),
      data,
      crc: crc32(data),
      localHeaderOffset: 0,
    };
  });

  const localParts: Buffer[] = [];
  let offset = 0;
  for (const entry of prepared) {
    entry.localHeaderOffset = offset;
    const header = localFileHeader(entry);
    localParts.push(header, entry.data);
    offset += header.length + entry.data.length;
  }

  const centralOffset = offset;
  const centralParts = prepared.map((entry) => centralDirectoryHeader(entry));
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = endOfCentralDirectory(prepared.length, centralSize, centralOffset);

  await fs.writeFile(outputPath, Buffer.concat([...localParts, ...centralParts, end]));
}
