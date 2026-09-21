import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignBrandContext, DesignBrandReader } from '../designBrandContext';

// Only React scheduling is substituted; actual hook effects and async invalidation are exercised.
const harness = vi.hoisted(() => ({ states: [] as any[], cursor: 0, dependencies: null as unknown[] | null,
  effect: null as (() => void | (() => void)) | null, cleanup: null as (() => void) | null }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: any) => { harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value; }];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (!harness.dependencies || deps.some((value, i) => value !== harness.dependencies![i])) {
      harness.effect = effect; harness.dependencies = deps;
    }
  },
}));
import { useDesignBrandContext } from '../useDesignBrandContext';

const businessA = 'a0000000-0000-0000-0000-000000000001', businessB = 'a0000000-0000-0000-0000-000000000002';
const snapshot = (business_id: string) => ({ business_id, name: business_id, fingerprint: 'a'.repeat(64) }) as DesignBrandContext;
function render(businessId = businessA, reader?: DesignBrandReader) {
  harness.cursor = 0;
  // Custom hook harness intentionally executes the hook with mocked React primitives.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDesignBrandContext(businessId, reader);
}
function flush() {
  if (!harness.effect) return;
  harness.cleanup?.(); harness.cleanup = harness.effect() || null; harness.effect = null;
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => { harness.cleanup?.(); harness.states = []; harness.cursor = 0; harness.dependencies = null; harness.effect = null; harness.cleanup = null; });

describe('brand snapshot hook isolation', () => {
  it('can mount without a reader/provider and makes no implicit network or Supabase requests', () => {
    expect(render()).toMatchObject({ status: 'idle', context: null, error: '' });
    flush(); expect(render()).toMatchObject({ status: 'idle', context: null });
  });

  it('hides the old business before effects run and ignores a late result after changing business', async () => {
    let finishA!: (value: DesignBrandContext) => void;
    const reader: DesignBrandReader = { read: vi.fn(businessId => businessId === businessA
      ? new Promise<DesignBrandContext>(resolve => { finishA = resolve; }) : Promise.resolve(snapshot(businessB))) };
    render(businessA, reader); flush();
    expect(render(businessB, reader)).toMatchObject({ status: 'loading', context: null }); flush(); await settle();
    expect(render(businessB, reader)).toMatchObject({ status: 'ready', context: { business_id: businessB } });
    finishA(snapshot(businessA)); await settle();
    expect(render(businessB, reader)).toMatchObject({ status: 'ready', context: { business_id: businessB } });
  });

  it('never carries a previous reader/session snapshot into a new reader and exposes a useful retry', async () => {
    const original = { read: vi.fn(async () => snapshot(businessA)) };
    render(businessA, original); flush(); await settle(); expect(render(businessA, original).context?.business_id).toBe(businessA);
    const replacement = { read: vi.fn<DesignBrandReader['read']>().mockRejectedValueOnce(new Error('private error')).mockResolvedValue(snapshot(businessA)) };
    expect(render(businessA, replacement)).toMatchObject({ status: 'loading', context: null }); flush(); await settle();
    const failed = render(businessA, replacement);
    expect(failed.status).toBe('error'); expect(failed.error).not.toContain('private error');
    failed.refresh(); render(businessA, replacement); flush(); await settle();
    expect(render(businessA, replacement)).toMatchObject({ status: 'ready', context: { business_id: businessA } });
    expect(replacement.read).toHaveBeenCalledTimes(2);
  });

  it('rejects an injected reader that returns another business and clears the context', async () => {
    const reader = { read: async () => snapshot(businessB) };
    render(businessA, reader); flush(); await settle();
    expect(render(businessA, reader)).toMatchObject({ status: 'error', context: null });
  });
});
