import { ServerBoundaryError } from './serverRepository.ts';

function invalid(): never { throw new ServerBoundaryError('invalid_png'); }
const MAX_METADATA_BYTES = 1024 * 1024;

async function inflatedSize(bytes: Uint8Array, limit: number): Promise<number> {
  const reader = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) return size;
      size += part.value.length;
      if (size > limit) { await reader.cancel(); invalid(); }
    }
  } catch { invalid(); } finally { reader.releaseLock(); }
}

/** Validate bounded metadata without modifying the original bytes or interpreting provenance.
 * PNG layout: https://www.w3.org/TR/png-3/#11Ancillary-chunks . */
async function metadataSize(name: string, bytes: Uint8Array, remaining: number, channels: number): Promise<number> {
  const fixed: Record<string, number> = { cHRM: 32, gAMA: 4, sRGB: 1, pHYs: 9, tIME: 7, cICP: 4, mDCV: 24, cLLI: 8 };
  if (name in fixed) {
    if (bytes.length !== fixed[name]) invalid();
    if (name === 'sRGB' && bytes[0] > 3 || name === 'pHYs' && bytes[8] > 1) invalid();
    if (name === 'gAMA' && bytes.every(byte => byte === 0)) invalid();
    return bytes.length;
  }
  if (name === 'sBIT') {
    if (bytes.length !== channels || bytes.some(byte => byte < 1 || byte > 8)) invalid();
    return bytes.length;
  }
  // Preserve C2PA/JUMBF and EXIF as opaque metadata, with CRC and total-size bounds.
  // This validator does not verify a C2PA signature or authenticate its claims.
  if (name === 'caBX' || name === 'eXIf') return bytes.length;
  if (!['tEXt', 'zTXt', 'iTXt', 'iCCP'].includes(name)) invalid();
  const separator = bytes.indexOf(0);
  if (separator < 1 || separator > 79) invalid();
  const keyword = bytes.subarray(0, separator);
  if (keyword.some(byte => byte < 32 || byte > 126 && byte < 161)
    || keyword[0] === 32 || keyword.at(-1) === 32
    || keyword.some((byte, index) => byte === 32 && keyword[index + 1] === 32)) invalid();
  let start = separator + 1;
  if (name === 'tEXt') {
    if (bytes.subarray(start).includes(0)) invalid();
    return bytes.length;
  }
  let compressed = true;
  if (name === 'iTXt') {
    if (bytes[start] !== 0 && bytes[start] !== 1 || bytes[start + 1] !== 0) invalid();
    compressed = bytes[start] === 1;
    start += 2;
    for (let part = 0; part < 2; part++) {
      const end = bytes.indexOf(0, start);
      if (end < start) invalid();
      start = end + 1;
    }
  } else {
    if (bytes[start++] !== 0) invalid();
  }
  if (!compressed) return bytes.length;
  if (start >= bytes.length || start > remaining) invalid();
  return start + await inflatedSize(bytes.subarray(start), remaining - start);
}
// Table-driven CRC-32 (same polynomial and result as the bitwise form, ~8x less CPU).
let crcTable: Uint32Array | undefined;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let bit = 0; bit < 8; bit++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
      crcTable[n] = c >>> 0;
    }
  }
  const table = crcTable;
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded static PNG validation, including CRCs and the complete inflated scanlines.
 * Initial server imports support noninterlaced 8-bit gray/RGB/gray-alpha/RGBA PNG.
 * Bounded ancillary metadata is retained byte-for-byte, including C2PA provenance.
 * JPEG, WebP, palettes and animated/interlaced PNG require a later codec adapter. */
export async function inspectServerPng(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  if (bytes.length < 45 || bytes.length > 8388608
    || ![137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, channels = 0, ended = false, chunkCount = 0;
  let dataEnded = false, metadataBytes = 0;
  const singleton = new Set<string>();
  const data: Uint8Array[] = [];
  while (offset < bytes.length) {
    if (++chunkCount > 4096) invalid();
    if (offset + 12 > bytes.length) invalid();
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) invalid();
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(name) || name[2] !== name[2].toUpperCase()) invalid();
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) invalid();
    const content = offset + 8;
    if (offset === 8 && name !== 'IHDR') invalid();
    if (name === 'IHDR') {
      if (offset !== 8 || length !== 13) invalid();
      width = view.getUint32(content); height = view.getUint32(content + 4);
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[bytes[content + 9]] ?? 0;
      if (!width || !height || width > 4096 || height > 4096 || width * height > 4194304
        || !channels || bytes[content + 8] !== 8 || bytes[content + 10] !== 0
        || bytes[content + 11] !== 0 || bytes[content + 12] !== 0) invalid();
    } else if (name === 'IDAT') {
      if (dataEnded) invalid();
      data.push(bytes.slice(content, content + length));
    } else if (name === 'IEND') {
      if (length || !data.length || offset + 12 !== bytes.length) invalid();
      ended = true;
    } else {
      if (name[0] === name[0].toUpperCase() || ['acTL', 'fcTL', 'fdAT'].includes(name)) invalid();
      if (data.length) dataEnded = true;
      if (['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'cICP', 'mDCV', 'cLLI', 'pHYs'].includes(name) && data.length) invalid();
      if (!['tEXt', 'zTXt', 'iTXt', 'caBX'].includes(name)) {
        if (singleton.has(name)) invalid();
        singleton.add(name);
      }
      if (singleton.has('iCCP') && singleton.has('sRGB')) invalid();
      if (length > MAX_METADATA_BYTES - metadataBytes) invalid();
      metadataBytes += await metadataSize(name, bytes.subarray(content, content + length), MAX_METADATA_BYTES - metadataBytes, channels);
      if (metadataBytes > MAX_METADATA_BYTES) invalid();
    }
    offset += length + 12;
  }
  if (!ended) invalid();
  const packed = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of data) { packed.set(part, position); position += part.length; }
  const stride = width * channels + 1, expected = stride * height;
  const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (received + chunk.value.length > expected) { await reader.cancel(); invalid(); }
      for (let i = (stride - received % stride) % stride; i < chunk.value.length; i += stride) {
        if (chunk.value[i] > 4) { await reader.cancel(); invalid(); }
      }
      received += chunk.value.length;
    }
  } catch { invalid(); } finally { reader.releaseLock(); }
  if (received !== expected) invalid();
  return { width, height };
}
