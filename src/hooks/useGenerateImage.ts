/**
 * Generates images through the shared DesAIng job engine.
 * The legacy text endpoint only prepares prompts; consumers save then acknowledge results.
 */

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import { useImageGenerationSettings } from './useImageGenerationSettings';
import { generateSharedDesignImage, type SharedDesignImageResult, type SharedImageRequest, type SharedImageScope } from '@/lib/desaing/sharedImageGeneration';
import type { Brand } from '@/types/xendingDesign';
import type { ImageModel } from '@/lib/imageGenerationSettings';

export interface GenerateImageRequest extends SharedImageRequest {
  /** Stable consumer slot: repeated delivery recovers its existing operation. */
  generationKey?: string;
  expectedActorId?: string;
  libraryContext?: SharedImageScope['library'];
  userRequest: string;
  brand: Brand;
  mainSubject?: string;
  businessMessage?: string;
  customColors?: string[];
  composition?: string;
  negativeSpacePosition?: string;
  moodKeywords?: string[];
  style?: string;
  lightingStyle?: string;
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9';
  includeText?: boolean;
  avoid?: string[];
  headline?: string;
  body?: string;
  cta?: string;
  footer?: string;
  backgroundStyle?: 'navy' | 'light_cream' | 'white' | 'white_2';
  corridorMode?: 'auto' | 'geographic_corridor' | 'operational_route' | 'global_network' | 'bidirectional_corridor';
  corridorFlowType?: 'auto' | 'payment' | 'goods' | 'bidirectional';
  corridorOrigin?: string;
  corridorDestination?: string;
  /** Explicit per-request snapshot; bypasses DB/global source for reproducibility. */
  masterPromptVersion?: 'v1' | 'v2' | 'v3';
  /**
   * Optional process-specific style prompt. When set, the backend
   * uses it as the step-1 system prompt (single-image path) so each generator
   * drives its own look. Pass the current (possibly edited) prompt text.
   */
  styleSystemPrompt?: string;
  /** Explicit model selection; omitted legacy callers retain the server default. */
  imageModel?: ImageModel;
  /** Explicit render quality. The shared engine rejects legacy 'auto'. */
  imageQuality?: 'low' | 'medium' | 'high' | 'auto';
  /**
   * Shared image-engine "gate" support:
   * - mode 'prompts' → run step-1 only and return the built prompt (no image).
   * - When `promptFinal` is set, the backend SKIPS step-1 and renders that
   *   exact (user-approved/edited) prompt.
   */
  mode?: 'prompts' | 'generate';
  promptFinal?: string;
  negativeInstructions?: string;
  /**
   * Image-to-image (restyle / remix): a reference image (raw base64 or data
   * URL). When set, the backend uses the OpenAI images/edits endpoint so the
   * reference's subject and composition are preserved and only the styling
   * changes. When omitted, generation is pure text-to-image.
   */
  referenceImageBase64?: string;
  /** How many variations to return (1–3). Defaults to 1. */
  imageCount?: number;
}

export interface ImagePromptDetails {
  promptFinal: string;
  negativeInstructions: string;
  aspectRatio: string;
  recommendedUse: string;
  creativeRationale: string;
}

export interface GenerateImageResponse {
  results: SharedDesignImageResult[];
  imageBase64: string;
  /** All returned variations (length = requested imageCount). First = imageBase64. */
  images?: string[];
  promptUsed: ImagePromptDetails;
}

/** Prompt-only response (mode: 'prompts') — no image is generated. */
export interface BuildImagePromptResponse {
  promptUsed: ImagePromptDetails;
}

async function buildImagePrompt(
  request: GenerateImageRequest
): Promise<BuildImagePromptResponse> {
  const { data, error } = await supabase.functions.invoke('generate-design-image', { body: { ...request, mode: 'prompts' } });
  if (error || data?.error || !data?.promptUsed?.promptFinal) throw new Error(data?.message || error?.message || 'No se pudo preparar el prompt.');
  return data as BuildImagePromptResponse;
}

export function useGenerateImage(processKey = 'standalone-image') {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const { settings, setSettings } = useImageGenerationSettings(activeBusinessId, processKey);
  const mutation = useMutation({
    async mutationFn(input: GenerateImageRequest): Promise<GenerateImageResponse> {
      if (!activeBusinessId || !user?.id) throw new Error('Selecciona una marca e inicia sesión antes de generar.');
      const { generationKey, libraryContext, expectedActorId, ...request } = structuredClone(input);
      if (request.business_id && request.business_id !== activeBusinessId || expectedActorId && expectedActorId !== user.id) {
        throw new Error('La sesión o la marca cambió. Vuelve a abrir el generador.');
      }
      const count = request.imageCount ?? 1;
      if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('Elige entre una y tres versiones.');
      const scope: SharedImageScope = { businessId: activeBusinessId, actorId: user.id, process: 'stock',
        slotKey: `${processKey}:${generationKey ?? 'current'}`,
        library: libraryContext ?? { brand: request.brand, collection: 'generated', description: request.userRequest } };
      const results: SharedDesignImageResult[] = [];
      for (let index = 0; index < count; index++) {
        results.push(await generateSharedDesignImage({ ...request, imageCount: 1,
          imageModel: request.imageModel ?? settings.model, imageQuality: request.imageQuality ?? settings.quality },
        { ...scope, slotKey: `${scope.slotKey}:v${index}` }));
      }
      return { imageBase64: results[0].imageBase64, images: results.map(item => item.imageBase64), promptUsed: results[0].promptUsed, results };
    },
    mutationKey: ['shared-design-image', activeBusinessId, user?.id, processKey], retry: false,
  });
  return { ...mutation, imageSettings: settings, setImageSettings: setSettings };
}

/**
 * Expand a scene/idea into an editable image prompt WITHOUT generating the
 * image (the "gate"). Consumers show the returned prompt for review/edit, then
 * call useGenerateImage with `promptFinal` set to render it.
 */
export function useBuildImagePrompt() {
  return useMutation({
    mutationFn: buildImagePrompt,
    mutationKey: ['generate-design-image', 'prompts'],
    retry: false,
  });
}
