import { describe, expect, it } from 'vitest';
import { fetchBusinessContext, fetchMasterPromptByType } from '../fetchBusinessContext';
import { validatePipelineReadiness } from '../validatePipelineReadiness';

const business = 'a0000000-0000-0000-0000-000000000001';
type Row = Record<string, unknown>;
/** Query semantics over mixed families, so removing a filter changes the result. */
function database(prompts: Row[]) {
  const tables: Record<string, Row[]> = {
    master_prompts: prompts,
    business_tenants: [{ id: business, is_active: true, name: 'Marca', slug: 'marca', logo_url: '/logo', primary_color: '#123456' }],
    commercial_branches: [{ business_id: business, is_active: true }],
  };
  return { from(table: string) {
    let rows = [...(tables[table] ?? [])], head = false;
    const order: { key: string; ascending: boolean }[] = [];
    const result = () => ({ data: head ? null : rows, count: rows.length, error: null });
    const query = {
      select(_fields: string, options?: { head?: boolean }) { head = options?.head ?? false; return query; },
      eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
      order(key: string, options: { ascending: boolean }) { order.push({ key, ascending: options.ascending }); return query; },
      limit(count: number) {
        rows.sort((a, b) => {
          for (const { key, ascending } of order) {
            const left = a[key] as string | number, right = b[key] as string | number;
            if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        rows = rows.slice(0, count); return query;
      },
      single: async () => ({ ...result(), data: rows[0] ?? null }),
      maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    return query;
  } } as unknown as Parameters<typeof fetchBusinessContext>[0];
}
const prompt = (prompt_type: string, version: number, prompt_text: string, business_id = business): Row =>
  ({ id: `${prompt_type}-${version}`, business_id, prompt_type, version, prompt_text, created_at: '2026-09-18T00:00:00Z' });

describe('Master prompt family isolation', () => {
  it('keeps general context when image/style versions are higher or belong to another business', async () => {
    const db = database([prompt('general', 1, 'Anterior'), prompt('general', 2, 'General correcto'),
      prompt('image', 99, 'Sólo imagen'), prompt('image_style:icon_3d', 150, 'Sólo estilo'), prompt('general', 200, 'Otro negocio', 'foreign')]);
    expect((await fetchBusinessContext(db, business)).masterPrompt).toBe('General correcto');
    expect(await fetchMasterPromptByType(db, business, 'image')).toBe('Sólo imagen');
  });
  it('does not substitute an image prompt when general is absent', async () => {
    const db = database([prompt('image', 99, 'Sólo imagen')]);
    expect((await fetchBusinessContext(db, business)).masterPrompt).toBeNull();
    const readiness = await validatePipelineReadiness(db, business);
    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain('master_prompt');
  });
  it('recognizes general even when a newer unrelated family exists', async () => {
    const db = database([prompt('general', 1, 'General'), prompt('channel_adapter', 25, 'Adaptador')]);
    expect((await validatePipelineReadiness(db, business)).missing).not.toContain('master_prompt');
  });
});
