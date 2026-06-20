/**
 * createPiecesFromPieceV2 — fan-out a single V2 idea into N pipeline_pieces
 * (one per platform), each carrying the right overlay variant + caption +
 * the SAME shared image.
 *
 * See:
 *   - .kiro/specs/creative-os-pipeline/design.md → Componente 6.5
 *   - .kiro/specs/creative-os-pipeline/requirements.md → Requirement 18
 *   - supabase/migrations/20260530_add_multichannel_copy_to_pipeline_pieces.sql
 *
 * Design notes:
 *   - One image per idea, reused across ALL platforms. Rationale: generating
 *     separate images per aspect ratio (even with the same prompt) breaks
 *     visual coherence — the model produces different scenes/people/framing
 *     each call, so the campaign "set" looks inconsistent.
 *   - The image is generated as 1024×1024 (square) and the templates' image
 *     slots accept square inputs across all platforms (LI/FB/Banner show it
 *     in a side column, IG Post fills the canvas, IG Story shows it as a
 *     hero block above the copy).
 *   - This function does NOT call the database. It returns insert rows that
 *     the caller (orchestrator) persists. Keeping it pure makes it trivial
 *     to unit-test and reuse from quick-fire.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlatformFormat =
  | "linkedin-post"
  | "facebook-post"
  | "instagram-post"
  | "instagram-story"
  | "banner";

export type OverlayVariant = "professional" | "square" | "vertical";
export type CaptionKey = "linkedin" | "facebook" | "instagram";

export interface OverlayCopy {
  headline: string;
  subcopy: string;
  cta: string;
}

export interface CaptionWithBullets {
  body: string;
  bullets: string[];
}

export interface CaptionWithHashtags {
  body: string;
  hashtags: string[];
}

export interface PieceV2Shared {
  angle?: string;
  narrativeAngle?: string;
  funnelStage?: string;
  footer?: string;
  statusPill?: string;
  dataBadge?: string;
  imageIntent?: string;
  visualStyle?: string;
  recommendedTemplate?: string;
  targetAudience?: string;
  industryContext?: string;
  complianceNotes?: string[];
  variationReason?: string;
}

export interface PieceV2 {
  id: string;
  shared: PieceV2Shared;
  overlays: {
    professional: OverlayCopy;
    square: OverlayCopy;
    vertical: OverlayCopy;
  };
  captions: {
    linkedin: CaptionWithBullets;
    facebook: CaptionWithBullets;
    instagram: CaptionWithHashtags;
  };
}

export interface PipelinePieceInsert {
  pipeline_run_id: string;
  business_id: string;
  idea_id: string;
  platform: PlatformFormat;

  // Overlay (text on the image, injected by template engine)
  headline: string;
  body: string;
  cta: string;
  overlay_variant: OverlayVariant;

  // Caption (post text, outside the image). NULL for banner / story.
  caption_body: string | null;
  caption_bullets: string[] | null;
  caption_hashtags: string[] | null;

  // Shared
  footer: string | null;
  status_pill: string | null;
  data_badge: string | null;
  image_intent: string | null;
  angle: string | null;
  narrative_angle: string | null;
  funnel_stage: string | null;

  // Image (the SAME path across all platforms for this idea)
  image_storage_path: string | null;

  // Status: image_ready if the shared image is present, content_ready otherwise
  piece_status: "content_ready" | "image_ready";
}

// ─── Mappings ────────────────────────────────────────────────────────────────

export const PLATFORM_TO_OVERLAY_VARIANT: Record<PlatformFormat, OverlayVariant> = {
  "linkedin-post": "professional",
  "facebook-post": "professional",
  "banner": "professional",
  "instagram-post": "square",
  "instagram-story": "vertical",
};

export const PLATFORM_TO_CAPTION: Record<PlatformFormat, CaptionKey | null> = {
  "linkedin-post": "linkedin",
  "facebook-post": "facebook",
  "instagram-post": "instagram",
  "instagram-story": null,
  "banner": null,
};

// ─── Main fan-out ────────────────────────────────────────────────────────────

interface FanOutInput {
  piece: PieceV2;
  channels: PlatformFormat[];
  /** Shared image storage path used by all platforms. Null if not generated yet. */
  imageStoragePath: string | null;
  pipelineRunId: string;
  businessId: string;
}

/**
 * Produce N PipelinePieceInsert rows from one V2 piece. The caller persists.
 *
 * - One row per platform present in `channels`.
 * - Overlay variant resolved from PLATFORM_TO_OVERLAY_VARIANT.
 * - Caption (or null) resolved from PLATFORM_TO_CAPTION.
 * - All rows share the same `imageStoragePath`.
 * - If `imageStoragePath` is null, every row is created with
 *   `piece_status: 'content_ready'` so the caller knows to generate
 *   the image before rendering.
 */
export function createPiecesFromPieceV2(input: FanOutInput): PipelinePieceInsert[] {
  const { piece, channels, imageStoragePath, pipelineRunId, businessId } = input;
  if (channels.length === 0) return [];

  return channels.map((platform) => {
    const variant = PLATFORM_TO_OVERLAY_VARIANT[platform];
    const captionKey = PLATFORM_TO_CAPTION[platform];

    const overlay = piece.overlays[variant];

    let captionBody: string | null = null;
    let captionBullets: string[] | null = null;
    let captionHashtags: string[] | null = null;

    if (captionKey === "linkedin") {
      captionBody = piece.captions.linkedin.body;
      captionBullets = piece.captions.linkedin.bullets ?? [];
    } else if (captionKey === "facebook") {
      captionBody = piece.captions.facebook.body;
      captionBullets = piece.captions.facebook.bullets ?? [];
    } else if (captionKey === "instagram") {
      captionBody = piece.captions.instagram.body;
      captionHashtags = piece.captions.instagram.hashtags ?? [];
    }
    // else: banner or instagram-story → all caption fields stay null

    return {
      pipeline_run_id: pipelineRunId,
      business_id: businessId,
      idea_id: piece.id,
      platform,

      // Overlay (template engine slots)
      headline: overlay.headline,
      body: overlay.subcopy,
      cta: overlay.cta,
      overlay_variant: variant,

      // Caption (post text)
      caption_body: captionBody,
      caption_bullets: captionBullets,
      caption_hashtags: captionHashtags,

      // Shared strategy
      footer: piece.shared.footer ?? null,
      status_pill: piece.shared.statusPill ?? null,
      data_badge: piece.shared.dataBadge ?? null,
      image_intent: piece.shared.imageIntent ?? null,
      angle: piece.shared.angle ?? null,
      narrative_angle: piece.shared.narrativeAngle ?? null,
      funnel_stage: piece.shared.funnelStage ?? null,

      // Image (same across platforms for this idea)
      image_storage_path: imageStoragePath,

      // Status
      piece_status: imageStoragePath ? "image_ready" : "content_ready",
    };
  });
}
