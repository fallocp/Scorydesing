import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { createServerStateHandler } from '../_shared/desaing/serverStateHttp.ts';
import { createSupabaseRepository } from '../_shared/desaing/serverSupabase.ts';

const enabled = Deno.env.get('DESAING_SERVER_ENABLED') === 'true';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = (key: string) => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get(key) ?? '', options);
let service: ReturnType<typeof client> | undefined;
let auth: ReturnType<typeof client> | undefined;
const backend = () => service ??= client('SUPABASE_SERVICE_ROLE_KEY');
const repository = createSupabaseRepository((name, args) => backend().rpc(name, args));

Deno.serve(createServerStateHandler({
  enabled,
  allowedOrigins: (Deno.env.get('DESAING_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  async authenticate(token) {
    auth ??= client('SUPABASE_ANON_KEY');
    const { data, error } = await auth.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  repository,
  generation: {
    enabled: Deno.env.get('DESAING_UI_GENERATION_ENABLED') === 'true',
    executor: (Deno.env.get('DESAING_UI_EXECUTOR') ?? 'image_api') as 'image_api' | 'responses_image',
    // Access is authorized by business membership (owner/admin) and the business policy row; no pilot actor/business pin or expiry.
    expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
    actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '',
    expiresAt: Number.MAX_SAFE_INTEGER,
    maxReferenceEdge: 1024,
    maxBriefBytes: 24000,
    maxReferences: 4,
  },
}));
