import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  states: [] as any[], cursor: 0, business: 'business-a', actor: 'actor-a',
  settings: { model: 'gpt-image-2.5-sunburst', quality: 'high' },
  objects: new Map<string, Blob>(), jobs: new Map<string, any>(), rows: new Map<string, any>(),
  generated: vi.fn(), recovered: vi.fn(), acknowledged: vi.fn(), upload: vi.fn(), download: vi.fn(),
  saveMockup: vi.fn(), saveEdition: vi.fn(), loadEdition: vi.fn(), invoke: vi.fn(), render: vi.fn(), html: vi.fn(),
  failMockup: false, failAlias: false, failEdition: false, calls: [] as string[],
}));
vi.mock('react', () => ({
  useState: (initial: any) => {
    const i = f.cursor++;
    if (!(i in f.states)) f.states[i] = typeof initial === 'function' ? initial() : initial;
    return [f.states[i], (next: any) => { f.states[i] = typeof next === 'function' ? next(f.states[i]) : next; }];
  },
  useRef: (initial: any) => { const i = f.cursor++; return f.states[i] ?? (f.states[i] = { current: initial }); },
  useCallback: (callback: unknown) => callback, useEffect: vi.fn(),
}));
vi.mock('../useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: f.business }) }));
vi.mock('../useAuth', () => ({ useAuth: () => ({ user: { id: f.actor } }) }));
vi.mock('../useImageGenerationSettings', () => ({ useImageGenerationSettings: () => ({ settings: f.settings, setSettings: vi.fn() }) }));
vi.mock('../useDesignMockups', () => ({ useSaveMockup: () => ({ mutateAsync: f.saveMockup }) }));
vi.mock('../useNewsEditions', () => ({
  useSaveNewsEdition: () => ({ mutateAsync: f.saveEdition }), useLoadNewsEdition: () => ({ mutateAsync: f.loadEdition }),
}));
vi.mock('@/lib/desaing/sharedImageGeneration', () => ({
  generateSharedDesignImage: f.generated, recoverSharedDesignImage: f.recovered, acknowledgeSharedDesignImage: f.acknowledged,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: f.actor } } }, error: null }) },
  functions: { invoke: f.invoke },
  storage: { from: () => ({ upload: f.upload, download: f.download, list: async () => ({ data: [], error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
  }) },
} }));
vi.mock('@/utils/design-studio/buildNewsSlideHtml', () => ({ buildNewsSlideHtml: f.html }));
vi.mock('@/utils/xendingDesign/canvasRenderer', () => ({ renderHtmlToPng: f.render }));

import { useNewsEdition } from '../useNewsEdition';
import { useFxKit } from '../useFxKit';

const operation = '10000000-0000-4000-8000-000000000001';
const edition = '20000000-0000-4000-8000-000000000001';
const article = '30000000-0000-4000-8000-000000000001';
const key = (scope: any) => `${scope.businessId}:${scope.process}:${scope.slotKey}`;
function render<T>(hook: () => T): T { f.cursor = 0; return hook(); }
const plan = { slide_number: 1, headline: 'Original headline', subcopy: 'Approved copy', source: ['Original source'] };
const visual = { slide_number: 1, generationSlotId: article, image_prompt: 'Original image prompt',
  visual_subject: 'Globe', domain: 'markets', archetype: 'hero', text_safe_area: 'left' };

beforeEach(() => {
  vi.clearAllMocks(); f.states = []; f.cursor = 0; f.business = 'business-a'; f.actor = 'actor-a';
  f.settings = { model: 'gpt-image-2.5-sunburst', quality: 'high' };
  f.objects.clear(); f.jobs.clear(); f.rows.clear(); f.failMockup = false; f.failAlias = false; f.failEdition = false; f.calls = [];
  f.generated.mockImplementation(async (request: any, scope: any) => {
    f.calls.push('generate');
    const result = { imageBase64: btoa('generated scene'), operation_key: operation, business_id: scope.businessId,
      actor_id: f.actor, asset_identity: 'asset:1', image_model: request.imageModel, image_quality: request.imageQuality,
      promptUsed: { promptFinal: request.promptFinal }, scope: structuredClone(scope) };
    f.jobs.set(key(scope), result); return result;
  });
  f.recovered.mockImplementation(async (scope: any) => f.jobs.get(key(scope)) ?? null);
  f.acknowledged.mockImplementation(async (result: any) => { f.calls.push('ack'); f.jobs.delete(key(result.scope)); });
  f.upload.mockImplementation(async (path: string, bytes: Blob, options: any) => {
    f.calls.push(`upload:${path}`);
    if (f.failAlias && path.includes('/fx-kit/')) return { error: { message: 'Lost upload acknowledgement' } };
    if (!options.upsert && f.objects.has(path)) return { error: { statusCode: '409', message: 'already exists' } };
    f.objects.set(path, bytes); return { error: null };
  });
  f.download.mockImplementation(async (path: string) => ({ data: f.objects.get(path) ?? null,
    error: f.objects.has(path) ? null : { statusCode: '404', message: 'not found' } }));
  f.saveMockup.mockImplementation(async (input: any) => {
    const id = input.mockupId ?? 'recomposed';
    const path = `${input.businessId ?? f.business}/mockups/${id}.png`;
    f.objects.set(path, new Blob([Uint8Array.from(atob(input.imageBase64), c => c.charCodeAt(0))]));
    if (f.failMockup) throw new Error('Lost metadata write acknowledgement');
    f.rows.set(id, input); f.calls.push('mockup');
    return { mockupId: id, imageUrl: `https://storage.test/${path}` };
  });
  f.saveEdition.mockImplementation(async (input: any) => {
    f.calls.push('edition'); if (f.failEdition) throw new Error('Cannot save edition');
    return { id: input.id };
  });
  f.loadEdition.mockResolvedValue({ id: edition, business_id: f.business, raw_input: 'Approved editorial input',
    edition_type: 'daily', input_format: 'markdown', normalized: null, slide_plan: [plan], visual_plan: [visual], slides: [] });
  f.html.mockImplementation((options: any) => JSON.stringify(options));
  f.render.mockImplementation(async (html: string) => `data:image/png;base64,${btoa(html)}`);
});

