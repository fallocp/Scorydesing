import { deflateSync } from 'node:zlib';

function chunk(name: string, data: Uint8Array): Buffer {
  const part = Buffer.alloc(data.length + 12); part.writeUInt32BE(data.length); part.write(name, 4); part.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of part.subarray(4, -4)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  part.writeUInt32BE((crc ^ 0xffffffff) >>> 0, part.length - 4); return part;
}

/** Deterministic raster fixture: not an AI image, not an evaluation of design quality. */
export function simulatedPiece(quality: 'low' | 'medium' = 'low', visualVariant = 0, size = { width: 1024, height: 1024 }): Uint8Array {
  const { width, height } = size, stride = width * 4 + 1, raw = Buffer.alloc(stride * height);
  // Opt-in only for the five-proposal fixture. The default retains the exact
  // legacy raster, while distinct palettes/compositions expose swapped previews.
  const variants = [
    { ink: [29, 117, 111], line: [166, 213, 197], disc: [222, 242, 230], paper: [247, 250, 245], x: -45, y: 15, scale: .9 },
    { ink: [43, 82, 135], line: [171, 202, 229], disc: [225, 236, 249], paper: [247, 249, 252], x: 35, y: -50, scale: 1 },
    { ink: [184, 82, 61], line: [235, 194, 170], disc: [253, 229, 211], paper: [253, 248, 241], x: 55, y: 25, scale: .82 },
    { ink: [147, 106, 42], line: [222, 202, 143], disc: [246, 236, 199], paper: [251, 249, 239], x: -35, y: -40, scale: 1.07 },
    { ink: [110, 72, 141], line: [208, 186, 226], disc: [239, 228, 249], paper: [251, 247, 253], x: 15, y: 55, scale: .92 },
  ];
  const variant = Number.isInteger(visualVariant) && visualVariant > 0 ? variants[(visualVariant - 1) % variants.length] : null;
  const plane = [[260, 560], [420, 490], [380, 280], [440, 260], [550, 440], [790, 345], [840, 375], [635, 525], [730, 715], [670, 750], [520, 590], [325, 655], [235, 625]];
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let i = 0, j = plane.length - 1; i < plane.length; j = i++) {
      const [ax, ay] = plane[i], [bx, by] = plane[j];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
    } return hit;
  };
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    const offset = row * stride + 1 + col * 4, x = col * 1024 / width, y = row * 1024 / height;
    const circle = Math.hypot(x - 512 - (variant?.x ?? 0), y - 512 - (variant?.y ?? 0));
    const line = Math.abs(circle - 330) < 2 || Math.abs(circle - 385) < 2;
    const variantColor = variant && (inside((x - 512 - variant.x) / variant.scale + 512, (y - 512 - variant.y) / variant.scale + 512)
      ? variant.ink.map(value => quality === 'medium' ? Math.round(value * .85) : value)
      : line ? variant.line : circle < 330 ? variant.disc : variant.paper);
    const color = variantColor || (inside(x, y) ? (quality === 'medium' ? [24, 100, 108] : [29, 117, 111])
      : line ? [181, 217, 212] : circle < 330 ? [229, 242, 238] : [248, 250, 247]);
    raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
