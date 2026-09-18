/** Read-only cloud boundary. No SDK, credentials, auth session, fetch or real provider. */
export const cloudCalls: Array<{ kind: string; target: string }> = [];

function forbidden(kind: string, target: string): never {
  cloudCalls.push({ kind, target });
  throw new Error(`El harness bloqueó una operación remota: ${kind}/${target}`);
}

export const supabase = {
  from(table: string) {
    if (table !== 'presentations') return forbidden('table', table);
    cloudCalls.push({ kind: 'read', target: table });
    const query = {
      select: (_columns?: string) => query,
      eq: (_column: string, _value: unknown) => query,
      order: (_column: string, _options?: unknown) => query,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
      insert: (_value: unknown) => forbidden('write', table),
      update: (_value: unknown) => forbidden('write', table),
      delete: () => forbidden('write', table),
    };
    return query;
  },
  functions: { invoke: async (name: string, _options?: unknown) => forbidden('provider', name) },
  rpc: async (name: string, _options?: unknown) => forbidden('rpc', name),
  auth: {
    getSession: async () => forbidden('auth', 'getSession'),
    getUser: async () => forbidden('auth', 'getUser'),
  },
  storage: { from: (bucket: string) => forbidden('storage', bucket) },
};
