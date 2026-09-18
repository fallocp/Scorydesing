import { executeServerCommand, readServerState, serverErrorResponse, ServerBoundaryError } from './serverRepository.ts';
import type { ServerRepository } from './serverRepository.ts';
import { assertBusinessId, boundedBody, parseServerRequest } from './serverRequest.ts';
import { importServerAsset, serverAssetUrl } from './serverStorage.ts';
import type { PrivateAssetStorage } from './serverStorage.ts';
import type { ServerGenerationBoundary } from './serverGeneration.ts';
import type { ServerExplorationBoundary } from './serverExploration.ts';
import { assertExplorationRequest } from './exploration.ts';
import type { ServerHtmlBoundary } from './serverHtml.ts';
import { assertHtmlCompositionRequest } from './composition.ts';
import type { ServerMaterialsBoundary } from './serverMaterials.ts';
import { assertMaterialAnalysisRequest, assertMaterialSaveInput, assertMaterialUploadInput } from './materials.ts';
import type { ServerOnboardingBoundary } from './serverOnboarding.ts';
import { assertBrandSetupSaveInput, assertBrandSetupPublishInput } from './onboarding.ts';
import type { ServerProductionBoundary } from './serverProduction.ts';
import { assertProductionApplyInput, assertProductionPrepareInput, assertProductionSource } from './production.ts';
import type { ServerPromptAdminBoundary } from './serverPromptAdmin.ts';
import { assertPromptAdminSaveInput, assertPromptAdminTestInput, assertPromptAdminReviewInput, assertPromptAdminPublishInput, assertPromptAdminRevertInput,
  assertPromptAdminDiscardInput, assertPromptAdminType } from './promptAdmin.ts';

export interface ServerHttpDependencies {
  enabled: boolean;
  allowedOrigins: readonly string[];
  authenticate(token: string): Promise<{ id: string } | null>;
  repository: ServerRepository;
  storage: PrivateAssetStorage;
  /** Trusted server boundary only; the absence of this port never dispatches a provider. */
  generation?: ServerGenerationBoundary;
  exploration?: ServerExplorationBoundary;
  html?: ServerHtmlBoundary;
  materials?: ServerMaterialsBoundary;
  onboarding?: ServerOnboardingBoundary;
  production?: ServerProductionBoundary;
  promptAdmin?: ServerPromptAdminBoundary;
}

