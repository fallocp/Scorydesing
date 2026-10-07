import { describe, expect, it, vi } from 'vitest';
import { assertExplorationRequest, assertExplorationResult } from '../exploration.ts';
import { createExplorationProvider, prepareExplorationRequest } from '../explorationProvider.ts';
import { CONVERSATION_ACTIONS, type ConversationNextAction } from '../conversationActions.ts';
import type { ExplorationRequest, ExplorationResult } from '../explorationContracts.ts';
import { createServerExploration, type ServerExplorationConfig } from '../serverExploration.ts';
import type { ExplorationJournalEntry, ExplorationRepository } from '../explorationRepository.ts';
import type { ServerRead, ServerRepository } from '../serverRepository.ts';
import { isServerExplorationCapabilities } from '../serverExplorationContract.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { result as legacyResult, visualBriefRequest, visualUnderstanding } from './fixtures/explorationFixture.ts';
import { htmlPng } from './fixtures/htmlCompositionFixture.ts';

function request(): ExplorationRequest {
  const req = visualBriefRequest('conversation-1');
  req.conversation = { schema_version: 1, canvas: { width: 1280, height: 720 }, surface: 'empty', selected_image: null,
    available_actions: ['discuss', 'generate_image', 'create_html', 'explore_ideas'] };
  return req;
}
const action = (kind: ConversationNextAction['kind'] = 'generate_image'): ConversationNextAction => ({ kind, intent: 'requested',
  instruction: 'Conserva el texto y composición de source-1 y usa el mundo de source-2.', reference_ids: ['source-1', 'source-2'], reason: 'El usuario pidió crear el diseño.' });
function result(req = request(), next = action()): ExplorationResult {
  return { ...legacyResult(req.request_key), ideas: [], message: 'Conservaré el texto de la primera y usaré el mundo de la segunda.',
    design_understanding: visualUnderstanding(), next_action: next };
}
function wire(output: ExplorationResult) {
  return { id: 'resp_conversation', status: 'completed', usage: output.usage, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text',
    text: JSON.stringify({ message: output.message, ideas: output.ideas, design_understanding: output.design_understanding, next_action: output.next_action }) }] }] };
}
function fixture(output = result()) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(wire(output))));
  return { fetch, provider: createExplorationProvider({ apiKey: 'local-test-key', model: 'gpt-5.4-mini', fetch }),
    images: request().context.references.map((ref, index) => ({ reference_id: ref.reference_id, bytes: htmlPng(10 + index) })) };
}