async function news() { const hook = render(useNewsEdition); await hook.loadEdition(edition); return render(useNewsEdition); }

describe('News generation through shared jobs', () => {
  it('saves a recoverable draft before generation and preserves scene reuse, effective settings and one mockup identity', async () => {
    const hook = await news();
    expect(await hook.generateSlide(1)).toBe(true);
    expect(f.calls[0]).toBe('edition'); expect(f.calls.indexOf('generate')).toBeGreaterThan(0);
    expect(f.generated).toHaveBeenCalledWith(expect.objectContaining({ promptFinal: visual.image_prompt,
      imageModel: 'gpt-image-2.5-sunburst', imageQuality: 'high' }), expect.objectContaining({ process: 'news', slotKey: `${edition}:${article}` }));
    expect(f.saveMockup).toHaveBeenCalledWith(expect.objectContaining({ mockupId: operation, businessId: 'business-a', actorId: 'actor-a' }));
    expect(f.objects.has(`business-a/news-scenes/${operation}.png`)).toBe(true);
    expect(f.calls.at(-1)).toBe('ack'); expect(f.calls.at(-2)).toBe('edition');
    expect(f.saveEdition.mock.calls.at(-1)![0].visualPlan[0]).not.toHaveProperty('sceneBase64');
    expect(render(useNewsEdition).slides[0].sceneUrl).toContain(operation);
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it('recovers a failed metadata save with original scene, composition and model after copy or settings changed', async () => {
    let hook = await news(); f.failMockup = true;
    expect(await hook.generateSlide(1)).toBe(false); expect(f.acknowledged).not.toHaveBeenCalled();
    hook.updateSlideText(1, { headline: 'Changed after failure' });
    f.settings = { model: 'gpt-image-2', quality: 'low' }; f.failMockup = false;
    hook = render(useNewsEdition);
    expect(await hook.generateSlide(1)).toBe(true);
    expect(f.generated).toHaveBeenCalledTimes(1); expect(f.render).toHaveBeenCalledTimes(1);
    expect(atob(f.saveMockup.mock.calls.at(-1)![0].imageBase64)).toContain('Original headline');
    expect(f.rows.size).toBe(1); expect(f.acknowledged).toHaveBeenCalledTimes(1);
    const calls = f.generated.mock.calls.length;
    expect(await render(useNewsEdition).recomposeSlide(1)).toBe(true);
    expect(f.generated).toHaveBeenCalledTimes(calls);
    expect(atob(f.saveMockup.mock.calls.at(-1)![0].imageBase64)).toContain('Changed after failure');
  });

  it('makes no image call if the recovery draft cannot be saved and excludes a double click', async () => {
    const hook = await news(); f.failEdition = true;
    const first = hook.generateSlide(1);
    expect(await hook.generateSlide(1)).toBe(false);
    expect(await first).toBe(false);
    expect(f.generated).not.toHaveBeenCalled();
  });

  it('reopens an interrupted saved edition as recoverable rather than permanently disabled', async () => {
    const row = await f.loadEdition(); row.slides = [{ slide_number: 1, status: 'generating' }];
    f.loadEdition.mockResolvedValue(row);
    const hook = await news(); expect(hook.slides[0].status).toBe('error');
    expect(await hook.generateSlide(1)).toBe(true);
    expect(f.generated.mock.calls[0][1].slotKey).toBe(`${edition}:${article}`);
  });

  it('stops a News batch and hides previous content immediately when its actor changes', async () => {
    const row = await f.loadEdition();
    row.visual_plan.push({ ...visual, slide_number: 2, generationSlotId: 'article-2' });
    row.slide_plan.push({ ...plan, slide_number: 2 }); f.loadEdition.mockResolvedValue(row);
    const hook = await news();
    const implementation = f.generated.getMockImplementation()!;
    f.generated.mockImplementation(async (...args: any[]) => {
      const result = await implementation(...args); f.actor = 'actor-b';
      expect(render(useNewsEdition).slides).toEqual([]); return result;
    });
    await hook.generateAll();
    expect(f.generated).toHaveBeenCalledTimes(1);
    expect(f.generated.mock.calls[0][1].actorId).toBe('actor-a');
    expect(f.upload).not.toHaveBeenCalled(); expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('does not patch a different edition after a late acknowledgement fails in the same business', async () => {
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { reached = resolve; });
    const delayed = new Promise<void>(resolve => { release = resolve; });
    f.saveEdition.mockImplementationOnce(async (input: any) => ({ id: input.id }))
      .mockImplementationOnce(async (input: any) => { reached(); await delayed; return { id: input.id }; });
    f.acknowledged.mockRejectedValueOnce(new Error('Lost acknowledgement'));
    const hook = await news(); const generation = hook.generateSlide(1);
    await waiting;
    f.loadEdition.mockResolvedValue({ id: 'new-edition', business_id: f.business, raw_input: 'New input', edition_type: 'daily',
      normalized: null, slide_plan: [{ ...plan, headline: 'New edition' }], visual_plan: [{ ...visual, generationSlotId: 'new-article' }], slides: [] });
    expect(await render(useNewsEdition).loadEdition('new-edition')).toBe(true);
    release(); expect(await generation).toBe(false);
    const current = render(useNewsEdition);
    expect(current.editionId).toBe('new-edition'); expect(current.slides[0].status).toBe('idle');
    expect(current.slides[0].error).toBeUndefined();
  });
});

describe('FX kit shared job persistence', () => {
  it('recovers an upload failure with the original job despite settings changes and keeps the reusable alias', async () => {
    let hook = render(useFxKit); f.failAlias = true;
    expect(await hook.generateObject('hero')).toBe(false);
    expect(f.objects.has(`business-a/fx-kit-versions/hero/${operation}.png`)).toBe(true);
    expect(f.acknowledged).not.toHaveBeenCalled();
    f.failAlias = false; f.settings = { model: 'gpt-image-2', quality: 'low' }; hook = render(useFxKit);
    expect(await hook.generateObject('hero')).toBe(true);
    expect(f.generated).toHaveBeenCalledTimes(1); expect(f.recovered).toHaveBeenCalledTimes(2);
    expect(f.objects.has('business-a/fx-kit/hero.png')).toBe(true);
    expect(f.calls.at(-1)).toBe('ack'); expect(f.invoke).not.toHaveBeenCalled();
    expect(render(useFxKit).urls.hero).toContain('/fx-kit/hero.png');
  });

  it('does not write the alias or acknowledge when the actor changes during generation', async () => {
    const implementation = f.generated.getMockImplementation()!;
    f.generated.mockImplementation(async (...args: any[]) => { const result = await implementation(...args); f.actor = 'actor-b'; return result; });
    expect(await render(useFxKit).generateObject('hero')).toBe(false);
    expect(f.upload).not.toHaveBeenCalled(); expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('prevents duplicate clicks while one kit object is generating', async () => {
    const hook = render(useFxKit);
    const first = hook.generateObject('hero');
    expect(await hook.generateObject('hero')).toBe(false);
    expect(await first).toBe(true); expect(f.generated).toHaveBeenCalledTimes(1);
  });

  it.each(['business', 'actor'])('stops the FX batch before the next object after a %s switch', async (changed) => {
    const hook = render(useFxKit), implementation = f.generated.getMockImplementation()!;
    f.generated.mockImplementation(async (...args: any[]) => {
      const result = await implementation(...args);
      if (changed === 'business') f.business = 'business-b'; else f.actor = 'actor-b';
      expect(render(useFxKit).urls).toEqual({}); return result;
    });
    await hook.generateMissing();
    expect(f.generated).toHaveBeenCalledTimes(1); expect(f.generated.mock.calls[0][1].actorId).toBe('actor-a');
    expect(f.upload).not.toHaveBeenCalled(); expect(f.acknowledged).not.toHaveBeenCalled();
  });

  it('does not publish a late manual replacement into another business UI', async () => {
    const implementation = f.upload.getMockImplementation()!;
    f.upload.mockImplementation(async (...args: any[]) => {
      const result = await implementation(...args); f.business = 'business-b'; render(useFxKit); return result;
    });
    expect(await render(useFxKit).replaceObject('hero', new Blob(['manual image']) as File)).toBe(false);
    expect(f.objects.has('business-a/fx-kit/hero.png')).toBe(true);
    expect(f.objects.has('business-b/fx-kit/hero.png')).toBe(false);
    expect(render(useFxKit).urls).toEqual({});
  });
});
