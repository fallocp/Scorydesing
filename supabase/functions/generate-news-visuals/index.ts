/**
 * generate-news-visuals — Xending News, paso 2.
 *
 * Toma el `slide_plan` de `generate-news-plan` y devuelve, por slide, la
 * dirección visual resuelta más el prompt de imagen listo para el generador
 * (o para pegar en GPT-Image). Es el equivalente de `generate-carousel-script`
 * para News, pero sin su ADN: aquí no se escribe copy —el copy ya está— se
 * resuelve la ESCENA.
 *
 * Pipeline interno (secciones 14–16, 48–53):
 *   visual_resolver (LLM, todo el set junto) → refuerzo determinístico
 *   (diversidad, confianza, executive wrap) → prompt_builder
 *
 * NO genera la imagen: eso lo hace `generate-design-image` (mode generate),
 * reutilizado por el frontend. Este agente solo resuelve y arma prompts.
 *
 * Auth: JWT obligatorio + membresía validada.
 */

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

import { callOpenAI } from '../_shared/callOpenAI.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';
import {
  buildResolverMessages,
  coerceResolutions,
} from '../_shared/news/newsVisualResolver.ts';
import { buildSlideVisuals } from '../_shared/news/newsPromptBuilder.ts';
import type {
  GenerateNewsVisualsRequest,
  GenerateNewsVisualsResponse,
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
    let body: GenerateNewsVisualsRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }
    if (!Array.isArray(body.slide_plan) || body.slide_plan.length === 0) {
      return jsonResponse({ error: 'parse_error', message: 'Missing slide_plan' }, 400);
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

    // --- Visual resolver (LLM, todo el set junto) -------------------------
    const result = await callOpenAI({
      messages: buildResolverMessages(body.slide_plan),
      max_completion_tokens: 4000,
      temperature: 0.4,
    });

    if (!result.success) {
      return jsonResponse(
        { error: result.error, message: `No se pudo resolver la dirección visual: ${result.message}` },
        502,
      );
    }

    const parsed = parseModelJson<unknown>(result.content);
    if (!parsed.ok) {
      return jsonResponse(
        { error: 'model_output', message: `Respuesta del resolver no parseable: ${parsed.detail}` },
        502,
      );
    }

    // Refuerzo determinístico: confianza, executive wrap, variación de layout.
    const resolutions = coerceResolutions(parsed.data, body.slide_plan);

    // --- Prompt builder ---------------------------------------------------
    const slides = buildSlideVisuals(body.slide_plan, resolutions);

    const response: GenerateNewsVisualsResponse = { slides };
    return jsonResponse(response, 200);
  } catch (err) {
    console.error('generate-news-visuals error:', err);
    return jsonResponse({ error: 'internal_error', message: 'Unexpected error' }, 500);
  }
});
