import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopyBankItem } from '../useDesignCopyBank';
import type { SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';

// Exercise the hook's actual asynchronous save path without a browser or providers.
const harness = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effectDeps: null as unknown[] | null,
  effect: null as (() => void) | null,
  businessId: 'business-a',
  generate: vi.fn(), recover: vi.fn(), acknowledge: vi.fn(), save: vi.fn(), persist: vi.fn(), invoke: vi.fn(),
  events: [] as string[],
}));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: unknown) => {
      harness.values[index] = typeof value === 'function' ? value(harness.values[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = { current: initial };
    return harness.values[index];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void, deps: unknown[]) => {
    if (!harness.effectDeps || deps.some((value, index) => value !== harness.effectDeps![index])) {
      harness.effect = effect; harness.effectDeps = deps;
    }
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: harness.invoke } } }));
vi.mock('../useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: harness.businessId }) }));
vi.mock('../useImageGenerationSettings', () => ({ useImageGenerationSettings: () => ({
  settings: { model: 'gpt-image-2.5-sunburst', quality: 'high' }, setSettings: vi.fn(),
}) }));
vi.mock('../useDesignMockups', () => ({ useSaveMockup: () => ({ mutateAsync: harness.save }) }));
vi.mock('../useDesignCopyBank', () => ({ useUpdateBankMeta: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/lib/desaing/sharedImageGeneration', () => ({
  generateSharedDesignImage: harness.generate, acknowledgeSharedDesignImage: harness.acknowledge,
  recoverSharedDesignImage: harness.recover,
}));

import { useCarouselQueue } from '../useCarouselQueue';

const operation = '10000000-0000-4000-8000-000000000001';
const output = {
  imageBase64: btoa('rendered PNG'), promptUsed: { promptFinal: 'Exact approved prompt', negativeInstructions: '' },
  image_model: 'gpt-image-2.5-sunburst', image_quality: 'high', operation_key: operation,
  asset_identity: 'shared-asset', business_id: 'business-a', actor_id: 'original-actor',
  imageLibraryId: 'existing-library-id',
  scope: { businessId: 'business-a', process: 'carousel', slotKey: 'bank-a:bank-a-slide-0:foto', consumerContext: {
    slotId: 'bank-a-slide-0', groupId: 'stable-group',
    slideCopy: { headline: 'Original headline', body: 'Original body', cta: 'Original CTA' }, imageIntent: 'Original globe',
  } },
} as unknown as SharedDesignImageResult;

function bank(id = 'bank-a', count = 1): CopyBankItem {
  return {
    row: { id, headline: 'Seed headline', subcopy: '', cta: '', vertical_id: 'vertical-a' },
    meta: { angleName: 'approved-angle', carousel: {
      presetSlug: 'tension-shift-risk-solution-cta', groupId: 'stable-group',
      visualAnchor: 'Approved brand style', visualMotif: 'Globe', imageType: 'foto',
      slots: Array.from({ length: count }, (_, index) => ({
        id: `${id}-slide-${index}`, index, role: 'tension',
        slideCopy: { headline: `Headline ${index}`, body: '', cta: '' },
        imageIntent: 'Keep globe', prompt: 'Exact approved prompt',
        brandElements: ['logo'], status: 'idle',
      })),
    } },
  } as unknown as CopyBankItem;
}
function render(item: CopyBankItem) {
  harness.cursor = 0;
  return useCarouselQueue({
    bankItem: item, branchId: 'branch-a', branchSlug: 'pagos-internacionales',
    background: null, imageType: 'foto', brandSlug: 'xending', persistMeta: harness.persist,
  });
}
function mount(item: CopyBankItem) {
  render(item); harness.effect?.(); harness.effect = null; return render(item);
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.values = []; harness.cursor = 0; harness.effectDeps = null; harness.effect = null;
  harness.businessId = 'business-a'; harness.events = [];
  harness.generate.mockImplementation(async () => { harness.events.push('generate'); return output; });
  harness.recover.mockResolvedValue(output);
  harness.save.mockImplementation(async () => {
    harness.events.push('save'); return { mockupId: operation, imageUrl: 'https://storage.test/image.png', businessId: 'business-a' };
  });
  harness.persist.mockImplementation(async () => { harness.events.push('persist'); });
  harness.acknowledge.mockImplementation(async () => { harness.events.push('ack'); });
});