describe('unified conversation using the existing exploration planner', () => {
  it('returns natural answer, literal source copy and one structured action using the two actual image inputs in order', async () => {
    const req = request(), f = fixture();
    const output = await f.provider.plan(req, f.images);
    expect(output.next_action).toEqual(action());
    expect(output.design_understanding?.copy).toEqual(visualUnderstanding().copy);
    expect(output.message).toContain('primera'); expect(output.ideas).toHaveLength(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetch.mock.calls[0], body = JSON.parse(init!.body as string);
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(body).toMatchObject({ tools: [], tool_choice: 'none', store: false });
    expect(body.text.format.schema.required).toContain('next_action');
    expect(body.text.format.schema.properties.next_action.properties.kind.enum).toEqual(req.conversation!.available_actions);
    expect(body.input[1].content.filter((part: { type: string }) => part.type === 'input_image').map((part: { image_url: string }) => part.image_url))
      .toEqual(f.images.map(image => `data:image/png;base64,${Buffer.from(image.bytes).toString('base64')}`));
    expect(JSON.parse(body.input[1].content[0].text).design_brief.brand).toEqual(req.design_brief!.brand);
  });

  it('keeps selected asset/version and literal copy for an image adjustment, without a generation tool call', async () => {
    const req = request(), ref = req.context.references[1];
    req.message = 'Haz más grande este mundo. Conserva las palabras.';
    req.conversation!.surface = 'image'; req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id };
    req.conversation!.available_actions.push('edit_image', 'convert_image_to_html');
    req.design_brief!.copy = visualUnderstanding().copy; req.design_brief!.previous_understanding = visualUnderstanding();
    req.history = [{ role: 'user', text: 'Usa el texto de la primera y el mundo de la segunda.' }, { role: 'assistant', text: 'La propuesta está lista.' }];
    const f = fixture(result(req, action('edit_image')));
    const output = await f.provider.plan(req, f.images);
    expect(output.design_understanding!.copy.text).toBe(req.design_brief!.copy.text);
    const payload = JSON.parse(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).input[1].content[0].text);
    expect(payload.conversation.selected_image).toEqual(req.conversation!.selected_image);
    expect(payload.history).toEqual(req.history); expect(payload.context.target).toEqual(req.context.target);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('produces five requested ideas inside a single discussion turn, with no second planning request', async () => {
    const req = request(); req.message = 'Dame cinco ideas de portada.';
    const output = result(req, action('explore_ideas')); output.ideas = legacyResult().ideas;
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.ideas).toHaveLength(5); expect(planned.next_action?.kind).toBe('explore_ideas');
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(() => assertExplorationResult({ ...planned, ideas: planned.ideas.slice(0, 4) }, req)).toThrow('invalid_exploration_ideas');
    expect(() => assertExplorationResult({ ...planned, next_action: action() }, req)).toThrow('invalid_exploration_ideas');
  });

  it('sends current HTML structure at its exact revision as text, without inventing a current screenshot', async () => {
    const req = request(); req.conversation!.surface = 'html'; req.conversation!.available_actions.push('refine_html');
    req.conversation!.current_html = { revision: req.context.target.revision,
      summary: 'Texto: Conectamos tu empresa con el mundo. CSS: .slide{width:1280px;height:720px} Estructura: <h1 id="title">Conectamos tu empresa con el mundo.</h1>' };
    req.message = 'Aumenta el título en este HTML y conserva todo el texto.';
    const f = fixture(result(req, action('refine_html'))); await f.provider.plan(req, f.images);
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).conversation.current_html).toEqual(req.conversation!.current_html);
    expect(body.input[0].content[0].text).toContain('No es una captura');
    expect(body.input[1].content.filter((part: { type: string }) => part.type === 'input_image')).toHaveLength(2);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    for (const mutate of [
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.revision = 'outdated'; },
      (bad: ExplorationRequest) => { bad.conversation!.surface = 'empty'; },
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.summary = ''; },
      (bad: ExplorationRequest) => { bad.conversation!.current_html!.summary = 'a'.repeat(12001); },
    ]) { const bad = structuredClone(req); mutate(bad); expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_html_context'); }
    const legacy = request(); expect(() => assertExplorationRequest(legacy)).not.toThrow();
  });

  it('keeps ambiguous feedback as discussion/clarification and suggestions as non-requested next steps', async () => {
    const req = request(); req.message = 'Quizá quede mejor, ¿tú qué opinas?';
    for (const next of [{ ...action('discuss'), intent: 'clarify' as const, instruction: '', reason: 'Falta elegir HTML o imagen.' },
      { ...action('create_html'), intent: 'suggested' as const }]) {
      const f = fixture(result(req, next));
      expect((await f.provider.plan(req, f.images)).next_action?.intent).toBe(next.intent);
      const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
      expect(body.tools).toEqual([]); expect(body.input[0].content[0].text).toContain('no autorizan ejecución');
      expect(f.fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('refuses incompatible surfaces, unbound image versions, unavailable capabilities and approval/publication actions', () => {
    const ref = request().context.references[0];
    for (const mutate of [
      (req: ExplorationRequest) => { req.conversation!.available_actions.push('refine_html'); },
      (req: ExplorationRequest) => { req.conversation!.available_actions.push('edit_image'); },
      (req: ExplorationRequest) => { req.conversation!.surface = 'image'; },
      (req: ExplorationRequest) => { req.conversation!.selected_image = { business_id: 'foreign', asset_id: ref.asset_id, version_id: ref.version_id }; },
      (req: ExplorationRequest) => { req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: 'other-version' }; },
      (req: ExplorationRequest) => { delete req.design_brief; },
    ]) { const req = request(); mutate(req); expect(() => assertExplorationRequest(req)).toThrow(); }
    expect(CONVERSATION_ACTIONS).not.toContain('approve_result'); expect(CONVERSATION_ACTIONS).not.toContain('publish');
    expect(() => assertExplorationResult(result(request(), action('refine_html')), request())).toThrow('invalid_conversation_action');
    expect(() => assertExplorationResult(result(request(), { ...action(), kind: 'approve_result' as never }), request())).toThrow('invalid_conversation_action');
    expect(() => assertExplorationResult(result(request(), { ...action(), reference_ids: ['foreign'] }), request())).toThrow('invalid_conversation_action');
  });

  it('blocks requested render/HTML actions while copy or a required decision remains pending', () => {
    const req = request();
    const output = result(req); output.design_understanding!.copy = { status: 'pending', text: '', source_reference_ids: [] };
    expect(() => assertExplorationResult(output, req)).toThrow('conversation_action_not_ready');
    output.design_understanding = { ...visualUnderstanding(), pending_questions: ['¿Qué texto debe llevar?'] };
    expect(() => assertExplorationResult(output, req)).toThrow('conversation_action_not_ready');
    output.next_action = { ...action('discuss'), intent: 'clarify' };
    expect(() => assertExplorationResult(output, req)).not.toThrow();
  });

  it('repairs a self-contradicting answer into a question that waits for the user instead of failing the turn', async () => {
    const req = request(), output = result(req);
    output.design_understanding = { ...visualUnderstanding(), pending_questions: ['¿La quieres como imagen o como HTML?'] };
    output.ideas = legacyResult().ideas; output.next_action = { ...action(), instruction: '' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toMatchObject({ kind: 'generate_image', intent: 'suggested', instruction: visualUnderstanding().resolved_instruction });
    expect(planned.ideas).toEqual([]); expect(planned.design_understanding!.pending_questions).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled(); warn.mockRestore();
  });

  it('repairs clarify on a render action, pending copy with text and duplicated ids without enabling execution', async () => {
    const req = request(), output = result(req);
    output.design_understanding = { ...visualUnderstanding(), copy: { status: 'pending', text: 'Texto dudoso', source_reference_ids: ['source-1', 'source-1'] } };
    output.next_action = { ...action('create_html'), intent: 'clarify', reference_ids: ['source-1', 'source-1'] };
    const f = fixture(output), planned = await f.provider.plan(req, f.images);
    expect(planned.design_understanding!.copy).toEqual({ status: 'pending', text: '', source_reference_ids: ['source-1'] });
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'suggested', reference_ids: ['source-1'] });
  });

  it('keeps an explicit, complete order as requested and sends the waiting action as context for the answer', async () => {
    const req = request(); req.message = 'HTML.';
    req.conversation!.pending_action = { kind: 'create_html', instruction: 'Recrea source-1 con el texto literal.', questions: ['¿Imagen o HTML?'] };
    expect(() => assertExplorationRequest(req)).not.toThrow();
    const f = fixture(result(req, action('create_html'))), planned = await f.provider.plan(req, f.images);
    expect(planned.next_action).toMatchObject({ kind: 'create_html', intent: 'requested' });
    const body = JSON.parse(f.fetch.mock.calls[0][1]!.body as string);
    expect(JSON.parse(body.input[1].content[0].text).conversation.pending_action).toEqual(req.conversation!.pending_action);
    expect(body.input[0].content[0].text).toContain('conversation.pending_action');
    for (const pending of [{ kind: 'discuss', instruction: '', questions: [] }, { kind: 'create_html', instruction: 'x', questions: [''] },
      { kind: 'create_html', instruction: 'x', questions: [], extra: true }]) {
      const bad = request(); Object.assign(bad.conversation!, { pending_action: pending });
      expect(() => assertExplorationRequest(bad)).toThrow('invalid_conversation_turn');
    }
  });

  it('logs only the fixed validation code when a repaired answer is still invalid', async () => {
    const req = request(), output = result(req, { ...action(), kind: 'refine_html' as never });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fixture(output);
    await expect(f.provider.plan(req, f.images)).rejects.toMatchObject({ code: 'exploration_provider_invalid_result' });
    expect(warn).toHaveBeenCalledWith('exploration_result_rejected', 'invalid_conversation_action');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Xending'); warn.mockRestore();
  });

  it('requires the selected image reference in edit/conversion and rejects unrequested action output on legacy planning', () => {
    const req = request(), ref = req.context.references[1];
    req.conversation!.selected_image = { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id };
    req.conversation!.available_actions.push('convert_image_to_html');
    expect(() => assertExplorationResult(result(req, { ...action('convert_image_to_html'), reference_ids: ['source-1'] }), req)).toThrow('invalid_conversation_action');
    const old = visualBriefRequest(req.request_key);
    expect(() => assertExplorationResult(result(req), old)).toThrow('invalid_conversation_action');
    expect(prepareExplorationRequest(old).text).not.toBeUndefined();
  });
});

