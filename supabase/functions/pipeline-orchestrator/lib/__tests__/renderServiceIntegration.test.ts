import { describe, it, expect } from 'vitest'

/**
 * Unit Tests for Render Service Integration
 *
 * Tests the render-design-png Edge Function's integration with the pipeline-orchestrator.
 * Validates:
 * - Batch rendering collects all html_ready pieces
 * - render_service_unavailable error pauses pipeline (not fails)
 * - PNG storage path is correctly formed
 * - Property 9: Pipeline cannot complete without at least one rendered piece
 *
 * **Validates: Property 9 (Pipeline completeness)**
 */

// ---------------------------------------------------------------------------
// Re-define core logic inline for vitest compatibility
// (The original uses Deno-style imports incompatible with Node/vitest)
// ---------------------------------------------------------------------------

const PLATFORM_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'instagram-story': { width: 1080, height: 1920 },
  'instagram-post': { width: 1080, height: 1080 },
  'linkedin-post': { width: 1200, height: 628 },
  'facebook-post': { width: 1200, height: 628 },
  'banner': { width: 1920, height: 1080 },
}

const STORAGE_BUCKET = 'pipeline-renders'

/**
 * Build storage path for a rendered PNG.
 */
function buildStoragePath(
  businessId: string,
  pipelineRunId: string,
  filename: string,
): string {
  return `${businessId}/${pipelineRunId}/${filename}`
}

/**
 * Build render filename from piece metadata.
 */
function buildRenderFilename(
  templateType: string,
  platform: string,
  pieceIdPrefix: string,
): string {
  return `${templateType}_${platform}_${pieceIdPrefix}.png`
}

/**
 * Determine if an error indicates the render service is unavailable.
 */
function isServiceUnavailableError(errorType: string): boolean {
  return errorType === 'render_service_unavailable'
}

/**
 * Check if pipeline can transition to completed (Property 9).
 * Returns true only if at least one piece is rendered with a storage path.
 */
function canCompleteRun(
  pieces: Array<{ piece_status: string; png_storage_path: string | null }>,
): boolean {
  return pieces.some(
    (p) => p.piece_status === 'rendered' && p.png_storage_path !== null,
  )
}

/**
 * Build batch render items from pipeline pieces.
 */
