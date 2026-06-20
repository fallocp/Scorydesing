// ---------------------------------------------------------------------------
// Pieces → Ideas mapping (Req 1.4, 1.5, 8.1, 8.5, 18.1)
// ---------------------------------------------------------------------------

/**
 * Maps masterContentPrompt output (v1 single-channel OR v2 multi-channel)
 * to the ContentIdea format expected by the frontend pipeline store.
 *
 * Auto-detects the version by inspecting the first piece:
 *   - v1: piece has top-level { headline, body, cta, ... }
 *   - v2: piece has { shared, overlays, captions }
 *
 * For v2, the `mapped` array exposes a single `professional` overlay as the
 * default headline/body/cta so legacy consumers keep working, AND the full
 * raw piece is preserved in `metadata.pieces` so the orchestrator can split
 * it into multiple pipeline_pieces (one per platform).
 *
 * Returns:
 *   - ideas:     legacy format ({ headline, subcopy, cta }) for backward compat
 *   - mapped:    ContentIdea-shaped objects for the frontend store
 *   - metadata:  { pieces } — the raw output, useful for v2 fan-out
 */

interface MappedIdea {
  id: string;
  headline: string;
  body: string;
  cta: string;
  footer: string;
  statusPill: string;
  dataBadge: string;
  imageIntent: string;
  imageSuggestion: string;
  angle: string;
  narrativeAngle: string;
  funnelStage: string;
  // v2-only fields (undefined when input is v1)
  overlays?: {
    professional: { headline: string; subcopy: string; cta: string };
    square: { headline: string; subcopy: string; cta: string };
    vertical: { headline: string; subcopy: string; cta: string };
  };
  captions?: {
    linkedin: { body: string; bullets: string[] };
    facebook: { body: string; bullets: string[] };
    instagram: { body: string; hashtags: string[] };
  };
  schemaVersion: "v1" | "v2";
}

interface LegacyIdea {
  headline: string;
  subcopy: string;
  cta: string;
  imageSuggestion?: string;
}

interface MapResult {
  ideas: LegacyIdea[];
  mapped: MappedIdea[];
  type: "copy";
  metadata: { pieces: Record<string, unknown>[]; schemaVersion: "v1" | "v2" };
}

function isV2Piece(piece: Record<string, unknown>): boolean {
  return (
    piece.overlays !== undefined &&
    piece.captions !== undefined &&
    typeof piece.overlays === "object" &&
    typeof piece.captions === "object"
  );
}

function getOverlay(
  piece: Record<string, unknown>,
  variant: "professional" | "square" | "vertical",
): { headline: string; subcopy: string; cta: string } {
  const overlays = piece.overlays as Record<string, unknown> | undefined;
  const overlay = overlays?.[variant] as Record<string, unknown> | undefined;
  return {
    headline: (overlay?.headline as string) ?? "",
    subcopy: (overlay?.subcopy as string) ?? "",
    cta: (overlay?.cta as string) ?? "",
  };
}

function getCaption(
  piece: Record<string, unknown>,
  key: "linkedin" | "facebook" | "instagram",
): {
  body: string;
  bullets: string[];
  hashtags: string[];
} {
  const captions = piece.captions as Record<string, unknown> | undefined;
  const caption = captions?.[key] as Record<string, unknown> | undefined;
  const bullets = caption?.bullets;
  const hashtags = caption?.hashtags;
  return {
    body: (caption?.body as string) ?? "",
    bullets: Array.isArray(bullets) ? (bullets as string[]) : [],
    hashtags: Array.isArray(hashtags) ? (hashtags as string[]) : [],
  };
}

export function mapPiecesToIdeas(
  pieces: Record<string, unknown>[],
): MapResult {
  const v2 = pieces.length > 0 && isV2Piece(pieces[0]);

  const mapped: MappedIdea[] = pieces.map((piece, idx) => {
    const id =
      (piece.id as string) || `idea_${String(idx + 1).padStart(3, "0")}`;

    if (v2) {
      const shared = (piece.shared as Record<string, unknown>) ?? {};
      const professional = getOverlay(piece, "professional");
      const square = getOverlay(piece, "square");
      const vertical = getOverlay(piece, "vertical");
      const linkedin = getCaption(piece, "linkedin");
      const facebook = getCaption(piece, "facebook");
      const instagram = getCaption(piece, "instagram");

      return {
        id,
        // Default to professional overlay for legacy consumers
        headline: professional.headline,
        body: professional.subcopy,
        cta: professional.cta,
        footer: (shared.footer as string) ?? "",
        statusPill: (shared.statusPill as string) ?? "",
        dataBadge: (shared.dataBadge as string) ?? "",
        imageIntent: (shared.imageIntent as string) ?? "",
        imageSuggestion: (shared.imageSuggestion as string) ?? "",
        angle: (shared.angle as string) ?? "",
        narrativeAngle: (shared.narrativeAngle as string) ?? "",
        funnelStage: (shared.funnelStage as string) ?? "atraccion",
        overlays: {
          professional,
          square,
          vertical,
        },
        captions: {
          linkedin: { body: linkedin.body, bullets: linkedin.bullets },
          facebook: { body: facebook.body, bullets: facebook.bullets },
          instagram: { body: instagram.body, hashtags: instagram.hashtags },
        },
        schemaVersion: "v2",
      };
    }

    // v1: top-level fields
    return {
      id,
      headline: (piece.headline as string) ?? "",
      body: (piece.body as string) ?? "",
      cta: (piece.cta as string) ?? "",
      footer: (piece.footer as string) ?? "",
      statusPill: (piece.statusPill as string) ?? "",
      dataBadge: (piece.dataBadge as string) ?? "",
      imageIntent:
        (piece.imageIntent as string) ??
        (piece.imageDirection as string) ??
        (piece.imageSuggestion as string) ??
        "",
      imageSuggestion:
        (piece.imageSuggestion as string) ??
        (piece.imageDirection as string) ??
        (piece.imageIntent as string) ??
        "",
      angle: (piece.angle as string) ?? "",
      narrativeAngle: (piece.narrativeAngle as string) ?? "",
      funnelStage: (piece.funnelStage as string) ?? "atraccion",
      schemaVersion: "v1",
    };
  });

  // Legacy `ideas` array for callers that still expect { headline, subcopy, cta }
  const ideas: LegacyIdea[] = pieces.map((piece) => {
    if (v2) {
      const professional = getOverlay(piece, "professional");
      const shared = (piece.shared as Record<string, unknown>) ?? {};
      return {
        headline: professional.headline,
        subcopy: professional.subcopy,
        cta: professional.cta,
        imageSuggestion:
          (shared.imageSuggestion as string) ||
          (shared.imageIntent as string) ||
          undefined,
      };
    }
    return {
      headline: (piece.headline as string) ?? "",
      subcopy: (piece.body as string) ?? "",
      cta: (piece.cta as string) ?? "",
      imageSuggestion:
        (piece.imageSuggestion as string) ||
        (piece.imageDirection as string) ||
        undefined,
    };
  });

  return {
    ideas,
    mapped,
    type: "copy",
    metadata: { pieces, schemaVersion: v2 ? "v2" : "v1" },
  };
}
