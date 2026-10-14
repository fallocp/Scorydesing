import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0?deps=@supabase/storage-js@2.10.4';
import { ImageGenerationInputError } from '../_shared/imageGenerationOptions.ts';
import {
  fetchLearnedPreferences,
  prepareStudioMockup,
  StudioPreparationError,
  validateStudioMockupRequest,
} from '../_shared/studioMockupPrompt.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

/**
 * Compatibility entry point for Studio-specific prompt preparation only.
 * The browser submits the prepared instruction and actual registered reference
 * to desaing-server, which owns admission, jobs, image execution and recovery.
 * There is deliberately no image-provider credential, request or fallback here.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'authentication_required', message: 'Inicia sesión para preparar el diseño.' }, 401);

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) return json({ error: 'service_unavailable' }, 503);

    // Verify the JWT with Auth and retain that user's RLS scope for every read.
    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: identity, error: authError } = await supabase.auth.getUser(token);
    if (authError || !identity.user) return json({ error: 'authentication_required', message: 'La sesión no es válida.' }, 401);

    let value: unknown;
    try { value = await req.json(); }
    catch { return json({ error: 'parse_error', message: 'Invalid request body' }, 400); }
    const validated = validateStudioMockupRequest(value);

    // business_tenants SELECT policy requires auth.uid() to be a member. A
    // supplied business_id is never itself proof of permission to read feedback.
    const { data: business, error: businessError } = await supabase
      .from('business_tenants').select('id').eq('id', validated.body.business_id)
      .eq('is_active', true).maybeSingle();
    if (businessError) return json({ error: 'business_access_unavailable', message: 'No se pudo verificar el acceso a la marca.' }, 503);
    if (!business) return json({ error: 'business_access_denied', message: 'No tienes acceso a esta marca.' }, 403);

    const preferences = await fetchLearnedPreferences({
      async read(businessId, type, limit, background) {
        let query = supabase.from('design_feedback').select('interpreted_changes')
          .eq('business_id', businessId).eq('feedback_type', type);
        if (background) query = query.eq('selections->>background', background);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
        if (error) throw new Error('Feedback preferences unavailable');
        return data ?? [];
      },
    }, validated.body.business_id, validated.body.selections?.background);

    return json({ prepared: prepareStudioMockup(validated, preferences, Math.floor(Math.random() * 3)) });
  } catch (error) {
    if (error instanceof StudioPreparationError) {
      return json({ error: error.code, message: error.message }, error.status);
    }
    if (error instanceof ImageGenerationInputError) {
      return json({ error: 'parse_error', message: error.message }, 400);
    }
    return json({ error: 'server_error', message: 'No se pudo preparar el diseño.' }, 500);
  }
});
