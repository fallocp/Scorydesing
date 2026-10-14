/**
 * generate-fx-daily — agente del Daily Report FX.
 *
 * Recibe el MD del análisis diario USD/MXN, lo condensa/selecciona en el modelo
 * editable (FxDailyReport) con un LLM, y devuelve además el prompt de imagen
 * (escena AI-baked) con los valores del día inyectados.
 *
 * No genera la imagen ni compone el HTML: eso lo hace el frontend reutilizando
 * `generate-design-image` (mode generate) y `buildFxDailyHtml`.
 *
 * `locale` ('es' por defecto | 'en'): el MD de entrada siempre es español. En 'en'
 * el reporte se redacta nativo en inglés a partir de hechos (facts-first, una
 * llamada) + post-check determinístico; si falla, una reparación y luego 422
 * `en_validation_failed` (ver _shared/fx-daily/fxDailyEnglishPipeline.ts).
 * El prompt de imagen es el mismo en ambos idiomas.
 *
 * Auth: JWT obligatorio + membresía validada, igual que el resto del pipeline.
 */

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0?deps=@supabase/storage-js@2.10.4';

import { callOpenAI } from '../_shared/callOpenAI.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';
import {
  buildExtractMessages,
  coerceFxDaily,
  extractApprovedHeadline,
} from '../_shared/fx-daily/fxDailyExtractor.ts';
import { runFxEnglishPipeline } from '../_shared/fx-daily/fxDailyEnglishPipeline.ts';
import { buildFxDailyImagePrompt } from '../_shared/fx-daily/fxDailyImagePrompt.ts';
import type {
  GenerateFxDailyRequest,
  GenerateFxDailyResponse,
} from '../_shared/fx-daily/fx-daily-types.ts';

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'auth_error', message: 'Missing or invalid Authorization header' }, 401);
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

    let body: GenerateFxDailyRequest;
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
    const locale = body.locale ?? 'es';
    if (locale !== 'es' && locale !== 'en') {
      return jsonResponse({ error: 'parse_error', message: 'Invalid locale' }, 400);
    }

    const { data: membership } = await userClient
      .from('user_business_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', body.business_id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    // Agente: condensa el MD a los campos editables. Si el encabezado trae un
    // titular aprobado entre paréntesis, ese texto queda seleccionado por defecto.
    const approvedHeadline = extractApprovedHeadline(body.raw_input);

    if (locale === 'en') {
      const en = await runFxEnglishPipeline(body.raw_input, approvedHeadline, callOpenAI);
      if (!en.ok) return jsonResponse(en.body, en.status);
      const enResponse: GenerateFxDailyResponse = {
        report: en.report,
        headline_options: en.headline_options,
        image_prompt: buildFxDailyImagePrompt(en.report),
      };
      return jsonResponse(enResponse, 200);
    }

    const result = await callOpenAI({
      messages: buildExtractMessages(body.raw_input, approvedHeadline),
      max_completion_tokens: 3000,
      temperature: 0.3,
    });

    if (!result.success) {
      return jsonResponse(
        { error: result.error, message: `No se pudo procesar el análisis: ${result.message}` },
        502,
      );
    }

    const parsed = parseModelJson<unknown>(result.content);
    if (!parsed.ok) {
      return jsonResponse(
        { error: 'model_output', message: `Respuesta no parseable: ${parsed.detail}` },
        502,
      );
    }

    const report = coerceFxDaily(parsed.data);
    if (!report || (!report.headline && !approvedHeadline)) {
      return jsonResponse(
        { error: 'empty_report', message: 'No se pudieron extraer los campos del análisis.' },
        422,
      );
    }

    const alternativeHeadline = report.headline;
    if (approvedHeadline) report.headline = approvedHeadline;

    const headlineOptions = approvedHeadline
      ? [
          { value: approvedHeadline, source: 'approved' as const },
          ...(alternativeHeadline && alternativeHeadline !== approvedHeadline
            ? [{ value: alternativeHeadline, source: 'alternative' as const }]
            : []),
        ]
      : [{ value: report.headline, source: 'alternative' as const }];

    report.locale = 'es';
    const response: GenerateFxDailyResponse = {
      report,
      headline_options: headlineOptions,
      image_prompt: buildFxDailyImagePrompt(report),
    };
    return jsonResponse(response, 200);
  } catch (err) {
    console.error('generate-fx-daily error:', err);
    return jsonResponse({ error: 'internal_error', message: 'Unexpected error' }, 500);
  }
});
