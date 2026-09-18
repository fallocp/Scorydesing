/** Local-only fake cloud for the workspace browser flow; no fetch, SDK or credentials. */
import { cloudCalls } from './mockSupabase';
import { TEST_BUSINESS_ID } from './fixture';
type Row = { id: string; business_id: string; name: string; slides: unknown[]; created_at?: string; updated_at?: string };
const key = 'workspace-test-cloud-v1';
const controls = { failNextInsert: false, loseNextInsert: false, failReads: 0 };
const read = (): Row[] => JSON.parse(localStorage.getItem(key) ?? '[]');
const save = (rows: Row[]) => localStorage.setItem(key, JSON.stringify(rows));
Object.assign(window, { __workspaceCloud: { controls, read } });
const forbidden = (target: string): never => { throw new Error(`workspace_fixture_forbidden:${target}`); };
export const supabase = {
  from(table: string) {
    if (table !== 'presentations') return forbidden(table);
    const filters: Array<[string, unknown]> = []; let mutation: 'insert' | 'update' | null = null, payload: Partial<Row> | null = null;
    const execute = async (single: boolean) => {
      cloudCalls.push({ kind: mutation ?? 'read', target: table });
      if (!mutation && controls.failReads > 0) { controls.failReads--; return { data: null, error: { message: 'simulated_read_failure' } }; }
      const rows = read(), matches = (row: Row) => row.business_id === TEST_BUSINESS_ID && filters.every(([column, value]) => row[column as keyof Row] === value);
      if (mutation === 'insert') {
        if (controls.failNextInsert) { controls.failNextInsert = false; return { data: null, error: { message: 'simulated_insert_failure' } }; }
        if (!payload?.id || payload.business_id !== TEST_BUSINESS_ID || rows.some(row => row.id === payload!.id)) return { data: null, error: { message: 'simulated_conflict' } };
        const row = { ...structuredClone(payload), created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Row;
        rows.push(row); save(rows);
        if (controls.loseNextInsert) { controls.loseNextInsert = false; return { data: null, error: { message: 'simulated_lost_ack' } }; }
        return { data: single ? row : [row], error: null };
      }
      if (mutation === 'update') { for (const row of rows) if (matches(row)) Object.assign(row, payload, { updated_at: new Date().toISOString() }); save(rows); }
      const result = rows.filter(matches); return { data: single ? result[0] ?? null : result, error: null };
    };
    const query = {
      select: (_columns?: string) => query, eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: (_column: string, _options?: unknown) => query,
      insert: (value: Partial<Row>) => { mutation = 'insert'; payload = structuredClone(value); return query; },
      update: (value: Partial<Row>) => { mutation = 'update'; payload = structuredClone(value); return query; },
      delete: () => forbidden('delete'), maybeSingle: () => execute(true), single: () => execute(true),
      then: (resolve: (value: unknown) => unknown) => execute(false).then(resolve),
    };
    return query;
  },
  functions: { invoke: async (name: string) => forbidden(name) }, rpc: async (name: string) => forbidden(name),
  auth: { getSession: async () => forbidden('auth'), getUser: async () => forbidden('auth') },
  storage: { from: (name: string) => forbidden(name) },
};
