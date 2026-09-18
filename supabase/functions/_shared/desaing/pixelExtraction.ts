/** Manual pixel operations. Coordinates refer to the decoded source image, never CSS pixels. */
export interface PixelExtractionRecipe {
  crop: { x: number; y: number; width: number; height: number };
  mask: { kind: 'rectangle' } | { kind: 'polygon'; points: { x: number; y: number }[] };
}

export class PixelExtractionError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'PixelExtractionError'; }
}

function check(value: unknown, code: string): asserts value {
  if (!value) throw new PixelExtractionError(code);
}
function fields(value: unknown, names: string[]): asserts value is Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid_extraction_recipe');
  check(Object.keys(value).length === names.length && names.every(name => Object.prototype.hasOwnProperty.call(value, name)), 'invalid_extraction_recipe');
}
type Point = { x: number; y: number };
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) => cross(a, b, p) === 0
  && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  return ((abC > 0 && abD < 0 || abC < 0 && abD > 0) && (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0))
    || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

export function assertPixelExtractionRecipe(value: unknown, source: { width: number; height: number }): asserts value is PixelExtractionRecipe {
  check(Number.isSafeInteger(source.width) && Number.isSafeInteger(source.height) && source.width > 0 && source.height > 0
    && source.width * source.height <= 24_000_000, 'invalid_extraction_source');
  fields(value, ['crop', 'mask']); fields(value.crop, ['x', 'y', 'width', 'height']);
  const { x, y, width, height } = value.crop;
  check([x, y, width, height].every(Number.isSafeInteger) && (x as number) >= 0 && (y as number) >= 0
    && (width as number) > 0 && (height as number) > 0
    && (x as number) + (width as number) <= source.width && (y as number) + (height as number) <= source.height, 'invalid_extraction_crop');
  check(value.mask !== null && typeof value.mask === 'object' && !Array.isArray(value.mask), 'invalid_extraction_mask');
  const mask = value.mask as Record<string, unknown>;
  if (mask.kind === 'rectangle') { fields(mask, ['kind']); return; }
  fields(mask, ['kind', 'points']);
  check(mask.kind === 'polygon' && Array.isArray(mask.points) && mask.points.length >= 3 && mask.points.length <= 128, 'invalid_extraction_polygon');
  const points = mask.points as Point[];
  for (const point of points) {
    fields(point, ['x', 'y']);
    check(Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
      && point.x >= (x as number) && point.y >= (y as number)
      && point.x <= (x as number) + (width as number) && point.y <= (y as number) + (height as number), 'invalid_extraction_polygon');
  }
  check(new Set(points.map(point => `${point.x},${point.y}`)).size === points.length, 'invalid_extraction_polygon');
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0);
  check(area !== 0, 'invalid_extraction_polygon');
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || i === 0 && j === points.length - 1) continue;
    check(!intersects(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]), 'invalid_extraction_polygon');
  }
}

/** Binary mask: retained RGBA values are unchanged; no antialiasing invents edge pixels. */
export function pointInExtractionPolygon(point: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j], b = points[i];
    if (onSegment(a, b, point)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
