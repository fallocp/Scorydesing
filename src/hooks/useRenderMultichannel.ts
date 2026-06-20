/**
 * useRenderMultichannel — invoke the render-multichannel edge function.
 *
 * Takes an approved V2 idea + already-uploaded image URL + selected channels
 * and renders one pipeline_piece per channel.
 *
 * Returns the resulting `pipelineRunId`, which the UI then uses to fetch the
 * rendered pieces (with caption metadata) via `useMultichannelPieces`.
 */

import { useMutation } from '@tanstack/react-query';
import { invokeWithRetry } from '@/lib/supabase-retry';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PlatformFormat =
  | 'linkedin-post'
  | 'facebook-post'
  | 'instagram-post'
  | 'instagram-story'
  | 'banner';

export interface PieceV2 {
  id: string;
  shared: {
    angle?: string;
    narrativeAngle?: string;
    funnelStage?: string;
    footer?: string;
    statusPill?: string;
    dataBadge?: string;
    imageIntent?: string;
  };
  overlays: {
    professional: { headline: string; subcopy: string; cta: string };
    square: { headline: string; subcopy: string; cta: string };
    vertical: { headline: string; subcopy: string; cta: string };
  };
  captions: {
    linkedin: { body: string; bullets?: string[] };
    facebook: { body: string; bullets?: string[] };
    instagram: { body: string; hashtags?: string[] };
  };
}

export interface RenderMultichannelInput {
  business_id: string;
  pieceV2: PieceV2;
  imageUrl: string;
  channels: PlatformFormat[];
  templateType?: string;
  layoutVariation?: 'A' | 'B' | 'C';
  existingPipelineRunId?: string;
}

export interface RenderMultichannelOutput {
  pipelineRunId: string;
  piecesCreated: number;
  rendered: number;
  failed: number;
  errors?: Array<{ pieceId: string; error: string }>;
  warning?: string;
  message?: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRenderMultichannel() {
  return useMutation<RenderMultichannelOutput, Error, RenderMultichannelInput>({
    mutationFn: async (input) => {
      const data = await invokeWithRetry<RenderMultichannelOutput>(
        'render-multichannel',
        { body: input as unknown as Record<string, unknown> },
      );
      return data;
    },
  });
}
