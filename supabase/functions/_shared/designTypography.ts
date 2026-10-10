/** Defaults for automatic layout; an explicit user size wins. */
export function designTypographyMinimum(canvas: { width: number; height: number }): { body: number; note: number } {
  const short = Math.min(canvas.width, canvas.height);
  return { body: Math.max(14, Math.round(short / 60)), note: Math.max(12, Math.round(short / 90)) };
}
