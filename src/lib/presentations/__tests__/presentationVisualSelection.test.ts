import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beginExploration, createExplorationSession, finishExploration } from '../../../../supabase/functions/_shared/desaing/exploration';
import { createVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { fullDesignLocalInstruction } from '../../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import { buildPresentationImageOperation } from '../presentationServerDesign';
import type { ServerGenerationCapabilities } from '../../../../supabase/functions/_shared/desaing/serverGenerationContract';

// Exercise the hook's real source adapter without a DOM. Only React scheduling,
// browser persistence and the outer controller are substituted; builders are real.
const harness = vi.hoisted(() => ({ refs: [] as { current: any }[], cursor: 0, effects: [] as (() => any)[], port: null as any }));
vi.mock('react', () => ({
  useRef: (initial: any) => { const index = harness.cursor++; return harness.refs[index] ??= { current: initial }; },
  useState: (initial: any) => [initial, vi.fn()],
  useEffect: (effect: () => any) => { harness.effects.push(effect); },
}));
vi.mock('../../desaing/visualProposalStore', () => ({ openVisualProposalStore: vi.fn(async () => ({ close: vi.fn() })) }));
vi.mock('../../desaing/visualProposalController', () => ({ createVisualProposalController: vi.fn((port: any) => {
  harness.port = port; return { load: vi.fn(async () => {}), close: vi.fn(), snapshot: vi.fn(() => ({})) };
}) }));
import { usePresentationVisualProposals, type PresentationVisualProposalOptions } from '../usePresentationVisualProposals';

const generation: ServerGenerationCapabilities = { profile: 'baseline', profiles: ['baseline', 'flare_candidate', 'sunburst_rescue'], qualities: ['low', 'medium', 'high'],
  executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 16000, remaining_outputs: 5, supports_full_design: true };
function fixture(): PresentationVisualProposalOptions {
  const req = request();
  const slide = { id: 'page', title: 'Portada', revision: 1, html: '<style>.slide{width:800px;height:450px}</style><main class="slide"></main>' };
  const destination = { document_type: 'cover' as const, page_id: slide.id, brand_id: 'brand-a' };
  const operation = buildPresentationImageOperation({ businessId: req.context.business_id, actorId: req.context.actor_id, documentId: 'cover-doc', slide,
    destination, region: { x: 0, y: 0, width: 800, height: 450 }, scope: 'full_design', approvedCopy: 'Texto literal', instruction: 'Diseñar una portada',
    operationKey: 'seed', generation, interactionMode: 'explore_design' });
  req.scope = 'full_design'; req.context = { ...operation.context, instruction: fullDesignLocalInstruction('Diseñar una portada', { width: 800, height: 450 }, null) };
  const session = finishExploration(beginExploration(createExplorationSession(req.context, 'full_design'), req), result());
  return { client: {} as any, businessId: req.context.business_id, documentId: 'cover-doc', slide, destination, scope: 'full_design', approvedCopy: 'Texto literal',
    capture: null, region: { x: 0, y: 0, width: 800, height: 450 }, session, prepareSession: vi.fn(async () => structuredClone(session)),
    prepareReferences: vi.fn(async () => []), imageSelection: { profile: 'flare_candidate', quality: 'medium' } };
}
function render(options: PresentationVisualProposalOptions) {
  harness.cursor = 0;
  // Custom hook harness intentionally executes the hook with mocked React primitives.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  usePresentationVisualProposals(options);
}
async function mount(options: PresentationVisualProposalOptions) {
  render(options); harness.effects.splice(0).forEach(effect => effect());
  await vi.waitFor(() => expect(harness.port).not.toBeNull());
}
beforeEach(() => { harness.refs = []; harness.cursor = 0; harness.effects = []; harness.port = null; });

describe('visual proposal hook snapshots image selections', () => {
  it('forwards all advertised selections to the same operation builder instead of its default low route', async () => {
    const options = fixture(); await mount(options);
    const candidate = createVisualProposalSet(options.session!, options.session!.sets[0].set_id).candidates[0];
    for (const profile of generation.profiles!) for (const quality of generation.qualities!) {
      const selected = { ...options, imageSelection: { profile, quality } }; render(selected);
      const source = await harness.port.getSource();
      const operation = await source.buildOperation(candidate, undefined, generation, `image-${profile}-${quality}`);
      expect(operation.image).toMatchObject({ profile, quality, executor: 'image_api' });
      expect(operation.context.immutable_elements).toContain('Texto aprobado, conservar literalmente:\nTexto literal');
      expect(operation.context.target.document_id).toBe('cover-doc');
    }
    expect(options.prepareReferences).toHaveBeenCalledTimes(9);
  });
  it('invalidates a prepared source when model or quality changes before dispatch', async () => {
    const options = fixture(); await mount(options);
    const source = await harness.port.getSource();
    render({ ...options, imageSelection: { profile: 'sunburst_rescue', quality: 'medium' } });
    await expect(source.assertCurrent()).rejects.toThrow('visual_proposal_context_changed');
    render(options);
    const nextSource = await harness.port.getSource();
    render({ ...options, imageSelection: { profile: 'flare_candidate', quality: 'high' } });
    await expect(nextSource.assertCurrent()).rejects.toThrow('visual_proposal_context_changed');
    expect(options.prepareReferences).not.toHaveBeenCalled();
  });
  it('rejects a selection change during asynchronous session preparation before preparing any references', async () => {
    const options = fixture(); await mount(options);
    let finish!: (session: NonNullable<PresentationVisualProposalOptions['session']>) => void;
    const pendingSession = new Promise<NonNullable<PresentationVisualProposalOptions['session']>>(resolve => { finish = resolve; });
    render({ ...options, prepareSession: () => pendingSession });
    const pendingSource = harness.port.getSource();
    render({ ...options, imageSelection: { profile: 'baseline', quality: 'low' } });
    finish(options.session!);
    await expect(pendingSource).rejects.toThrow('visual_proposal_context_changed');
    expect(options.prepareReferences).not.toHaveBeenCalled();
  });
});