describe('carousel shared generation', () => {
  it('uses the approved prompt and visible model, then saves the frozen identity before acknowledgement', async () => {
    const item = bank();
    expect(await mount(item).generateSlot(0)).toBe(true);
    expect(harness.generate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'generate', promptFinal: 'Exact approved prompt', imageType: 'fotografia',
      business_id: 'business-a', imageModel: 'gpt-image-2.5-sunburst', imageQuality: 'high',
    }), { businessId: 'business-a', process: 'carousel', slotKey: 'bank-a:bank-a-slide-0:foto', consumerContext: {
      slotId: 'bank-a-slide-0', groupId: 'stable-group',
      slideCopy: { headline: 'Headline 0', body: '', cta: '' }, imageIntent: 'Keep globe',
    } });
    expect(harness.invoke).not.toHaveBeenCalled();
    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      mockupId: operation, businessId: 'business-a', actorId: 'original-actor',
      imageLibraryId: 'existing-library-id', promptUsed: output.promptUsed.promptFinal,
      carouselGroupId: 'stable-group', carouselIndex: 0,
      selections: { image_generation: expect.objectContaining({ model: output.image_model, quality: 'high' }) },
    }));
    expect(harness.events).toEqual(['generate', 'save', 'persist', 'ack']);
    const persisted = harness.persist.mock.calls[0][0].carousel.slots[0];
    expect(persisted).toMatchObject({ status: 'done', mockupId: operation });
    expect(persisted).not.toHaveProperty('imageBase64');
    expect(render(item).slots[0].imageBase64).toBe(output.imageBase64);
  });

  it('does not acknowledge a failed slide-pointer save and retries with the same operation slot', async () => {
    const item = bank();
    harness.persist.mockRejectedValueOnce(new Error('Connection lost after render'));
    expect(await mount(item).generateSlot(0)).toBe(false);
    expect(harness.acknowledge).not.toHaveBeenCalled();
    expect(render(item).slots[0].status).toBe('error');
    expect(await render(item).generateSlot(0)).toBe(true);
    expect(harness.generate.mock.calls[1][1]).toEqual(harness.generate.mock.calls[0][1]);
    expect(harness.save.mock.calls[1][0].mockupId).toBe(harness.save.mock.calls[0][0].mockupId);
    expect(harness.acknowledge).toHaveBeenCalledOnce();
  });

  it('blocks same-tick double clicks and keeps a pending result recoverable after a business switch', async () => {
    const item = bank();
    let finish!: (value: SharedDesignImageResult) => void;
    harness.generate.mockReturnValueOnce(new Promise<SharedDesignImageResult>(resolve => { finish = resolve; }));
    const queue = mount(item);
    const first = queue.generateSlot(0);
    expect(await queue.generateSlot(0)).toBe(false);
    expect(harness.generate).toHaveBeenCalledOnce();
    harness.businessId = 'business-b';
    const next = bank('bank-b'); mount(next);
    finish(output);
    expect(await first).toBe(false);
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.acknowledge).not.toHaveBeenCalled();
    expect(render(next).slots[0]).toMatchObject({ id: 'bank-b-slide-0', status: 'idle' });
  });

  it('uses the same shared path for a sequence and stops on an unresolved render', async () => {
    const item = bank('bank-a', 3);
    harness.generate.mockResolvedValueOnce(output).mockRejectedValueOnce(new Error('Generation pending; recover before retrying'));
    await mount(item).generateAll();
    expect(harness.generate).toHaveBeenCalledTimes(2);
    expect(harness.generate.mock.calls.map(call => call[1].slotKey)).toEqual([
      'bank-a:bank-a-slide-0:foto', 'bank-a:bank-a-slide-1:foto',
    ]);
    expect(harness.acknowledge).toHaveBeenCalledOnce();
    expect(render(item).slots.map(slot => slot.status)).toEqual(['done', 'error', 'idle']);
  });

  it('explicit recovery restores the frozen slide copy and prompt without dispatching a new image', async () => {
    const item = bank();
    const queue = mount(item);
    queue.updateSlideCopy(0, 'headline', 'New edited text');
    queue.updateSlotPrompt(0, 'An edited prompt');
    expect(await render(item).recoverSlot(0)).toBe(true);
    expect(harness.generate).not.toHaveBeenCalled();
    expect(harness.recover).toHaveBeenCalledWith({
      businessId: 'business-a', process: 'carousel', slotKey: 'bank-a:bank-a-slide-0:foto',
    });
    expect(render(item).slots[0]).toMatchObject({
      prompt: output.promptUsed.promptFinal, imageIntent: 'Original globe', status: 'done',
      slideCopy: { headline: 'Original headline', body: 'Original body', cta: 'Original CTA' },
    });
    expect(harness.events).toEqual(['save', 'persist', 'ack']);
  });

  it('does not save or acknowledge a recovered image whose frozen slide context belongs elsewhere', async () => {
    const item = bank();
    harness.recover.mockResolvedValueOnce({
      ...output, scope: { ...output.scope, consumerContext: { ...output.scope.consumerContext, slotId: 'another-slide' } },
    });
    expect(await mount(item).recoverSlot(0)).toBe(false);
    expect(harness.generate).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
    expect(harness.acknowledge).not.toHaveBeenCalled();
  });
});
