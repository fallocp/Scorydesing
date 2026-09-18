import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { createServerHandler } from '../_shared/desaing/serverHttp.ts';
import { createPrivateStorage, createSupabaseRepository } from '../_shared/desaing/serverSupabase.ts';
import { createServerGeneration } from '../_shared/desaing/serverGeneration.ts';
import { createLiveImageProvider } from '../_shared/desaing/liveImageProvider.ts';
import { PILOT_LIMITS } from '../_shared/desaing/pilotHttp.ts';
import { ServerBoundaryError } from '../_shared/desaing/serverRepository.ts';
import { createServerExploration } from '../_shared/desaing/serverExploration.ts';
import { createSupabaseExplorationRepository } from '../_shared/desaing/explorationRepository.ts';
import { createExplorationProvider } from '../_shared/desaing/explorationProvider.ts';
import { createServerHtml } from '../_shared/desaing/serverHtml.ts';
import { createSupabaseHtmlRepository } from '../_shared/desaing/htmlRepository.ts';
import { createCompositionProvider } from '../_shared/desaing/compositionProvider.ts';
import { createServerMaterials } from '../_shared/desaing/serverMaterials.ts';
import { createSupabaseMaterialsRepository } from '../_shared/desaing/materialsRepository.ts';
import { createMaterialsProvider } from '../_shared/desaing/materialsProvider.ts';
import { createServerOnboarding } from '../_shared/desaing/serverOnboarding.ts';
import { createSupabaseOnboardingRepository } from '../_shared/desaing/onboardingRepository.ts';
import { createServerProduction } from '../_shared/desaing/serverProduction.ts';
import { createSupabaseProductionRepository } from '../_shared/desaing/productionRepository.ts';
import { createSupabasePromptAdminRepository } from '../_shared/desaing/promptAdminRepository.ts';
import { createServerPromptAdmin } from '../_shared/desaing/serverPromptAdmin.ts';

// JWT-authenticated application boundary. New paid work additionally needs the
// separate server-only UI gate, exact owner/project/policy pins and unspent quota.
const enabled = Deno.env.get('DESAING_SERVER_ENABLED') === 'true';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = (key: string) => createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get(key) ?? '', options);
let service: ReturnType<typeof client> | undefined;
let auth: ReturnType<typeof client> | undefined;
const backend = () => service ??= client('SUPABASE_SERVICE_ROLE_KEY');
const bucket = () => backend().storage.from('desaing-assets');
const repository = createSupabaseRepository((name, args) => backend().rpc(name, args));
const storage = createPrivateStorage({
  upload: (key, bytes, uploadOptions) => bucket().upload(key, bytes, uploadOptions),
  download: key => bucket().download(key),
  createSignedUrl: (key, expiresIn) => bucket().createSignedUrl(key, expiresIn),
});
const generation = createServerGeneration({
  enabled: Deno.env.get('DESAING_UI_GENERATION_ENABLED') === 'true',
  executor: (Deno.env.get('DESAING_UI_EXECUTOR') ?? 'image_api') as 'image_api' | 'responses_image',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '',
  actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '',
  expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '',
  expiresAt: Number(Deno.env.get('DESAING_UI_EXPIRES_AT_MS') ?? ''),
}, {
  repository,
  validateProduction: operation => production.validateOperation(operation.context.actor_id, operation),
  validatePromptAdmin: operation => promptAdmin.validateOperation(operation.context.actor_id, operation),
  storage: { ...storage, async get(key) {
    const { data, error } = await bucket().download(key);
    if (error || !data || data.size > 8388608) throw new ServerBoundaryError('asset_storage_unavailable', 503);
    return new Uint8Array(await data.arrayBuffer());
  } },
  createProvider: () => createLiveImageProvider({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    responsesModel: PILOT_LIMITS.responsesModel, responsesMaxOutputTokens: PILOT_LIMITS.responsesMaxOutputTokens }),
});

const exploration = createServerExploration({
  enabled: Deno.env.get('DESAING_EXPLORATION_ENABLED') === 'true',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '',
  actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '',
  expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '',
  expiresAt: Number(Deno.env.get('DESAING_EXPLORATION_EXPIRES_AT_MS') ?? ''),
}, {
  repository,
  explorationRepository: createSupabaseExplorationRepository((name, args) => backend().rpc(name, args)),
  createProvider: () => createExplorationProvider({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '',
    model: 'gpt-5.4-mini', maxOutputTokens: 4096, fetch }),
});

const html = createServerHtml({
  enabled: Deno.env.get('DESAING_EXPLORATION_ENABLED') === 'true',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '', actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '', expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '', expiresAt: Number(Deno.env.get('DESAING_EXPLORATION_EXPIRES_AT_MS') ?? ''),
}, {
  repository, htmlRepository: createSupabaseHtmlRepository((name, args) => backend().rpc(name, args)),
  storage: { ...storage, async get(key) {
    const { data, error } = await bucket().download(key);
    if (error || !data || data.size > 8388608) throw new ServerBoundaryError('asset_storage_unavailable', 503);
    return new Uint8Array(await data.arrayBuffer());
  } },
  createProvider: () => createCompositionProvider({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '', model: 'gpt-5.4-mini', fetch }),
});

