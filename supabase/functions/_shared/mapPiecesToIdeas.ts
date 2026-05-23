// ---------------------------------------------------------------------------
// Pieces → Ideas mapping (Req 1.4, 1.5, 8.1, 8.5)
// ---------------------------------------------------------------------------

/**
 * Maps the richer `pieces` output from masterContentPrompt to the
 * ContentIdea format expected by the frontend pipeline store.
 *
 * Each piece gets a stable `id` (from the piece itself or auto-generated)
 * and all fields required by the ContentIdea type so the pipeline can
 * pass them downstream to the Image Agent and Channel Adapter.
 *
 * Also returns legacy `ideas` array for backward compatibility with
 * older consumers that expect { headline, subcopy, cta }.
 */
export function mapPiecesToIdeas(pieces: Record<string, unknown>[]) {
  // Full-fidelity mapping for Pipeline V2 frontend (ContentIdea shape)
  const mapped = pieces.map((piece, idx) => ({
    id: (piece.id as string) || `idea_${String(idx + 1).padStart(3, '0')}`,
    headline: (piece.headline as string) ?? '',
    body: (piece.body as string) ?? '',
    cta: (piece.cta as string) ?? '',
    footer: (piece.footer as string) ?? '',
    statusPill: (piece.statusPill as string) ?? '',
    dataBadge: (piece.dataBadge as string) ?? '',
    imageIntent: (piece.imageIntent as string) ?? (piece.imageDirection as string) ?? (piece.imageSuggestion as string) ?? '',
    angle: (piece.angle as string) ?? '',
    narrativeAngle: (piece.narrativeAngle as string) ?? '',
    funnelStage: (piece.funnelStage as string) ?? 'atraccion',
  }));

  // Legacy format for backward compatibility
  const ideas = pieces.map((piece) => ({
    headline: piece.headline as string,
    subcopy: piece.body as string,
    cta: piece.cta as string,
    imageSuggestion: (piece.imageSuggestion as string) || (piece.imageDirection as string) || undefined,
  }));

  return { ideas, mapped, type: 'copy' as const, metadata: { pieces } };
}
