import type { Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createServerHandler } from '../../supabase/functions/_shared/desaing/serverHttp';
import { createSupabaseRepository } from '../../supabase/functions/_shared/desaing/serverSupabase';
import { runSimulatedServerCall } from '../../supabase/functions/_shared/desaing/serverWorker';
import { executeServerCommand } from '../../supabase/functions/_shared/desaing/serverRepository';
import { importServerAsset } from '../../supabase/functions/_shared/desaing/serverStorage';
import type { AssetVersion, DesignOperation, DesignTarget } from '../../supabase/functions/_shared/desaing/contracts';
import { TEST_BUSINESS_ID, TEST_OTHER_BUSINESS_ID } from './fixture';
import { simulatedPiece } from './simulatedPiece';
import { createServerGeneration } from '../../supabase/functions/_shared/desaing/serverGeneration';
import { createLiveImageProvider } from '../../supabase/functions/_shared/desaing/liveImageProvider';
import type { ExplorationRequest, ExplorationResult } from '../../supabase/functions/_shared/desaing/explorationContracts';
import { explorationFixture } from './explorationFixture';
import { createSupabaseExplorationRepository } from '../../supabase/functions/_shared/desaing/explorationRepository';
import { createServerExploration } from '../../supabase/functions/_shared/desaing/serverExploration';
import { createExplorationProvider } from '../../supabase/functions/_shared/desaing/explorationProvider';
import { createSupabaseHtmlRepository } from '../../supabase/functions/_shared/desaing/htmlRepository';
import { createServerHtml } from '../../supabase/functions/_shared/desaing/serverHtml';
import { createCompositionProvider } from '../../supabase/functions/_shared/desaing/compositionProvider';
import { compositionFixture } from './compositionFixture';
import { createSupabaseMaterialsRepository } from '../../supabase/functions/_shared/desaing/materialsRepository';
import { createServerMaterials } from '../../supabase/functions/_shared/desaing/serverMaterials';
import { createMaterialsProvider } from '../../supabase/functions/_shared/desaing/materialsProvider';
import { inspectMaterialBytes } from '../../supabase/functions/_shared/desaing/materialBytes';
import { materialHash, type MaterialFinding, type MaterialIdentity, type MaterialMime } from '../../supabase/functions/_shared/desaing/materials';
import { materialsPdfFixture } from './materialsFixture';
import { createSupabaseOnboardingRepository } from '../../supabase/functions/_shared/desaing/onboardingRepository';
import { createServerOnboarding } from '../../supabase/functions/_shared/desaing/serverOnboarding';
import { createSupabaseProductionRepository } from '../../supabase/functions/_shared/desaing/productionRepository';
import { createServerProduction } from '../../supabase/functions/_shared/desaing/serverProduction';
import { PRODUCTION_SCHEMA, PRODUCTION_FIXTURE_ORIGIN, seedProductionFixture } from './productionFixture';
import { createSupabasePromptAdminRepository } from '../../supabase/functions/_shared/desaing/promptAdminRepository';
import { createServerPromptAdmin } from '../../supabase/functions/_shared/desaing/serverPromptAdmin';
import { PROMPT_ADMIN_SCHEMA, seedPromptAdminEvidence } from './promptAdminFixture';

const ACTOR = 'c402a035-1ae3-42b8-ad5d-604dc03ba7cc';
const ROOT = '/functions/v1/desaing-server';