const materialsBucket = () => backend().storage.from('desaing-materials');
const materialBytes = async (key: string) => {
  const { data, error } = await materialsBucket().download(key);
  if (error || !data || data.size > 8388608) throw new ServerBoundaryError('materials_storage_unavailable', 503);
  return new Uint8Array(await data.arrayBuffer());
};
const materials = createServerMaterials({
  enabled: Deno.env.get('DESAING_EXPLORATION_ENABLED') === 'true',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '', actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '', expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '', expiresAt: Number(Deno.env.get('DESAING_EXPLORATION_EXPIRES_AT_MS') ?? ''),
}, {
  repository, materialsRepository: createSupabaseMaterialsRepository((name, args) => backend().rpc(name, args)),
  storage: {
    get: materialBytes,
    async putImmutable(key, bytes, mime) {
      const { error } = await materialsBucket().upload(key, bytes, { contentType: mime, upsert: false });
      if (!error) return;
      if (String(error.statusCode) !== '409' && (error as unknown as { error?: string }).error !== 'Duplicate') throw new ServerBoundaryError('materials_storage_unavailable', 503);
      const existing = await materialBytes(key);
      if (existing.length !== bytes.length || !existing.every((value, index) => value === bytes[index])) throw new ServerBoundaryError('materials_version_conflict', 409);
    },
    async signedUrl(key, expiresIn) {
      const { data, error } = await materialsBucket().createSignedUrl(key, expiresIn);
      if (error || !data?.signedUrl) throw new ServerBoundaryError('materials_storage_unavailable', 503); return data.signedUrl;
    },
  },
  createProvider: () => createMaterialsProvider({ apiKey: Deno.env.get('OPENAI_API_KEY') ?? '', model: 'gpt-5.4-mini', fetch }),
});

const onboarding = createServerOnboarding({
  enabled,
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '', actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '', expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '', expiresAt: Number(Deno.env.get('DESAING_EXPLORATION_EXPIRES_AT_MS') ?? ''),
}, { repository, onboardingRepository: createSupabaseOnboardingRepository((name, args) => backend().rpc(name, args)),
  materialsRepository: createSupabaseMaterialsRepository((name, args) => backend().rpc(name, args)) });

const legacyBucket = () => backend().storage.from('design-images');
const legacyBytes = async (key: string) => {
  const { data, error } = await legacyBucket().download(key);
  if (error || !data || data.size > 8388608) throw new ServerBoundaryError('production_storage_unavailable', 503);
  return new Uint8Array(await data.arrayBuffer());
};
const production = createServerProduction({
  enabled, businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '', actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '', expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '', expiresAt: Number(Deno.env.get('DESAING_EXPLORATION_EXPIRES_AT_MS') ?? ''),
}, { repository, productionRepository: createSupabaseProductionRepository((name, args) => backend().rpc(name, args)),
  privateStorage: { ...storage, async get(key) { const { data, error } = await bucket().download(key);
    if (error || !data || data.size > 8388608) throw new ServerBoundaryError('production_storage_unavailable', 503);
    return new Uint8Array(await data.arrayBuffer()); } },
  legacyStorage: { get: legacyBytes, publicUrl: key => legacyBucket().getPublicUrl(key).data.publicUrl,
    async putImmutable(key, bytes) { const { error } = await legacyBucket().upload(key, bytes, { contentType: 'image/png', upsert: false });
      if (!error) return;
      if (String(error.statusCode) !== '409' && (error as unknown as { error?: string }).error !== 'Duplicate') throw new ServerBoundaryError('production_storage_unavailable', 503);
      const existing = await legacyBytes(key); if (existing.length !== bytes.length || !existing.every((value, index) => value === bytes[index])) throw new ServerBoundaryError('production_apply_conflict', 409);
    } },
});

const promptAdmin = createServerPromptAdmin({
  enabled: enabled && Deno.env.get('DESAING_PROMPT_ADMIN_ENABLED') === 'true',
  businessId: Deno.env.get('DESAING_PILOT_BUSINESS_ID') ?? '', actorId: Deno.env.get('DESAING_PILOT_ACTOR_ID') ?? '',
  policyId: Deno.env.get('DESAING_PILOT_POLICY_ID') ?? '', expectedSupabaseOrigin: Deno.env.get('DESAING_PILOT_SUPABASE_ORIGIN') ?? '',
  actualSupabaseOrigin: Deno.env.get('SUPABASE_URL') ?? '', expiresAt: Number(Deno.env.get('DESAING_UI_EXPIRES_AT_MS') ?? ''),
}, { repository, promptAdminRepository: createSupabasePromptAdminRepository((name, args) => backend().rpc(name, args)) });

Deno.serve(createServerHandler({
  enabled,
  allowedOrigins: (Deno.env.get('DESAING_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  async authenticate(token) {
    auth ??= client('SUPABASE_ANON_KEY');
    // getUser verifies the token against Auth; never trust decoded browser claims.
    const { data, error } = await auth.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  repository, storage, generation, exploration, html, materials, onboarding, production, promptAdmin,
}));
