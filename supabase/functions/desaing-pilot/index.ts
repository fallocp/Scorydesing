import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0?deps=@supabase/storage-js@2.10.4';
import { checkPilotModels, createPilotHandler, PILOT_LIMITS } from '../_shared/desaing/pilotHttp.ts';
import { createPrivateStorage, createSupabaseRepository } from '../_shared/desaing/serverSupabase.ts';
import { createLiveImageProvider } from '../_shared/desaing/liveImageProvider.ts';
import { ServerBoundaryError } from '../_shared/desaing/serverRepository.ts';

// Dedicated administrative deployment. verify_jwt=false is required because the
// handler verifies an exact server-only pilot token; ordinary browser JWTs are refused.
// Environment defaults never enable paid execution or infer an approved target.
const supabaseOrigin = Deno.env.get('SUPABASE_URL') ?? '';
let backend: ReturnType<typeof createClient> | undefined;
const service = () => backend ??= createClient(supabaseOrigin, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const bucket = () => service().storage.from('desaing-assets');
const storage = createPrivateStorage({
  upload: (key, bytes, options) => bucket().upload(key, bytes, options),
  download: key => bucket().download(key),
  createSignedUrl: (key, expiresIn) => bucket().createSignedUrl(key, expiresIn),
});

Deno.serve(createPilotHandler({
  enabled: Deno.env.get('DESAING_PILOT_ENABLED') === 'true',
  token: Deno.env.get('DESAING_PILOT_TOKEN') ?? '',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '',
  actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '',
  expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: supabaseOrigin,
  expiresAt: Number(Deno.env.get('DESAING_PILOT_EXPIRES_AT_MS') ?? ''),
}, {
  repository: createSupabaseRepository((name, args) => service().rpc(name, args)),
  storage: { ...storage, async get(key) {
    const { data, error } = await bucket().download(key);
    if (error || !data || data.size > 8388608) throw new ServerBoundaryError('asset_storage_unavailable', 503);
    return new Uint8Array(await data.arrayBuffer());
  } },
  createProvider: () => createLiveImageProvider({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    responsesModel: PILOT_LIMITS.responsesModel, responsesMaxOutputTokens: PILOT_LIMITS.responsesMaxOutputTokens }),
  checkModels: () => checkPilotModels(Deno.env.get('OPENAI_API_KEY') ?? ''),
}));