/** Dev/test entry only. Binds loopback; no env, credentials or production SDK. */
export function presentationServerPlugin(options: { generation?: boolean; exploration?: boolean; durableExploration?: boolean; proposals?: boolean; composition?: boolean; workspace?: boolean; materials?: boolean; onboarding?: boolean; production?: boolean; promptAdmin?: boolean } = {}): Plugin {
  const promptAdminTest = options.promptAdmin === true;
  const productionTest = options.production === true;
  const onboardingTest = options.onboarding === true;
  const materialsTest = options.materials === true || onboardingTest;
  const proposalsTest = options.proposals === true;
  const workspaceTest = options.workspace === true || materialsTest || productionTest || promptAdminTest;
  const compositionTest = options.composition === true || workspaceTest;
  const durableExploration = options.durableExploration === true || compositionTest;
  const explorationTest = options.exploration === true || durableExploration || proposalsTest;
  const generationTest = !proposalsTest && (options.generation === true || explorationTest);
  const ORIGIN = `http://127.0.0.1:${promptAdminTest ? 3022 : productionTest ? 3021 : onboardingTest ? 3020 : materialsTest ? 3019 : workspaceTest ? 3018 : compositionTest ? 3017 : proposalsTest ? 3016 : durableExploration ? 3015 : explorationTest ? 3014 : generationTest ? 3013 : 3012}`;
  return { name: 'desaing-presentation-local-server', async configureServer(server) {
    const db = new PGlite();
    await db.exec(await readFile('supabase/tests/desaing-bootstrap.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202609170001_desaing_server_foundation.sql', 'utf8'));
    if (durableExploration) await db.exec(await readFile('supabase/migrations/202609170002_desaing_exploration_journal.sql', 'utf8'));
    if (materialsTest) await db.exec(await readFile('supabase/migrations/202609180003_desaing_materials.sql', 'utf8'));
    if (onboardingTest) {
      await db.exec(`ALTER TABLE public.business_tenants ADD COLUMN IF NOT EXISTS primary_color text, ADD COLUMN IF NOT EXISTS secondary_color text,
        ADD COLUMN IF NOT EXISTS accent_color text, ADD COLUMN IF NOT EXISTS fonts jsonb, ADD COLUMN IF NOT EXISTS compliance jsonb,
        ADD COLUMN IF NOT EXISTS master_prompt text, ADD COLUMN IF NOT EXISTS legal_text text, ADD COLUMN IF NOT EXISTS logo_url text`);
      await db.exec(await readFile('supabase/migrations/202609180004_desaing_onboarding.sql', 'utf8'));
    }
    if (productionTest) { await db.exec(PRODUCTION_SCHEMA); await db.exec(await readFile('supabase/migrations/202609180005_desaing_production.sql','utf8')); }
    if (promptAdminTest) { await db.exec(PROMPT_ADMIN_SCHEMA); await db.exec(await readFile('supabase/migrations/202609180006_desaing_prompt_admin.sql','utf8')); }
    await db.query('INSERT INTO auth.users(id) VALUES($1)', [ACTOR]);
    await db.query("INSERT INTO public.business_tenants(id,slug) VALUES($1,'test-design'),($2,'other-design')", [TEST_BUSINESS_ID, TEST_OTHER_BUSINESS_ID]);
    if (onboardingTest) await db.query(`UPDATE public.business_tenants SET name='Marca local inicial', primary_color='#314B52', secondary_color='#DEE7DF',
      accent_color='#BD9D61', fonts='{"display":"Arial","body":"Arial","mono":"monospace"}', compliance='{"original":"keep-compliance"}',
      master_prompt='keep-master-prompt-exact', legal_text='keep-legal-copy-exact', logo_url='keep-private-logo-key' WHERE id=$1`, [TEST_BUSINESS_ID]);
    await db.query('INSERT INTO public.user_business_memberships(user_id,business_id,role) VALUES($1,$2,$3)',
      [ACTOR, TEST_BUSINESS_ID, generationTest ? 'owner' : 'editor']);
    if(promptAdminTest) {
      await db.query(`INSERT INTO public.master_prompts(business_id,prompt_type,prompt_text,version) VALUES($1,'general',$2,1),($1,'image_style:editorial',$3,1)`,
        [TEST_BUSINESS_ID,'Conserva el texto aprobado. Usa composición editorial limpia.','Maestro de estilo independiente, sin cambiar.']);
      await db.query('INSERT INTO public.desaing_prompt_admin_scopes(business_id) VALUES($1)',[TEST_BUSINESS_ID]);
      await db.query("INSERT INTO public.desaing_prompt_admin_grants(business_id,actor_id,capability) VALUES($1,$2,'prompt_master.manage')",[TEST_BUSINESS_ID,ACTOR]);
    }
    await db.query(`INSERT INTO public.desaing_policies(business_id,enabled,policy_id,limit_micro_usd,max_image_outputs,reservation_per_output_micro_usd,enabled_image_profiles,responses_image_enabled)
      VALUES($1,true,$2,$3,$4,$5,$6::text[],$7)`, [TEST_BUSINESS_ID, generationTest ? 'local-generation-pilot' : 'local-simulation',
      generationTest ? 5000000 : 10000, generationTest ? 4 : 20, generationTest ? 1000000 : 100,
      [generationTest ? 'flare_candidate' : 'baseline'], generationTest]);
    const legacyObjects=new Map<string,Uint8Array>();
    const productionFixture=productionTest?await seedProductionFixture(db,TEST_BUSINESS_ID,ACTOR,legacyObjects):null;
    await db.exec('SET ROLE service_role');
    const metrics = { simulated_dispatches: 0, real_provider_calls: 0, references_read: 0, worker_errors: [] as string[],
      adapter_requests: [] as Array<{ route: string; model: string; quality: string; input_images: number; input_dimensions: Array<{ width: number; height: number }>; input_hashes?:string[]; max_tool_calls?: number; max_output_tokens?: number }>,
      planner_requests: [] as Array<{ request_key: string; kind: string; model: string; image_tools: number; output_tokens_limit: number }>, planner_recoveries: 0,
      html_requests: [] as Array<{ request_key: string; model: string; copy: unknown; dimensions: { width: number; height: number }; image_tools: number }>, html_recoveries: 0,
      material_counts: [] as Array<{ request_key: string; source_hashes: string[]; input_tokens: number }>,
      material_requests: [] as Array<{ request_key: string; sources: Array<MaterialIdentity & { mime_type: string; size_bytes: number; page_count: number | null }>; tools: number }>,
      material_recoveries: 0, material_uploads: 0, onboarding_saves: 0, onboarding_recoveries: 0,
      onboarding_publication_requests: [] as Array<{ publish_id: string; draft_id: string; expected_revision: number; status: number }>,
      production_prepares:0,production_recovers:0,production_applies:[] as Array<{apply_id:string;snapshot_id:string;status:number}>,
      prompt_admin_mutations:[] as Array<{kind:string;request_id:string;status:number}>,prompt_admin_recoveries:0 };
    const objects = new Map<string, Uint8Array>(), tokens = new Map<string, { key: string; until: number }>();
    const objectMimes = new Map<string, string>();
    let pause = false, loseNextEnqueue = false, loseNextUpload = false, failNextProvider = false;
    let failDispatchNumber: number | null = null;
    let executor: 'image_api' | 'responses_image' = 'image_api';
    let capabilities: 'normal' | 'missing' | 'malformed' = 'normal';
    let loseNextExploration = false;
    let textEnabled = true;
    let failNextText = false;
    let loseNextHtml = false;
    let loseNextMaterial = false, loseNextMaterialUpload = false, materialInputLimit = false, failNextMaterial = false;
    let loseNextOnboardingPublication = false;
    let loseNextProductionApply=false;
    let loseNextPromptPublication=false;
    const planning = new Map<string, { request: string; result: ExplorationResult | null; work: Promise<ExplorationResult> }>();
    const proposalVariants = new Map<string, number>();
    let coverFixture: { low: AssetVersion; medium: AssetVersion; rejectedCandidate: AssetVersion;
      low_operation_key: string; medium_operation_key: string; rejected_operation_key: string; target: DesignTarget } | null = null;
    const repository = createSupabaseRepository(async (name, args) => {
      try {
        const result = name === 'desaing_read_state'
          ? await db.query<{ result: unknown }>('SELECT public.desaing_read_state($1::uuid,$2::uuid) AS result', [args.p_business_id, args.p_actor_id])
          : name === 'desaing_commit_state'
            ? await db.query<{ result: unknown }>('SELECT public.desaing_commit_state($1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5::text,$6::text) AS result',
              [args.p_business_id, args.p_actor_id, args.p_expected_revision, JSON.stringify(args.p_snapshot), args.p_event, args.p_operation_key])
            : null;
        if (!result) throw new Error('Unknown test RPC');
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'database_unavailable' } }; }
    });
    const journalRpc = async (name: string, args: Record<string, unknown>) => {
      const allowed = ['desaing_exploration_budget', 'desaing_read_exploration', 'desaing_list_explorations',
        'desaing_claim_exploration', 'desaing_finish_exploration', ...(materialsTest ? ['desaing_read_materials', 'desaing_commit_materials'] : []),
        ...(onboardingTest ? ['desaing_read_onboarding', 'desaing_save_onboarding', 'desaing_recover_onboarding', 'desaing_publish_onboarding'] : []),
        ...(productionTest?['desaing_inspect_production','desaing_snapshot_production','desaing_prepare_production','desaing_read_production','desaing_recover_production','desaing_apply_production']:[]),
        ...(promptAdminTest?['desaing_prompt_admin_capabilities','desaing_prompt_admin_read','desaing_prompt_admin_item','desaing_prompt_admin_mutate']:[])];
      if (!durableExploration || !allowed.includes(name) || Object.keys(args).some(key => !/^p_[a-z_]+$/.test(key))) throw new Error('invalid_test_rpc');
      try {
        const bindings = Object.keys(args).map((key, index) => `${key} => $${index + 1}`).join(',');
        const values = Object.values(args).map(value => value !== null && typeof value === 'object' ? JSON.stringify(value) : value);
        const result = await db.query<{ result: unknown }>(`SELECT public.${name}(${bindings}) AS result`, values);
        return { data: result.rows[0].result, error: null };
      } catch (error) { return { data: null, error: { message: error instanceof Error ? error.message : 'database_unavailable' } }; }
    };
    const explorationRepository = createSupabaseExplorationRepository(journalRpc);
    const htmlRepository = createSupabaseHtmlRepository(journalRpc);
    const materialsRepository = createSupabaseMaterialsRepository(journalRpc);
    const onboardingRepository = createSupabaseOnboardingRepository(journalRpc);
    const productionRepository=createSupabaseProductionRepository(journalRpc);
    const promptAdminRepository=createSupabasePromptAdminRepository(journalRpc);
    if(promptAdminTest)await seedPromptAdminEvidence(repository,objects,TEST_BUSINESS_ID,ACTOR);
    const promptAdminBoundary=promptAdminTest?createServerPromptAdmin({enabled:true,businessId:TEST_BUSINESS_ID,actorId:ACTOR,policyId:'local-generation-pilot',
      expectedSupabaseOrigin:'https://local-generation.invalid',actualSupabaseOrigin:'https://local-generation.invalid',expiresAt:Date.now()+3600000},
      {repository,promptAdminRepository}):undefined;
    const makeExploration = () => createServerExploration({ enabled: textEnabled, businessId: TEST_BUSINESS_ID,
      actorId: ACTOR, policyId: 'local-generation-pilot', expectedSupabaseOrigin: 'https://local-generation.invalid',
      actualSupabaseOrigin: 'https://local-generation.invalid', expiresAt: Date.now() + 3600000 }, {
      repository, explorationRepository, createProvider: () => createExplorationProvider({ apiKey: 'sk-local-text-fixture-never-valid',
        model: 'gpt-5.4-mini', maxOutputTokens: 4096, fetch: async (url, init) => {
          if (String(url) !== 'https://api.openai.com/v1/responses' || init?.method !== 'POST') throw new Error('unexpected_fake_planner_request');
          const body = JSON.parse(String(init.body)), input = JSON.parse(body.input[1].content[0].text) as ExplorationRequest;
          const requestKey = new Headers(init.headers).get('X-Client-Request-Id')!;
          if (body.model !== 'gpt-5.4-mini' || body.store !== false || body.service_tier !== 'default' || body.tools.length !== 0) throw new Error('unexpected_planner_settings');
          metrics.planner_requests.push({ request_key: requestKey, kind: input.kind, model: body.model,
            image_tools: 0, output_tokens_limit: body.max_output_tokens });
          if (failNextText) { failNextText = false; throw new Error('simulated_text_timeout'); }
          return new Response(JSON.stringify({ id: `resp_durable_plan_${metrics.planner_requests.length}`, status: 'completed',
            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(explorationFixture(input)) }] }],
            usage: { input_tokens: 250, output_tokens: 850, total_tokens: 1100 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } }),
    });
    const putImmutable = async (key: string, bytes: Uint8Array) => {
      const previous = objects.get(key);
      if (previous && (previous.length !== bytes.length || previous.some((v, i) => v !== bytes[i]))) throw new Error('immutable_object_conflict');
      objects.set(key, bytes.slice());
    };
    const storage = { putImmutable, async signedUrl(key: string, expiresIn: number) {
        if (!objects.has(key)) throw new Error('missing_private_asset');
        const token = crypto.randomUUID(); tokens.set(token, { key, until: Date.now() + expiresIn * 1000 });
        return `${productionTest?PRODUCTION_FIXTURE_ORIGIN:ORIGIN}/__desaing-assets/${token}`;
      } };
    const workerStorage = { ...storage, async get(key: string) {
      const bytes = objects.get(key); if (!bytes) throw new Error('missing_private_asset');
      metrics.references_read++; return bytes.slice();
    } };
    const productionBoundary=productionTest?createServerProduction({enabled:true,businessId:TEST_BUSINESS_ID,actorId:ACTOR,policyId:'local-generation-pilot',
      expectedSupabaseOrigin:PRODUCTION_FIXTURE_ORIGIN,actualSupabaseOrigin:PRODUCTION_FIXTURE_ORIGIN,expiresAt:Date.now()+3600000},
      {repository,productionRepository,privateStorage:workerStorage,legacyStorage:{async get(key){const bytes=legacyObjects.get(key);if(!bytes)throw Error('legacy_missing');return bytes.slice();},
        async putImmutable(key,bytes){const old=legacyObjects.get(key);if(old&&(old.length!==bytes.length||old.some((value,index)=>value!==bytes[index])))throw Error('legacy_conflict');legacyObjects.set(key,bytes.slice());},
        publicUrl:key=>`${PRODUCTION_FIXTURE_ORIGIN}/storage/v1/object/public/design-images/${key}`}}):undefined;
    const makeMaterials = () => createServerMaterials({ enabled: textEnabled, businessId: TEST_BUSINESS_ID, actorId: ACTOR,
      policyId: 'local-generation-pilot', expectedSupabaseOrigin: 'https://local-generation.invalid',
      actualSupabaseOrigin: 'https://local-generation.invalid', expiresAt: Date.now() + 3600000 }, {
      repository, materialsRepository, storage: { ...workerStorage, async putImmutable(key, bytes, mime) { await putImmutable(key, bytes); objectMimes.set(key, mime); } },
      createProvider: () => createMaterialsProvider({ apiKey: 'sk-local-materials-fixture-never-valid', model: 'gpt-5.4-mini', fetch: async (url, init) => {
        const count = String(url) === 'https://api.openai.com/v1/responses/input_tokens';
        if ((!count && String(url) !== 'https://api.openai.com/v1/responses') || init?.method !== 'POST') throw new Error('unexpected_materials_provider_request');
        const body = JSON.parse(String(init.body)), content = body.input?.[1]?.content;
        if (body.model !== 'gpt-5.4-mini' || body.tools?.length !== 0 || body.tool_choice !== 'none' || body.text?.format?.type !== 'json_schema'
          || !Array.isArray(content) || (!count && (body.store !== false || body.stream !== false || body.background !== false))) throw new Error('unexpected_materials_settings');
        const payload = JSON.parse(content[0].text), sources: Array<MaterialIdentity & { mime_type: MaterialMime; size_bytes: number; page_count: number | null }> = [];
        const texts = new Map<string, string>();
        for (const [index, source] of payload.sources.entries()) {
          const marker = JSON.parse(content[1 + index * 2].text), item = content[2 + index * 2];
          if (marker.material_id !== source.material_id || marker.version_id !== source.version_id) throw new Error('materials_identity_not_attached');
          let bytes: Uint8Array;
          if (source.mime_type === 'application/pdf') {
            if (item.type !== 'input_file' || !/^source-\d+\.pdf$/.test(item.filename) || !item.file_data.startsWith('data:application/pdf;base64,')) throw new Error('expected_material_pdf_bytes');
            bytes = new Uint8Array(Buffer.from(item.file_data.split(',')[1], 'base64'));
          } else if (source.mime_type === 'image/png') {
            if (item.type !== 'input_image' || !item.image_url.startsWith('data:image/png;base64,')) throw new Error('expected_material_image_bytes');
            bytes = new Uint8Array(Buffer.from(item.image_url.split(',')[1], 'base64'));
          } else {
            if (item.type !== 'input_text') throw new Error('expected_material_text');
            bytes = new TextEncoder().encode(item.text); texts.set(source.material_id, item.text);
          }
          const metadata = await inspectMaterialBytes(bytes, source.mime_type);
          if (await materialHash(bytes) !== source.version_id || metadata.page_count !== source.page_count
            || ![...objects.entries()].some(([key, stored]) => key.includes(`/${source.material_id}/${source.version_id}.`)
              && stored.length === bytes.length && stored.every((byte, position) => byte === bytes[position]))) throw new Error('material_bytes_not_from_registered_source');
          sources.push({ material_id: source.material_id, version_id: source.version_id, mime_type: source.mime_type, size_bytes: bytes.length, page_count: metadata.page_count });
        }
        const requestKey = new Headers(init.headers).get('X-Client-Request-Id')!;
        if (count) {
          const inputTokens = materialInputLimit ? 80001 : 1400;
          metrics.material_counts.push({ request_key: requestKey, source_hashes: sources.map(s => s.version_id), input_tokens: inputTokens });
          return new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: inputTokens }), { headers: { 'Content-Type': 'application/json' } });
        }
        metrics.material_requests.push({ request_key: requestKey, sources, tools: body.tools.length });
        if (failNextMaterial) { failNextMaterial = false; throw new Error('simulated_materials_response_unknown'); }
        const findings: MaterialFinding[] = [], pdf = sources.find(s => s.mime_type === 'application/pdf'), textSource = sources.find(s => s.mime_type.startsWith('text/'));
        const evidence = (source: MaterialIdentity, page: number | null, quote: string | null, observation: string) => ({ material_id: source.material_id, version_id: source.version_id, page, quote, observation });
        if (pdf) {
          findings.push({ id: 'primary_color', category: 'color', value: '#145E62', certainty: 'explicit', evidence: [evidence(pdf, 1, 'Color principal #145E62', 'Color declarado en el manual.')] });
          findings.push({ id: 'promise_rule', category: 'legal', value: 'No prometer resultados garantizados.', certainty: 'explicit', evidence: [evidence(pdf, 2, 'No prometer resultados garantizados.', 'Regla escrita en la segunda página.')] });
        }
        if (textSource) findings.push({ id: 'user_idea', category: 'tone', value: texts.get(textSource.material_id)!.slice(0, 1500), certainty: 'explicit',
          evidence: [evidence(textSource, null, texts.get(textSource.material_id)!.slice(0, 800), 'Idea adjunta por el usuario.')] });
        if (pdf && textSource) findings.push({ id: 'color_conflict', category: 'conflict', value: 'El manual declara verde; la idea adjunta solicita revisar otra paleta.', certainty: 'uncertain',
          evidence: [evidence(pdf, 1, 'Color principal #145E62', 'Paleta del manual.'), evidence(textSource, null, texts.get(textSource.material_id)!.slice(0, 800), 'Preferencia nueva pendiente de confirmar.')] });
        findings.push({ id: 'audience_pending', category: 'pending', value: 'Confirmar la audiencia y el uso del diseño.', certainty: 'uncertain', evidence: [] });
        return new Response(JSON.stringify({ id: `resp_material_${metrics.material_requests.length}`, status: 'completed',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Materiales recibidos para una ficha corregible.', findings, warnings: ['La ficha requiere revisión del usuario.'] }) }] }],
          usage: { input_tokens: 1400, output_tokens: 600, total_tokens: 2000 } }), { headers: { 'Content-Type': 'application/json' } });
      } }),
    });
    const makeHtml = () => createServerHtml({ enabled: textEnabled, businessId: TEST_BUSINESS_ID, actorId: ACTOR,
      policyId: 'local-generation-pilot', expectedSupabaseOrigin: 'https://local-generation.invalid',
      actualSupabaseOrigin: 'https://local-generation.invalid', expiresAt: Date.now() + 3600000 }, {
      repository, htmlRepository, storage: workerStorage,
      createProvider: () => createCompositionProvider({ apiKey: 'sk-local-html-fixture-never-valid', model: 'gpt-5.4-mini', fetch: async (url, init) => {
        if (String(url) !== 'https://api.openai.com/v1/responses' || init?.method !== 'POST') throw new Error('unexpected_fake_html_request');
        const body = JSON.parse(String(init.body)), payload = JSON.parse(body.input[1].content[0].text);
        if (body.model !== 'gpt-5.4-mini' || body.store !== false || body.tools.length || body.text.format.type !== 'json_schema') throw new Error('unexpected_html_settings');
        const image = body.input[1].content[1];
        if (image.type !== 'input_image' || !image.image_url.startsWith('data:image/png;base64,')) throw new Error('expected_html_pixels');
        const bytes = Buffer.from(image.image_url.split(',')[1], 'base64');
        metrics.html_requests.push({ request_key: new Headers(init.headers).get('X-Client-Request-Id')!, model: body.model,
          copy: payload.approved_copy, dimensions: { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }, image_tools: body.tools.length });
        return new Response(JSON.stringify({ id: `resp_html_${metrics.html_requests.length}`, status: 'completed',
          output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(compositionFixture(payload)) }] }],
          usage: { input_tokens: 700, output_tokens: 800, total_tokens: 1500 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } }),
    });
    // This injected transport never calls global fetch. It checks the real serialized adapter request.
    const providerFetch: typeof fetch = async (url, init) => {
      const route = String(url), allowed = ['https://api.openai.com/v1/images/edits', 'https://api.openai.com/v1/images/generations', 'https://api.openai.com/v1/responses'];
      if (!allowed.includes(route) || init?.method !== 'POST') throw new Error('unexpected_fake_provider_request');
      const dimensions: Array<{ width: number; height: number }> = [];
      const hashes:string[]=[];
      const observe = async (blob: Blob) => {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        dimensions.push({ width: view.getUint32(16), height: view.getUint32(20) });
        if(productionTest)hashes.push(await materialHash(bytes));
      };
      let quality: 'low' | 'medium', model: string, size: string, max_tool_calls: number | undefined, max_output_tokens: number | undefined;
      if (route.endsWith('/images/edits')) {
        if (!(init.body instanceof FormData)) throw new Error('expected_real_multipart');
        model = String(init.body.get('model')); quality = String(init.body.get('quality')) as 'low' | 'medium'; size = String(init.body.get('size'));
        for (const value of [...init.body.getAll('image'), ...init.body.getAll('image[]')]) {
          if (!(value instanceof Blob)) throw new Error('expected_reference_bytes'); await observe(value);
        }
      } else if (route.endsWith('/images/generations')) {
        const body = JSON.parse(String(init.body)); model = body.model; quality = body.quality; size = body.size;
      } else {
        const body = JSON.parse(String(init.body));
        if (body.model !== 'gpt-5.4-mini' || body.store !== false || body.tool_choice?.type !== 'image_generation') throw new Error('unexpected_responses_settings');
        const tool = body.tools?.[0]; model = tool?.model; quality = tool?.quality; size = tool?.size;
        max_tool_calls = body.max_tool_calls; max_output_tokens = body.max_output_tokens;
        for (const item of body.input.flatMap((message: { content: unknown[] }) => message.content)) {
          if (item.type === 'input_image') {
            if (!/^data:image\/png;base64,/.test(item.image_url)) throw new Error('expected_real_reference_data_url');
            await observe(new Blob([Buffer.from(item.image_url.split(',')[1], 'base64')], { type: 'image/png' }));
          }
        }
      }
      if (model !== 'gpt-image-2.5-flare' || !['low', 'medium'].includes(quality) || !dimensions.length && !workspaceTest) throw new Error('unexpected_generation_scope');
      metrics.adapter_requests.push({ route, model, quality, input_images: dimensions.length, input_dimensions: dimensions,
        ...(productionTest?{input_hashes:hashes}:{}),
        ...(max_tool_calls === undefined ? {} : { max_tool_calls, max_output_tokens }) });
      if (!['1024x1024', '1536x864', '1088x1408',...(productionTest?['1024x1280','864x1536','1536x1024','1024x1536']:[])].includes(size)) throw new Error('unexpected_image_size');
      const [width, height] = size.split('x').map(Number);
      const b64 = Buffer.from(simulatedPiece(quality, onboardingTest || productionTest || promptAdminTest ? metrics.adapter_requests.length : 0, { width, height })).toString('base64');
      const usage = { input_tokens: 40, output_tokens: 20, total_tokens: 60, input_tokens_details: { text_tokens: 10, image_tokens: 30 } };
      const response = route.endsWith('/responses')
        ? { id: `resp_local_${metrics.adapter_requests.length}`, status: 'completed', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          output: [{ id: `ig_local_${metrics.adapter_requests.length}`, type: 'image_generation_call', status: 'completed', result: b64, usage }] }
        : { data: [{ b64_json: b64 }], usage };
      return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json',
        'x-request-id': `req_local_generation_${metrics.adapter_requests.length}` } });
    };
    const makeApi = () => createServerHandler({ enabled: true, allowedOrigins: [ORIGIN], repository,
      authenticate: async token => token === 'local-design-session' ? { id: ACTOR } : null, storage,
      ...(durableExploration ? { exploration: makeExploration() } : {}),
      ...(compositionTest ? { html: makeHtml() } : {}),
      ...(materialsTest ? { materials: makeMaterials() } : {}),
      ...(productionBoundary?{production:productionBoundary}:{}),
      ...(promptAdminBoundary?{promptAdmin:promptAdminBoundary}:{}),
      ...(onboardingTest ? { onboarding: createServerOnboarding({ enabled: true, businessId: TEST_BUSINESS_ID, actorId: ACTOR,
        policyId: 'local-generation-pilot', expectedSupabaseOrigin: 'https://local-generation.invalid', actualSupabaseOrigin: 'https://local-generation.invalid',
        expiresAt: Date.now() + 3600000 }, { repository, onboardingRepository, materialsRepository }) } : {}),
      ...(generationTest ? { generation: createServerGeneration({ enabled: true, executor, businessId: TEST_BUSINESS_ID,
        actorId: ACTOR, policyId: 'local-generation-pilot', expectedSupabaseOrigin: 'https://local-generation.invalid',
        actualSupabaseOrigin: 'https://local-generation.invalid', expiresAt: Date.now() + 3600000 }, {
        repository, storage: workerStorage, ...(productionBoundary?{validateProduction:(operation:DesignOperation)=>productionBoundary.validateOperation(operation.context.actor_id,operation)}:{}),
        ...(promptAdminBoundary?{validatePromptAdmin:(operation:DesignOperation)=>promptAdminBoundary.validateOperation(operation.context.actor_id,operation)}:{}), createProvider: () => createLiveImageProvider({ apiKey: 'sk-local-fixture-never-valid',
          responsesModel: 'gpt-5.4-mini', responsesMaxOutputTokens: 2048, fetch: providerFetch }),
      }) } : {}),
    });
    let api = makeApi();
    const running = new Set<string>();
    async function dispatch(operationKey: string) {
      if (generationTest || pause || running.has(operationKey)) return;
      running.add(operationKey);
      try {
        const current = await repository.read(TEST_BUSINESS_ID, ACTOR);
        const job = current.state.snapshot?.jobs.jobs.find(j => j.operation_key === operationKey);
        if (!job || !job.calls.some(call => call.state === 'pending')) return;
        await runSimulatedServerCall({ repository, businessId: TEST_BUSINESS_ID, actorId: ACTOR, operationKey, callKey: job.calls[0].call_key,
          storage: { putImmutable, async get(key) { const bytes = objects.get(key); if (!bytes) throw new Error('missing_private_asset'); metrics.references_read++; return bytes.slice(); } },
          provider: { mode: 'simulation', async generate(input) {
            metrics.simulated_dispatches++;
            if (failNextProvider || metrics.simulated_dispatches === failDispatchNumber) {
              failNextProvider = false; failDispatchNumber = null; throw new Error('simulated_timeout');
            }
            await new Promise(resolve => setTimeout(resolve, 350));
            const instruction = input.job.plan.operation.context.instruction;
            const variant = proposalsTest ? proposalVariants.get(instruction) ?? (proposalVariants.size % 5) + 1 : 0;
            if (proposalsTest) proposalVariants.set(instruction, variant);
            return { bytes: simulatedPiece(input.job.plan.operation.image!.quality === 'medium' ? 'medium' : 'low', variant), mimeType: 'image/png' };
          } },
        });
      } catch (error) { metrics.worker_errors.push(error instanceof Error ? error.message : 'worker_failed'); }
      finally { running.delete(operationKey); }
    }
    /** Build cross-document results through the same SQL transitions and simulated worker.
     * This loopback-only fixture never calls a provider or changes the real cloud project. */
    async function seedCoverResults() {
      if (coverFixture) return;
      if (pause || running.size) throw new Error('fixture_requires_idle_worker');
      const projectId = 'external-cover-document';
      const imported = await importServerAsset(repository, storage, ACTOR, {
        businessId: TEST_BUSINESS_ID, uploadId: 'test-external-cover-capture', brandId: 'presentation', projectId,
      }, simulatedPiece());
      const current = await repository.read(TEST_BUSINESS_ID, ACTOR);
      const reference = current.state.snapshot!.assets.versions.find(version => version.identity.asset_id === 'test-external-cover-capture')!;
      if (!imported || !reference) throw new Error('fixture_capture_missing');
      const target: DesignTarget = { document_type: 'cover', document_id: projectId, slide_id: 'external-cover-canvas', revision: '7' };
      const low: DesignOperation = {
        operation_key: 'test-external-cover-low', action: 'generate_image', context: {
          actor_id: ACTOR, business_id: TEST_BUSINESS_ID, brand_id: 'presentation', project_id: projectId,
          session_id: 'test-external-cover-session', workspace: 'free_design', interaction_mode: 'execute_change', target,
          instruction: 'Un avión para la portada externa de prueba; mantener los textos editables.',
          immutable_elements: ['Conservar el texto y la estructura HTML de la portada.'],
          references: [{ ...reference.identity, reference_id: 'external-cover-reference', mime_type: 'image/png', roles: ['target_render', 'placement_context'] }],
          placement: { capture_reference_id: 'external-cover-reference', document_revision: '7', canvas: { width: 1024, height: 1024 },
            region: { x: 640, y: 580, width: 330, height: 300, units: 'px' } },
        },
        image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' },
      };
      const run = async (operation: DesignOperation) => {
        await executeServerCommand(repository, TEST_BUSINESS_ID, ACTOR, { kind: 'enqueue', operation });
        await dispatch(operation.operation_key);
        const read = await repository.read(TEST_BUSINESS_ID, ACTOR);
        const call = read.state.snapshot!.jobs.jobs.find(job => job.operation_key === operation.operation_key)!.calls[0];
        if (call.state !== 'needs_review' || !call.receipt?.outputs[0]) throw new Error('fixture_result_not_ready');
        return call.receipt.outputs[0].asset;
      };
      const lowAsset = await run(low), candidate = { ...lowAsset, candidate_id: `candidate:${low.operation_key}` };
      const approval = { approval_id: 'test-external-cover-direction', actor_id: ACTOR, candidate, immutable_elements: [...low.context.immutable_elements] };
      await executeServerCommand(repository, TEST_BUSINESS_ID, ACTOR, { kind: 'approve_direction', approval });
      const medium: DesignOperation = structuredClone(low);
      medium.operation_key = 'test-external-cover-medium'; medium.action = 'generate_medium'; medium.image!.quality = 'medium';
      medium.context.base_asset = { ...lowAsset }; medium.context.direction_approval = { candidate, immutable_elements: [...approval.immutable_elements] };
      medium.selected_candidates = [{ ...candidate }];
      const mediumAsset = await run(medium);
      const alternative = structuredClone(low); alternative.operation_key = 'test-external-cover-reject';
      alternative.context.instruction = 'Una alternativa descartable para comprobar el rechazo sin generar otra imagen.';
      const rejectedCandidate = await run(alternative);
      coverFixture = { low: lowAsset, medium: mediumAsset, rejectedCandidate, low_operation_key: low.operation_key,
        medium_operation_key: medium.operation_key, rejected_operation_key: alternative.operation_key, target };
      await db.query('UPDATE public.desaing_policies SET enabled=false WHERE business_id=$1', [TEST_BUSINESS_ID]);
    }
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split('?')[0] ?? '';
      if (!path.startsWith(ROOT) && !path.startsWith('/__desaing-') && !(productionTest && path.startsWith('/storage/v1/object/public/design-images/'))) return next();
      try {
        if (req.headers.host !== new URL(ORIGIN).host || (req.headers.origin && req.headers.origin !== ORIGIN)) { res.statusCode = 403; res.end(); return; }
        res.setHeader('Cache-Control', 'no-store');
        if(productionTest&&path.startsWith('/storage/v1/object/public/design-images/')) {
          const bytes=legacyObjects.get(path.slice('/storage/v1/object/public/design-images/'.length));
          if(req.method!=='GET'||!bytes){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','image/png');res.end(bytes);return;
        }
        if(productionTest&&path==='/__desaing-production-fixture') {
          if(req.method!=='GET'){res.statusCode=405;res.end();return;}
          const contexts:Record<string,unknown>={};
          for(const [name,table,column] of [['copy','copy_bank_items','image_meta'],['generated','generated_ideas','piece_v2']]){
            const row=(await db.query(`SELECT * FROM public.${table}`)).rows[0] as Record<string,unknown>;
            const meta=row[column] as Record<string,unknown>;contexts[name]={meta,carousel:meta.carousel,editorial:{headline:row.headline,subcopy:row.subcopy,cta:row.cta,status:row.status}};
          }
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...productionFixture,contexts}));return;
        }
        if (onboardingTest && path === '/__desaing-onboarding-tenant') {
          if (req.method !== 'GET' || req.headers.authorization !== 'Bearer local-design-session') { res.statusCode = 403; res.end(); return; }
          const tenant = await db.query('SELECT * FROM public.business_tenants WHERE id=$1', [TEST_BUSINESS_ID]);
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(tenant.rows)); return;
        }
        if (path === '/__desaing-explore/recover') {
          if (!explorationTest || req.method !== 'GET' || req.headers.authorization !== 'Bearer local-design-session') { res.statusCode = 403; res.end(); return; }
          const requestKey = new URL(req.url!, ORIGIN).searchParams.get('request_key') ?? '';
          metrics.planner_recoveries++;
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(planning.get(requestKey)?.result ?? null)); return;
        }
        if (path === '/__desaing-explore') {
          if (!explorationTest || req.method !== 'POST' || req.headers.authorization !== 'Bearer local-design-session') { res.statusCode = 403; res.end(); return; }
          const parts: Uint8Array[] = []; let length = 0;
          for await (const part of req) { length += part.length; if (length > 262144) throw new Error('exploration_test_request_too_large'); parts.push(part); }
          const input: ExplorationRequest = JSON.parse(Buffer.concat(parts).toString());
          const serialized = JSON.stringify(input), previous = planning.get(input.request_key);
          if (previous && previous.request !== serialized) { res.statusCode = 409; res.end('{"error":"request_key_conflict"}'); return; }
          if (!previous) {
            const item = { request: serialized, result: null as ExplorationResult | null, work: Promise.resolve(null as unknown as ExplorationResult) };
            planning.set(input.request_key, item);
            item.work = (async () => {
            const { createExplorationProvider } = await import('../../supabase/functions/_shared/desaing/explorationProvider');
            const provider = createExplorationProvider({ apiKey: 'sk-local-text-fixture-never-valid', model: 'gpt-5.4-mini', fetch: async (url, init) => {
              if (String(url) !== 'https://api.openai.com/v1/responses' || init?.method !== 'POST') throw new Error('unexpected_fake_planner_request');
              const body = JSON.parse(String(init.body));
              if (body.model !== 'gpt-5.4-mini' || body.store !== false || (body.tools?.length ?? 0) !== 0
                || body.text?.format?.type !== 'json_schema') throw new Error('unexpected_planner_settings');
              metrics.planner_requests.push({ request_key: input.request_key, kind: input.kind, model: body.model,
                image_tools: body.tools?.length ?? 0, output_tokens_limit: body.max_output_tokens });
              const response = { id: `resp_local_plan_${metrics.planner_requests.length}`, status: 'completed',
                output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(explorationFixture(input)) }] }],
                usage: { input_tokens: 250, output_tokens: 850, total_tokens: 1100 } };
              return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
            } });
            return provider.plan(input);
            })().then(result => { item.result = structuredClone(result); return result; });
          }
          const result = await planning.get(input.request_key)!.work;
          res.setHeader('Content-Type', 'application/json');
          if (loseNextExploration) { loseNextExploration = false; res.end('{"acknowledgement_lost":'); return; }
          res.end(JSON.stringify(result)); return;
        }
        if (path.startsWith('/__desaing-assets/')) {
          const ticket = tokens.get(path.slice('/__desaing-assets/'.length));
          const bytes = ticket && ticket.until > Date.now() ? objects.get(ticket.key) : undefined;
          if (!bytes || req.method !== 'GET') { res.statusCode = 404; res.end(); return; }
          res.setHeader('Content-Type', ticket ? objectMimes.get(ticket.key) ?? 'image/png' : 'image/png'); res.end(bytes); return;
        }
        if (materialsTest && path === '/__desaing-material-pdf') {
          if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
          const version = new URL(req.url!, ORIGIN).searchParams.get('revision') === 'B' ? 'B' : 'A';
          res.setHeader('Content-Type', 'application/pdf'); res.end(materialsPdfFixture(version)); return;
        }
        if (path === '/__desaing-test') {
          if (req.headers.authorization !== 'Bearer local-design-session') { res.statusCode = 401; res.end(); return; }
          const params = new URL(req.url!, ORIGIN).searchParams;
          if (req.method === 'POST') {
            if(promptAdminTest) {
              if(params.has('lose_prompt_publish'))loseNextPromptPublication=params.get('lose_prompt_publish')==='true';
              if(params.has('prompt_permission')) {
                await db.exec('RESET ROLE');
                try { if(params.get('prompt_permission')==='false')await db.query('DELETE FROM public.desaing_prompt_admin_grants WHERE business_id=$1 AND actor_id=$2',[TEST_BUSINESS_ID,ACTOR]);
                  else await db.query("INSERT INTO public.desaing_prompt_admin_grants(business_id,actor_id,capability) VALUES($1,$2,'prompt_master.manage') ON CONFLICT DO NOTHING",[TEST_BUSINESS_ID,ACTOR]);
                } finally {await db.exec('SET ROLE service_role');}
              }
            }
            if(productionTest){
              if(params.has('lose_production'))loseNextProductionApply=params.get('lose_production')==='true';
              if(params.has('sibling_change'))await db.query(`UPDATE public.copy_bank_items SET image_meta=jsonb_set(image_meta,'{carousel,slots,1,customField}',to_jsonb($1::text))`,['concurrent-sibling-change']);
              if(params.has('source_change'))await db.query(`UPDATE public.copy_bank_items SET image_meta=jsonb_set(image_meta,'{carousel,slots,0,slideCopy,headline}',to_jsonb($1::text))`,[params.get('source_change')==='true'?'Titular cambiado':'Texto exacto']);
            }
            if (onboardingTest) {
              if (params.has('lose_onboarding')) loseNextOnboardingPublication = params.get('lose_onboarding') === 'true';
              if (params.has('change_brand_base')) await db.query('UPDATE public.business_tenants SET name=$1 WHERE id=$2',
                [params.get('change_brand_base') === 'true' ? 'Nombre cambiado en otra sesión' : 'Marca local inicial', TEST_BUSINESS_ID]);
            }
            if (explorationTest && params.has('lose_exploration')) loseNextExploration = params.get('lose_exploration') === 'true';
            if (compositionTest && params.has('lose_html')) loseNextHtml = params.get('lose_html') === 'true';
            if (materialsTest) {
              if (params.has('lose_material')) loseNextMaterial = params.get('lose_material') === 'true';
              if (params.has('lose_material_upload')) loseNextMaterialUpload = params.get('lose_material_upload') === 'true';
              if (params.has('material_input_limit')) materialInputLimit = params.get('material_input_limit') === 'true';
              if (params.has('fail_material')) failNextMaterial = params.get('fail_material') === 'true';
              if (params.get('reserve_text_budget') === 'true') {
                for (let index = 1; index <= 3; index++) {
                  const budgetRequest: ExplorationRequest = { request_key: `materials-fixture-budget-${index}`, kind: 'discussion', scope: 'full_design',
                    context: { actor_id: ACTOR, business_id: TEST_BUSINESS_ID, brand_id: 'fixture', project_id: 'fixture', session_id: `fixture-budget-${index}`,
                      workspace: 'free_design', interaction_mode: 'explore_design', target: { document_type: 'cover', document_id: 'fixture', page_id: 'fixture', revision: '1' },
                      instruction: 'Reserva de texto aislada para comprobar el límite compartido.', immutable_elements: [], references: [] }, message: 'Reserva simulada sin proveedor.', history: [] };
                  await explorationRepository.claim({ businessId: TEST_BUSINESS_ID, actorId: ACTOR, request: budgetRequest,
                    expectedPolicyId: 'local-generation-pilot', expiresAt: Date.now() + 3600000, reservedMicroUsd: 250000 });
                }
              }
            }
            if (durableExploration) {
              if (params.has('text_enabled')) textEnabled = params.get('text_enabled') === 'true';
              if (params.has('fail_text')) failNextText = params.get('fail_text') === 'true';
              if (params.has('restart_exploration') || params.has('text_enabled')) { planning.clear(); api = makeApi(); }
            }
            if (generationTest) {
              if (params.has('executor')) {
                if (!['image_api', 'responses_image'].includes(params.get('executor')!)) throw new Error('invalid_test_executor');
                executor = params.get('executor') as typeof executor; api = makeApi();
              }
              if (params.has('capabilities')) {
                if (!['normal', 'missing', 'malformed'].includes(params.get('capabilities')!)) throw new Error('invalid_test_capabilities');
                capabilities = params.get('capabilities') as typeof capabilities;
              }
            } else {
            if (proposalsTest && params.has('fail_dispatch')) {
              const dispatch = Number(params.get('fail_dispatch'));
              if (!Number.isSafeInteger(dispatch) || dispatch <= metrics.simulated_dispatches || dispatch > 100) throw new Error('invalid_test_dispatch');
              failDispatchNumber = dispatch;
            }
            if (params.has('quota') && ['1', '20'].includes(params.get('quota')!)) {
              await db.query('UPDATE public.desaing_policies SET policy_id=$1,max_image_outputs=$2 WHERE business_id=$3',
                [crypto.randomUUID(), Number(params.get('quota')), TEST_BUSINESS_ID]);
            }
            pause = params.get('pause') === 'true';
            loseNextEnqueue = params.get('lose_enqueue') === 'true';
            loseNextUpload = params.get('lose_upload') === 'true';
            failNextProvider = params.get('fail_provider') === 'true';
            if (params.get('seed_cover_results') === 'true') await seedCoverResults();
            if (!pause) {
              const state = await repository.read(TEST_BUSINESS_ID, ACTOR);
              for (const job of state.state.snapshot?.jobs.jobs ?? []) void dispatch(job.operation_key);
            }
            }
          }
          const audit = await db.query('SELECT event,operation_key FROM public.desaing_audit ORDER BY revision');
          const textBudget = durableExploration ? await explorationRepository.budget(TEST_BUSINESS_ID, ACTOR) : undefined;
          const onboardingState = onboardingTest ? { ...(await onboardingRepository.read(TEST_BUSINESS_ID, ACTOR)),
            tenant: (await db.query('SELECT * FROM public.business_tenants WHERE id=$1', [TEST_BUSINESS_ID])).rows[0],
            profiles: (await db.query('SELECT * FROM public.creative_profiles WHERE business_id=$1 ORDER BY version', [TEST_BUSINESS_ID])).rows } : undefined;
          const productionState=productionTest?{fixture:productionFixture,mockups:(await db.query('SELECT * FROM public.design_mockups ORDER BY created_at,id')).rows,
            copy_rows:(await db.query('SELECT * FROM public.copy_bank_items')).rows,generated_rows:(await db.query('SELECT * FROM public.generated_ideas')).rows}:undefined;
          const promptState=promptAdminTest?{versions:(await db.query('SELECT id,business_id,prompt_type,prompt_text,version FROM public.master_prompts ORDER BY prompt_type,version')).rows}:undefined;
          res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...metrics, objects: objects.size, audits: audit.rows, pause, cover_fixture: coverFixture,
            ...(textBudget ? { text_budget: textBudget } : {}), ...(onboardingState ? { onboarding: onboardingState } : {}),...(productionState?{production:productionState}:{}),...(promptState?{prompt_admin:promptState}:{}) })); return;
        }
        const chunks: Uint8Array[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8388608) { res.statusCode = 413; res.end(); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks);
        const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        const response = await api(new Request(`${ORIGIN}${req.url}`, { method: req.method, headers, ...(body.length ? { body } : {}) }));
        let reply = await response.text();
        if(promptAdminTest&&path.startsWith(`${ROOT}/prompt-admin/`)) {
          const kind=path.slice(`${ROOT}/prompt-admin/`.length);
          if(kind==='recover')metrics.prompt_admin_recoveries++;
          if(['save','test','review','publish','revert','discard'].includes(kind)){const value=JSON.parse(body.toString());metrics.prompt_admin_mutations.push({kind,request_id:value.request_id,status:response.status});}
          if(kind==='publish'&&response.ok&&loseNextPromptPublication){loseNextPromptPublication=false;res.statusCode=200;res.end('{"acknowledgement_lost":');return;}
        }
        if(productionTest&&path===`${ROOT}/production/prepare`&&response.ok)metrics.production_prepares++;
        if(productionTest&&path===`${ROOT}/production/recover`)metrics.production_recovers++;
        if(productionTest&&path===`${ROOT}/production/apply`){const value=JSON.parse(body.toString());metrics.production_applies.push({apply_id:value.apply_id,snapshot_id:value.snapshot_id,status:response.status});
          if(response.ok&&loseNextProductionApply){loseNextProductionApply=false;res.statusCode=200;res.end('{"acknowledgement_lost":');return;}}
        if (onboardingTest && path === `${ROOT}/onboarding/save` && response.ok) metrics.onboarding_saves++;
        if (onboardingTest && path === `${ROOT}/onboarding/recover`) metrics.onboarding_recoveries++;
        if (onboardingTest && path === `${ROOT}/onboarding/publish`) {
          const request = JSON.parse(body.toString());
          metrics.onboarding_publication_requests.push({ publish_id: request.publish_id, draft_id: request.draft_id, expected_revision: request.expected_revision, status: response.status });
          if (response.ok && loseNextOnboardingPublication) { loseNextOnboardingPublication = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return; }
        }
        if (materialsTest && path === `${ROOT}/materials/recover`) metrics.material_recoveries++;
        if (materialsTest && response.ok && path === `${ROOT}/materials/upload`) {
          metrics.material_uploads++;
          if (loseNextMaterialUpload) { loseNextMaterialUpload = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return; }
        }
        if (materialsTest && response.ok && path === `${ROOT}/materials/analyze` && loseNextMaterial) {
          loseNextMaterial = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return;
        }
        if (compositionTest && path === `${ROOT}/html/recover`) metrics.html_recoveries++;
        if (compositionTest && response.ok && path === `${ROOT}/html/plan` && loseNextHtml) {
          loseNextHtml = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return;
        }
        if (durableExploration && path === `${ROOT}/exploration/recover`) metrics.planner_recoveries++;
        if (durableExploration && response.ok && path === `${ROOT}/exploration/plan` && loseNextExploration) {
          loseNextExploration = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return;
        }
        if (generationTest && capabilities !== 'normal' && response.ok && path === ROOT) {
          const parsed = JSON.parse(body.toString());
          if (parsed.command?.kind === 'read') {
            const value = JSON.parse(reply);
            if (capabilities === 'missing') delete value.generation;
            else value.generation = { profile: 'flare_candidate', executor: 'image_api', remaining_outputs: 'untrusted' };
            reply = JSON.stringify(value);
          }
        }
        if (response.ok && path === `${ROOT}/assets/upload` && loseNextUpload) {
          loseNextUpload = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return;
        }
        if (response.ok && path === ROOT && req.method === 'POST') {
          const parsed = JSON.parse(body.toString());
          if (parsed.command?.kind === 'enqueue') {
            if (proposalsTest) await dispatch(parsed.command.operation.operation_key);
            else void dispatch(parsed.command.operation.operation_key);
            if (loseNextEnqueue) { loseNextEnqueue = false; res.statusCode = 200; res.end('{"acknowledgement_lost":'); return; }
          }
        }
        res.statusCode = response.status; response.headers.forEach((value, name) => res.setHeader(name, value)); res.end(reply);
      } catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'local_server_unavailable' })); }
    });
    server.httpServer?.once('close', () => { void db.close(); });
  } };
}
