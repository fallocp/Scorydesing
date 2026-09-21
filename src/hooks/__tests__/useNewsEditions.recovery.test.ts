import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ actor: 'actor-a', from: vi.fn(), upsert: vi.fn(), update: vi.fn(), insert: vi.fn(),
  eq: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: f.actor } } }, error: null }) }, from: f.from,
} }));
vi.mock('../useActiveBusiness', () => ({ useActiveBusiness: () => ({ activeBusinessId: 'new-business' }) }));
vi.mock('../useAuth', () => ({ useAuth: () => ({ user: { id: f.actor } }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: any) => ({ mutateAsync: mutationFn }),
}));
import { useSaveNewsEdition, type SaveNewsEditionInput } from '../useNewsEditions';
const input: SaveNewsEditionInput = { id: '20000000-0000-4000-8000-000000000001', createIfMissing: true,
  businessId: 'original-business', actorId: 'actor-a', editionType: 'daily', rawInput: 'Approved input',
  inputFormat: null, slidePlan: [], visualPlan: [], slides: [] };
beforeEach(() => {
  vi.clearAllMocks(); f.actor = 'actor-a';
  for (const fn of [f.from, f.upsert, f.update, f.insert, f.eq, f.select]) fn.mockReturnValue(f);
  f.single.mockResolvedValue({ data: { id: input.id }, error: null });
});
describe('recoverable News draft writes', () => {
  it('reuses the reserved edition id after a lost save response in the frozen business', async () => {
    const save = useSaveNewsEdition();
    f.single.mockResolvedValueOnce({ data: null, error: { message: 'Connection lost' } });
    await expect(save.mutateAsync(input)).rejects.toThrow('Connection lost');
    await expect(save.mutateAsync(input)).resolves.toEqual({ id: input.id });
    expect(f.upsert).toHaveBeenCalledTimes(2);
    expect(f.upsert.mock.calls[1][0]).toMatchObject({ id: input.id, business_id: 'original-business', created_by: 'actor-a' });
    expect(f.insert).not.toHaveBeenCalled();
  });
  it('does not reassign the owner or tenant when updating an existing team edition', async () => {
    await useSaveNewsEdition().mutateAsync({ ...input, createIfMissing: false });
    expect(f.update.mock.calls[0][0]).not.toHaveProperty('created_by');
    expect(f.update.mock.calls[0][0]).not.toHaveProperty('business_id');
    expect(f.eq).toHaveBeenCalledWith('business_id', 'original-business');
  });
  it('rejects an actor switch before any write', async () => {
    f.actor = 'actor-b';
    await expect(useSaveNewsEdition().mutateAsync(input)).rejects.toThrow('La sesión cambió');
    expect(f.from).not.toHaveBeenCalled();
  });
});