export function createServerHandler(deps: ServerHttpDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !deps.allowedOrigins.includes(origin)) return reply(403, { error: 'origin_denied' });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      return new Response(null, { status: 204, headers });
    }
    if (!deps.enabled) return reply(503, { error: 'server_disabled' });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    try {
      const authorization = request.headers.get('authorization') ?? '';
      const match = /^Bearer ([^\s]+)$/i.exec(authorization);
      if (!match) throw new ServerBoundaryError('authentication_required', 401);
      const actor = await deps.authenticate(match[1]);
      if (!actor) throw new ServerBoundaryError('authentication_required', 401);
      const url = new URL(request.url);
      if (url.pathname.endsWith('/desaing-server/materials/upload')) {
        if (!deps.materials) throw new ServerBoundaryError('server_materials_unavailable', 503);
        const params = url.searchParams, keys = ['business_id', 'collection_id', 'material_id', 'version_id', 'expected_revision', 'filename'];
        if ([...params.keys()].length !== keys.length || [...params.keys()].some(key => !keys.includes(key))
          || !/^\d+$/.test(params.get('expected_revision') ?? '')) throw new ServerBoundaryError('invalid_materials_request');
        const input = { business_id: params.get('business_id'), collection_id: params.get('collection_id'), material_id: params.get('material_id'),
          version_id: params.get('version_id'), expected_revision: Number(params.get('expected_revision')), filename: params.get('filename'),
          mime_type: request.headers.get('content-type')?.split(';')[0].trim() };
        try { assertMaterialUploadInput(input); } catch { throw new ServerBoundaryError('invalid_materials_request'); }
        return reply(200, { collection: await deps.materials.upload(actor.id, input, await boundedBody(request, 8388608)) });
      }
      if (url.pathname.endsWith('/assets/upload') || url.pathname.endsWith('/html/import')) {
        if (request.headers.get('content-type')?.split(';')[0].trim() !== 'image/png') throw new ServerBoundaryError('png_required', 415);
        const params = url.searchParams;
        if ([...params.keys()].some(key => !['business_id', 'upload_id', 'brand_id', 'project_id'].includes(key))
          || [...params.keys()].length !== 4) throw new ServerBoundaryError('invalid_server_request');
        const businessId = params.get('business_id'), uploadId = params.get('upload_id');
        assertBusinessId(businessId); assertBusinessId(uploadId);
        const brandId = params.get('brand_id'), projectId = params.get('project_id');
        if (![brandId, projectId].every(s => s && s.trim() && s.length <= 200 && !/[\x00-\x1f]/.test(s))) throw new ServerBoundaryError('invalid_server_request');
        const input = { businessId, uploadId, brandId: brandId!, projectId: projectId! }, bytes = await boundedBody(request, 8388608);
        if (url.pathname.endsWith('/html/import') && !deps.html) throw new ServerBoundaryError('server_html_unavailable', 503);
        const result = url.pathname.endsWith('/html/import') ? await deps.html!.import(actor.id, input, bytes)
          : deps.generation ? await deps.generation.import(actor.id, input, bytes)
          : await importServerAsset(deps.repository, deps.storage, actor.id, input, bytes);
        return reply(200, result);
      }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ServerBoundaryError('json_required', 415);
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(request, 262144))); }
      catch (error) { if (error instanceof ServerBoundaryError) throw error; throw new ServerBoundaryError('invalid_json'); }
      const promptRoute = /\/desaing-server\/prompt-admin\/(capabilities|read|save|test|review|publish|revert|discard|recover)$/.exec(url.pathname)?.[1];
      if (promptRoute) {
        if (!deps.promptAdmin) throw new ServerBoundaryError('server_prompt_admin_unavailable', 503);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_prompt_admin_request');
        const input = body as Record<string, unknown>;
        // Only parsing is normalized here; definitive boundary conflicts retain their code.
        try {
          if (promptRoute === 'save') assertPromptAdminSaveInput(input);
          else if (promptRoute === 'test') assertPromptAdminTestInput(input);
          else if (promptRoute === 'review') assertPromptAdminReviewInput(input);
          else if (promptRoute === 'publish') assertPromptAdminPublishInput(input);
          else if (promptRoute === 'revert') assertPromptAdminRevertInput(input);
          else if (promptRoute === 'discard') assertPromptAdminDiscardInput(input);
          else { const fields = promptRoute === 'recover' ? ['business_id', 'request_id']
            : promptRoute === 'read' && 'prompt_type' in input ? ['business_id', 'prompt_type'] : ['business_id'];
            if (Object.keys(input).length !== fields.length || fields.some(field => !(field in input))) throw Error('invalid');
            assertBusinessId(input.business_id); if (promptRoute === 'recover') assertBusinessId(input.request_id);
            if ('prompt_type' in input) assertPromptAdminType(input.prompt_type); }
        } catch { throw new ServerBoundaryError('invalid_prompt_admin_request', 400); }
        if (promptRoute === 'save') { assertPromptAdminSaveInput(input); return reply(200, { mutation: await deps.promptAdmin.save(actor.id, input) }); }
        if (promptRoute === 'test') { assertPromptAdminTestInput(input); return reply(200, { mutation: await deps.promptAdmin.test(actor.id, input) }); }
        if (promptRoute === 'review') { assertPromptAdminReviewInput(input); return reply(200, { mutation: await deps.promptAdmin.review(actor.id, input) }); }
        if (promptRoute === 'publish') { assertPromptAdminPublishInput(input); return reply(200, { mutation: await deps.promptAdmin.publish(actor.id, input) }); }
        if (promptRoute === 'revert') { assertPromptAdminRevertInput(input); return reply(200, { mutation: await deps.promptAdmin.revert(actor.id, input) }); }
        if (promptRoute === 'discard') { assertPromptAdminDiscardInput(input); return reply(200, { mutation: await deps.promptAdmin.discard(actor.id, input) }); }
        assertBusinessId(input.business_id);
        if (promptRoute === 'capabilities') return reply(200, await deps.promptAdmin.capabilities(actor.id, input.business_id));
        if (promptRoute === 'read') return reply(200, await deps.promptAdmin.read(actor.id, input.business_id, input.prompt_type as string | undefined));
        assertBusinessId(input.request_id); return reply(200, { mutation: await deps.promptAdmin.recover(actor.id, input.business_id, input.request_id) });
      }
      const productionRoute = /\/desaing-server\/production\/(prepare|read|apply|recover)$/.exec(url.pathname)?.[1];
      if (productionRoute) {
        if (!deps.production) throw new ServerBoundaryError('server_production_unavailable', 503);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_production_request');
        const input = body as Record<string, unknown>;
        if (productionRoute === 'prepare') { try { assertProductionPrepareInput(input); } catch { throw new ServerBoundaryError('invalid_production_request'); }
          return reply(200, { snapshot: await deps.production.prepare(actor.id, input) }); }
        if (productionRoute === 'apply') { try { assertProductionApplyInput(input); } catch { throw new ServerBoundaryError('invalid_production_request'); }
          return reply(200, { receipt: await deps.production.apply(actor.id, input) }); }
        const fields = productionRoute === 'read' ? ['business_id', 'source'] : ['business_id', 'apply_id'];
        if (Object.keys(input).length !== fields.length || fields.some(field => !(field in input))) throw new ServerBoundaryError('invalid_production_request');
        assertBusinessId(input.business_id);
        if (productionRoute === 'read') { try { assertProductionSource(input.source); } catch { throw new ServerBoundaryError('invalid_production_request'); }
          return reply(200, await deps.production.read(actor.id, input.business_id, input.source)); }
        assertBusinessId(input.apply_id); return reply(200, { receipt: await deps.production.recover(actor.id, input.business_id, input.apply_id) });
      }
      const onboardingRoute = /\/desaing-server\/onboarding\/(read|save|publish|recover)$/.exec(url.pathname)?.[1];
      if (onboardingRoute) {
        if (!deps.onboarding) throw new ServerBoundaryError('server_onboarding_unavailable', 503);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_onboarding_request');
        const input = body as Record<string, unknown>;
        if (onboardingRoute === 'save') { try { assertBrandSetupSaveInput(input); } catch { throw new ServerBoundaryError('invalid_onboarding_request'); }
          return reply(200, { draft: await deps.onboarding.save(actor.id, input) }); }
        if (onboardingRoute === 'publish') { try { assertBrandSetupPublishInput(input); } catch { throw new ServerBoundaryError('invalid_onboarding_request'); }
          return reply(200, { receipt: await deps.onboarding.publish(actor.id, input) }); }
        const fields = onboardingRoute === 'read' ? ['business_id'] : ['business_id', 'publish_id'];
        if (Object.keys(input).length !== fields.length || fields.some(field => !(field in input))) throw new ServerBoundaryError('invalid_onboarding_request');
        assertBusinessId(input.business_id);
        if (onboardingRoute === 'read') return reply(200, await deps.onboarding.read(actor.id, input.business_id));
        assertBusinessId(input.publish_id); return reply(200, { receipt: await deps.onboarding.recover(actor.id, input.business_id, input.publish_id) });
      }
      const materialsRoute = /\/desaing-server\/materials\/(read|save|analyze|recover|history|capabilities|source)$/.exec(url.pathname)?.[1];
      if (materialsRoute) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_materials_request');
        const input = body as Record<string, unknown>;
        const fields = materialsRoute === 'save' ? ['business_id', 'collection_id', 'expected_revision', 'selected', 'brief', 'review']
          : materialsRoute === 'analyze' ? ['business_id', 'request'] : materialsRoute === 'recover' ? ['business_id', 'request_key']
          : materialsRoute === 'capabilities' ? ['business_id'] : materialsRoute === 'source'
          ? ['business_id', 'collection_id', 'material_id', 'version_id'] : ['business_id', 'collection_id'];
        if (Object.keys(input).length !== fields.length || fields.some(field => !(field in input))) throw new ServerBoundaryError('invalid_materials_request');
        assertBusinessId(input.business_id);
        if (!deps.materials) {
          if (materialsRoute === 'capabilities') { await readServerState(deps.repository, input.business_id, actor.id); return reply(200, { capabilities: null }); }
          throw new ServerBoundaryError('server_materials_unavailable', 503);
        }
        if (materialsRoute === 'capabilities') return reply(200, { capabilities: await deps.materials.capabilities(input.business_id, actor.id) });
        if (materialsRoute === 'analyze') {
          try { assertMaterialAnalysisRequest(input.request); } catch { throw new ServerBoundaryError('invalid_materials_request'); }
          if (input.request.context.business_id !== input.business_id || input.request.context.actor_id !== actor.id) throw new ServerBoundaryError('materials_scope_mismatch', 403);
          return reply(200, { result: await deps.materials.analyze(actor.id, input.request) });
        }
        if (materialsRoute === 'recover') {
          if (typeof input.request_key !== 'string') throw new ServerBoundaryError('invalid_materials_request');
          return reply(200, { result: await deps.materials.recover(actor.id, input.business_id, input.request_key) });
        }
        assertBusinessId(input.collection_id);
        if (materialsRoute === 'save') { try { assertMaterialSaveInput(input); } catch { throw new ServerBoundaryError('invalid_materials_request'); }
          return reply(200, { collection: await deps.materials.save(actor.id, input) }); }
        if (materialsRoute === 'read') return reply(200, { collection: await deps.materials.read(actor.id, input.business_id, input.collection_id) });
        if (materialsRoute === 'history') return reply(200, { attempts: await deps.materials.history(actor.id, input.business_id, input.collection_id) });
        if (typeof input.material_id !== 'string' || typeof input.version_id !== 'string') throw new ServerBoundaryError('invalid_materials_request');
        return reply(200, await deps.materials.source(actor.id, input.business_id, input.collection_id, { material_id: input.material_id, version_id: input.version_id }));
      }
      const htmlRoute = /\/desaing-server\/html\/(plan|recover|history|capabilities)$/.exec(url.pathname)?.[1];
      if (htmlRoute) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_server_request');
        const input = body as Record<string, unknown>;
        const fields = htmlRoute === 'plan' ? ['business_id', 'request'] : htmlRoute === 'recover'
          ? ['business_id', 'request_key'] : htmlRoute === 'history' ? ['business_id', 'session_id'] : ['business_id'];
        if (Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key))) throw new ServerBoundaryError('invalid_server_request');
        assertBusinessId(input.business_id);
        if (!deps.html) {
          if (htmlRoute === 'capabilities') { await readServerState(deps.repository, input.business_id, actor.id); return reply(200, { capabilities: null }); }
          throw new ServerBoundaryError('server_html_unavailable', 503);
        }
        if (htmlRoute === 'plan') {
          try { assertHtmlCompositionRequest(input.request); } catch { throw new ServerBoundaryError('invalid_html_request'); }
          if (input.request.context.actor_id !== actor.id || input.request.context.business_id !== input.business_id) throw new ServerBoundaryError('html_scope_mismatch', 403);
          return reply(200, { result: await deps.html.plan(actor.id, input.request) });
        }
        if (htmlRoute === 'capabilities') return reply(200, { capabilities: await deps.html.capabilities(input.business_id, actor.id) });
        const key = input[htmlRoute === 'recover' ? 'request_key' : 'session_id'];
        if (typeof key !== 'string' || !key.trim() || key.length > 256 || /[\x00-\x1f\x7f]/.test(key)) throw new ServerBoundaryError('invalid_server_request');
        return htmlRoute === 'recover' ? reply(200, { result: await deps.html.recover(actor.id, input.business_id, key) })
          : reply(200, { attempts: await deps.html.history(actor.id, input.business_id, key) });
      }
      const explorationRoute = /\/desaing-server\/exploration\/(plan|recover|history|capabilities)$/.exec(url.pathname)?.[1];
      if (explorationRoute) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_server_request');
        const input = body as Record<string, unknown>;
        const fields = explorationRoute === 'plan' ? ['business_id', 'request'] : explorationRoute === 'recover'
          ? ['business_id', 'request_key'] : explorationRoute === 'history' ? ['business_id', 'session_id'] : ['business_id'];
        if (Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key))) throw new ServerBoundaryError('invalid_server_request');
        assertBusinessId(input.business_id);
        if (!deps.exploration) {
          if (explorationRoute === 'capabilities') {
            await readServerState(deps.repository, input.business_id, actor.id);
            return reply(200, { capabilities: null });
          }
          throw new ServerBoundaryError('server_exploration_unavailable', 503);
        }
        if (explorationRoute === 'plan') {
          try { assertExplorationRequest(input.request); } catch { throw new ServerBoundaryError('invalid_exploration_request'); }
          if (input.request.context.actor_id !== actor.id || input.request.context.business_id !== input.business_id) {
            throw new ServerBoundaryError('exploration_scope_mismatch', 403);
          }
          return reply(200, { result: await deps.exploration.plan(actor.id, input.request) });
        }
        if (explorationRoute === 'capabilities') return reply(200, { capabilities: await deps.exploration.capabilities(input.business_id, actor.id) });
        const key = input[explorationRoute === 'recover' ? 'request_key' : 'session_id'];
        if (typeof key !== 'string' || !key.trim() || key.length > 256 || /[\x00-\x1f\x7f]/.test(key)) throw new ServerBoundaryError('invalid_server_request');
        return explorationRoute === 'recover'
          ? reply(200, { result: await deps.exploration.recover(actor.id, input.business_id, key) })
          : reply(200, { attempts: await deps.exploration.history(actor.id, input.business_id, key) });
      }
      if (url.pathname.endsWith('/assets/url')) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ServerBoundaryError('invalid_server_request');
        const v = body as Record<string, unknown>;
        if (Object.keys(v).length !== 3 || !Object.keys(v).every(key => ['business_id', 'asset_id', 'version_id'].includes(key))) throw new ServerBoundaryError('invalid_server_request');
        assertBusinessId(v.business_id);
        if (![v.asset_id, v.version_id].every(s => typeof s === 'string' && s.length > 0 && s.length <= 200)) throw new ServerBoundaryError('invalid_server_request');
        return reply(200, await serverAssetUrl(deps.repository, deps.storage, actor.id, v.business_id, v.asset_id as string, v.version_id as string));
      }
      if (!url.pathname.endsWith('/desaing-server') && !url.pathname.endsWith('/desaing-server/')) throw new ServerBoundaryError('route_not_found', 404);
      const parsed = parseServerRequest(body);
      const result = parsed.command.kind === 'read'
        ? await (deps.generation ? deps.generation.read(parsed.businessId, actor.id) : readServerState(deps.repository, parsed.businessId, actor.id))
        : parsed.command.kind === 'enqueue' && deps.generation
          ? await deps.generation.enqueue(parsed.businessId, actor.id, parsed.command.operation)
          : await executeServerCommand(deps.repository, parsed.businessId, actor.id, parsed.command);
      return reply(200, result);
    } catch (error) {
      const response = serverErrorResponse(error);
      return reply(response.status, { error: response.code });
    }
  };
}