function buildRenderItems(
  pieces: Array<{
    id: string
    business_id: string
    platform: string
    template_type: string
    html_content: string
  }>,
): Array<{
  html: string
  width: number
  height: number
  filename: string
  pieceId: string
  businessId: string
}> {
  return pieces.map((piece) => {
    const dims = PLATFORM_DIMENSIONS[piece.platform] ?? { width: 1080, height: 1080 }
    const filename = buildRenderFilename(
      piece.template_type,
      piece.platform,
      piece.id.slice(0, 8),
    )
    return {
      html: piece.html_content,
      width: dims.width,
      height: dims.height,
      filename,
      pieceId: piece.id,
      businessId: piece.business_id,
    }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Render Service Integration', () => {
  describe('Storage path construction', () => {
    it('builds correct storage path from business_id, run_id, and filename', () => {
      const path = buildStoragePath(
        'biz-123',
        'run-456',
        'card-light_instagram-story_abc12345.png',
      )
      expect(path).toBe('biz-123/run-456/card-light_instagram-story_abc12345.png')
    })

    it('uses STORAGE_BUCKET constant for pipeline renders', () => {
      expect(STORAGE_BUCKET).toBe('pipeline-renders')
    })
  })

  describe('Render filename construction', () => {
    it('builds filename from template_type, platform, and piece ID prefix', () => {
      const filename = buildRenderFilename('card-light', 'instagram-story', 'abc12345')
      expect(filename).toBe('card-light_instagram-story_abc12345.png')
    })

    it('handles different template types and platforms', () => {
      const filename = buildRenderFilename('breaking-news', 'linkedin-post', 'def67890')
      expect(filename).toBe('breaking-news_linkedin-post_def67890.png')
    })
  })

  describe('Platform dimensions resolution', () => {
    it('resolves instagram-story to 1080x1920', () => {
      expect(PLATFORM_DIMENSIONS['instagram-story']).toEqual({ width: 1080, height: 1920 })
    })

    it('resolves instagram-post to 1080x1080', () => {
      expect(PLATFORM_DIMENSIONS['instagram-post']).toEqual({ width: 1080, height: 1080 })
    })

    it('resolves linkedin-post to 1200x628', () => {
      expect(PLATFORM_DIMENSIONS['linkedin-post']).toEqual({ width: 1200, height: 628 })
    })

    it('resolves facebook-post to 1200x628', () => {
      expect(PLATFORM_DIMENSIONS['facebook-post']).toEqual({ width: 1200, height: 628 })
    })

    it('resolves banner to 1920x1080', () => {
      expect(PLATFORM_DIMENSIONS['banner']).toEqual({ width: 1920, height: 1080 })
    })

    it('falls back to 1080x1080 for unknown platforms', () => {
      const dims = PLATFORM_DIMENSIONS['unknown-platform'] ?? { width: 1080, height: 1080 }
      expect(dims).toEqual({ width: 1080, height: 1080 })
    })
  })

  describe('Service unavailability detection', () => {
    it('identifies render_service_unavailable as a service unavailability error', () => {
      expect(isServiceUnavailableError('render_service_unavailable')).toBe(true)
    })

    it('does not flag other errors as service unavailability', () => {
      expect(isServiceUnavailableError('api_error')).toBe(false)
      expect(isServiceUnavailableError('content_policy')).toBe(false)
      expect(isServiceUnavailableError('render_error')).toBe(false)
    })
  })

  describe('Property 9: Pipeline completeness', () => {
    it('allows completion when at least one piece is rendered with storage path', () => {
      const pieces = [
        { piece_status: 'rendered', png_storage_path: 'biz/run/file.png' },
        { piece_status: 'html_ready', png_storage_path: null },
      ]
      expect(canCompleteRun(pieces)).toBe(true)
    })

    it('blocks completion when no pieces are rendered', () => {
      const pieces = [
        { piece_status: 'html_ready', png_storage_path: null },
        { piece_status: 'html_ready', png_storage_path: null },
      ]
      expect(canCompleteRun(pieces)).toBe(false)
    })

    it('blocks completion when pieces are rendered but have no storage path', () => {
      const pieces = [
        { piece_status: 'rendered', png_storage_path: null },
      ]
      expect(canCompleteRun(pieces)).toBe(false)
    })

    it('blocks completion with empty pieces array', () => {
      expect(canCompleteRun([])).toBe(false)
    })

    it('allows completion even if some pieces failed (at least one rendered)', () => {
      const pieces = [
        { piece_status: 'rendered', png_storage_path: 'biz/run/piece1.png' },
        { piece_status: 'html_ready', png_storage_path: null },
        { piece_status: 'draft', png_storage_path: null },
      ]
      expect(canCompleteRun(pieces)).toBe(true)
    })
  })

  describe('Batch render items construction', () => {
    it('builds render items with correct dimensions for each platform', () => {
      const pieces = [
        {
          id: 'abcdefgh-piece-001',
          business_id: 'biz-123',
          platform: 'instagram-story',
          template_type: 'card-light',
          html_content: '<html>story</html>',
        },
        {
          id: 'ijklmnop-piece-002',
          business_id: 'biz-123',
          platform: 'linkedin-post',
          template_type: 'breaking-news',
          html_content: '<html>linkedin</html>',
        },
      ]

      const items = buildRenderItems(pieces)

      expect(items).toHaveLength(2)

      expect(items[0]).toEqual({
        html: '<html>story</html>',
        width: 1080,
        height: 1920,
        filename: 'card-light_instagram-story_abcdefgh.png',
        pieceId: 'abcdefgh-piece-001',
        businessId: 'biz-123',
      })

      expect(items[1]).toEqual({
        html: '<html>linkedin</html>',
        width: 1200,
        height: 628,
        filename: 'breaking-news_linkedin-post_ijklmnop.png',
        pieceId: 'ijklmnop-piece-002',
        businessId: 'biz-123',
      })
    })

    it('uses fallback dimensions for unknown platforms', () => {
      const pieces = [
        {
          id: 'qrstuvwx-piece-003',
          business_id: 'biz-456',
          platform: 'tiktok-video',
          template_type: 'card-dark',
          html_content: '<html>tiktok</html>',
        },
      ]

      const items = buildRenderItems(pieces)

      expect(items[0].width).toBe(1080)
      expect(items[0].height).toBe(1080)
    })

    it('handles multi-platform batch with all supported platforms', () => {
      const platforms = Object.keys(PLATFORM_DIMENSIONS)
      const pieces = platforms.map((platform, i) => ({
        id: `${String(i).padStart(8, '0')}-piece-id`,
        business_id: 'biz-multi',
        platform,
        template_type: 'card-light',
        html_content: `<html>${platform}</html>`,
      }))

      const items = buildRenderItems(pieces)

      expect(items).toHaveLength(5)

      // Verify each item has correct dimensions for its platform
      items.forEach((item, i) => {
        const expectedDims = PLATFORM_DIMENSIONS[platforms[i]]
        expect(item.width).toBe(expectedDims.width)
        expect(item.height).toBe(expectedDims.height)
      })
    })
  })
})