describe('conversation journal and capability compatibility', () => {
  it('journals the extended request/result and recovers the exact selected action without another provider call', async () => {
    const business = 'a0000000-0000-4000-8000-000000000001', actor = 'a0000000-0000-4000-8000-000000000002';
    const req = request(); Object.assign(req.context, { business_id: business, actor_id: actor, references: [] });
    req.design_brief!.copy = { status: 'literal', text: 'Texto aprobado.', source_reference_ids: [] };
    req.message = 'Crea HTML con el texto aprobado.';
    const output = result(req, { ...action('create_html'), reference_ids: [] });
    output.design_understanding = { ...visualUnderstanding(), references: [], copy: req.design_brief!.copy };
    const policyId = 'conversation-test';
    const config: ServerExplorationConfig = { enabled: true,
      expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 10000 };
    const read: ServerRead = { role: 'owner', policy: { business_id: business, enabled: true, policy_id: policyId,
      limit_micro_usd: PILOT_LIMITS.budgetMicroUsd, max_image_outputs: PILOT_LIMITS.maxOutputs,
      reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true }, state: { revision: 0, snapshot: null } };
    let saved: ExplorationJournalEntry | null = null;
    const journal: ExplorationRepository = {
      budget: vi.fn(async () => ({ attempts: saved ? 1 : 0, image_committed_micro_usd: 0, committed_micro_usd: saved?.settled_micro_usd ?? 0 })),
      read: vi.fn(async (_biz, who) => who === actor && saved ? structuredClone(saved) : null),
      history: vi.fn(async () => saved ? [structuredClone(saved)] : []),
      claim: vi.fn(async input => {
        saved = { business_id: business, actor_id: actor, session_id: req.context.session_id, request_key: req.request_key,
          request: structuredClone(input.request), status: 'running', result: null, error_code: null, response_id: null, usage: null,
          reserved_micro_usd: 250000, settled_micro_usd: null, created_at: '2026-09-19T00:00:00Z', updated_at: '2026-09-19T00:00:00Z' };
        return { claimed: true, entry: structuredClone(saved), claim_token: 'local-claim' };
      }),
      finish: vi.fn(async input => { Object.assign(saved!, { status: input.status, result: input.result, error_code: input.errorCode,
        usage: input.usage, response_id: input.responseId, settled_micro_usd: input.settledMicroUsd }); return structuredClone(saved!); }),
    };
    const repository: ServerRepository = { read: vi.fn(async () => structuredClone(read)), commit: vi.fn() };
    const plan = vi.fn(async () => structuredClone(output));
    const boundary = createServerExploration(config, { repository, explorationRepository: journal, createProvider: () => ({ plan }), now: () => 1000 });
    expect(await boundary.plan(actor, req)).toEqual(output);
    expect(await boundary.recover(actor, business, req.request_key)).toEqual(output);
    expect(await boundary.plan(actor, req)).toEqual(output);
    expect(plan).toHaveBeenCalledTimes(1); expect(repository.commit).not.toHaveBeenCalled();
    expect((await boundary.history(actor, business, req.context.session_id))[0]).toMatchObject({ request: { conversation: req.conversation }, result: { next_action: output.next_action } });
    const capabilities = await boundary.capabilities(business, actor);
    expect(capabilities?.supports_conversation_actions).toBe(1); expect(isServerExplorationCapabilities(capabilities)).toBe(true);
    expect(isServerExplorationCapabilities({ ...capabilities, supports_conversation_actions: 2 })).toBe(false);
  });
});
