/**
 * generate-news-plan — Xending News, paso 1.
 *
 * Convierte contenido de noticias (markdown, JSON, texto pegado o salida de
 * Morning Brief) en un plan de slides listo para resolver visualmente. Es el
 * equivalente de `generate-carousel-plan` para News, pero SIN nada de su ADN:
 * no toca copy-kits, scene-kits ni rutas narrativas. News no reescribe la nota
 * (sección 8); el contenido ya es el guion.
 *
 * Pipeline interno (secciones 9–13):
 *   input adapter → normalizer → editorial selector → slide planner
 *
 * El adapter parsea determinísticamente cuando la estructura es clara (JSON o el
 * markdown canónico). Solo cae al modelo para texto irregular, y ahí el modelo
 * EXTRAE, no inventa.
 *
 * Auth: JWT obligatorio + membresía validada, igual que el resto del pipeline.
 */

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

import { callOpenAI } from '../_shared/callOpenAI.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';
import {
  detectInputFormat,
  parseJsonEdition,
  parseStructuredMarkdown,
} from '../_shared/news/newsInputAdapter.ts';
import {
  buildNormalizeMessages,
  coerceNormalizedEdition,
  selectAndPlan,
} from '../_shared/news/newsSlidePlanner.ts';
import {
  NEWS_DEFAULT_SLIDES,
  type GenerateNewsPlanRequest,
  type GenerateNewsPlanResponse,
  type NewsNormalizedEdition,
} from '../_shared/news/news-types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth -------------------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'auth_error', message: 'Missing or invalid Authorization header' },
        401,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'auth_error', message: 'Invalid or expired token' }, 401);
    }

    // --- Body -------------------------------------------------------------
    let body: GenerateNewsPlanRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }
    if (!body.raw_input?.trim()) {
      return jsonResponse({ error: 'parse_error', message: 'Missing raw_input' }, 400);
    }

    // --- Membership -------------------------------------------------------
    const { data: membership } = await userClient
      .from('user_business_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', body.business_id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    // --- Input adapter ----------------------------------------------------
    const format = detectInputFormat(body.raw_input, body.input_format);

    // --- Normalizer -------------------------------------------------------
    // Ruta determinística cuando la estructura es clara; modelo solo si falla.
    let normalized: NewsNormalizedEdition | null = null;

    if (format === 'json') {
      normalized = parseJsonEdition(body.raw_input);
    } else if (format === 'markdown' || format === 'morning_brief') {
      normalized = parseStructuredMarkdown(body.raw_input);
      // Un morning_brief en JSON también entra por aquí como respaldo.
      if (!normalized && format === 'morning_brief') {
        normalized = parseJsonEdition(body.raw_input);
      }
    }

    // Fallback al modelo: texto pegado, o estructura que el parser no reconoció.
    if (!normalized) {
      const result = await callOpenAI({
        messages: buildNormalizeMessages(body.raw_input),
        max_completion_tokens: 4000,
        temperature: 0.2,
      });

      if (!result.success) {
        return jsonResponse(
          { error: result.error, message: `No se pudo normalizar el contenido: ${result.message}` },
          502,
        );
      }

      const parsed = parseModelJson<unknown>(result.content);
      if (!parsed.ok) {
        return jsonResponse(
          { error: 'model_output', message: `Respuesta del modelo no parseable: ${parsed.detail}` },
          502,
        );
      }

      normalized = coerceNormalizedEdition(parsed.data);
    }

    if (!normalized || normalized.slides.length === 0) {
      return jsonResponse(
        {
          error: 'empty_edition',
          message: 'No se identificaron noticias en el contenido. Revisa el input.',
        },
        422,
      );
    }

    // El tipo de edición del body manda sobre el detectado (permite forzar special).
    if (body.edition_type) {
      normalized.edition = body.edition_type;
    }

    // --- Editorial selector + slide planner -------------------------------
    const slidePlan = selectAndPlan(normalized, {
      targetSlides: body.target_slides ?? NEWS_DEFAULT_SLIDES,
    });

    const response: GenerateNewsPlanResponse = {
      normalized,
      slide_plan: slidePlan,
      detected_format: format,
    };

    return jsonResponse(response, 200);
  } catch (err) {
    console.error('generate-news-plan error:', err);
    return jsonResponse({ error: 'internal_error', message: 'Unexpected error' }, 500);
  }
});
