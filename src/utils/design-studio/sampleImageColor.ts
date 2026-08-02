/**
 * sampleBottomColor — reads the dominant color of the bottom strip of an image.
 *
 * Used to patch out the legal text older mockups have baked in: the fill has to
 * match the real background instead of assuming pure white, otherwise the patch
 * shows as a lighter rectangle on off-white pieces.
 *
 * Takes the MODE of the quantized colors rather than the average, because the
 * average of "gray text on white" is a dirty gray while the mode is the
 * background. Returns null when the pixels cannot be read (no CORS headers on
 * the bucket taint the canvas), so callers can fall back to white.
 */

/** Quantization step — collapses JPEG/PNG noise into stable buckets. */
const STEP = 8

function toHex(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0')
}

export async function sampleBottomColor(
  imageUrl: string,
  /** Height of the sampled strip, as a fraction of the image height. */
  stripFraction = 0.08,
): Promise<string | null> {
  const image = await loadCorsImage(imageUrl)
  if (!image) return null

  const stripHeight = Math.max(1, Math.round(image.naturalHeight * stripFraction))
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = stripHeight

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(
    image,
    0,
    image.naturalHeight - stripHeight,
    image.naturalWidth,
    stripHeight,
    0,
    0,
    image.naturalWidth,
    stripHeight,
  )

  let pixels: Uint8ClampedArray
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, stripHeight).data
  } catch {
    // Tainted canvas — the bucket did not send Access-Control-Allow-Origin.
    return null
  }

  const counts = new Map<string, number>()
  let best = ''
  let bestCount = 0

  // Sample every 4th pixel: plenty for a mode, much cheaper on large images.
  for (let i = 0; i < pixels.length; i += 4 * 4) {
    if (pixels[i + 3] < 200) continue // ignore transparent pixels
    const key = [
      Math.round(pixels[i] / STEP) * STEP,
      Math.round(pixels[i + 1] / STEP) * STEP,
      Math.round(pixels[i + 2] / STEP) * STEP,
    ].join(',')

    const next = (counts.get(key) ?? 0) + 1
    counts.set(key, next)
    if (next > bestCount) {
      bestCount = next
      best = key
    }
  }

  if (!best) return null
  const [r, g, b] = best.split(',').map(Number)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Load the image with CORS enabled. `crossOrigin` must be set before the
 * request for the canvas to stay readable, and it makes the load fail outright
 * when the server omits the header — hence the separate, disposable load.
 */
function loadCorsImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}
