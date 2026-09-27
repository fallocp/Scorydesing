import { executeServerCommand, serverErrorResponse, ServerBoundaryError, type ServerRepository } from './serverRepository.ts';
import { boundedBody, parseServerRequest } from './serverRequest.ts';
import type { ServerStateReadConfig } from './serverStateRead.ts';
import { readServerStateWithCapabilities } from './serverStateRead.ts';

export interface ServerStateHttpDependencies {
  enabled: boolean;
  allowedOrigins: readonly string[];
  authenticate(token: string): Promise<{ id: string } | null>;
  repository: ServerRepository;
  generation: ServerStateReadConfig;
}

/** State-only boundary: no image provider, storage, HTML, exploration or production dependencies. */
export function createServerStateHandler(deps: ServerStateHttpDependencies) {
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
      if (!url.pathname.endsWith('/desaing-state') && !url.pathname.endsWith('/desaing-state/')) {
        throw new ServerBoundaryError('route_not_found', 404);
      }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
        throw new ServerBoundaryError('json_required', 415);
      }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBody(request, 262144))); }
      catch (error) { if (error instanceof ServerBoundaryError) throw error; throw new ServerBoundaryError('invalid_json'); }
      const parsed = parseServerRequest(body);
      if (parsed.command.kind === 'read') {
        return reply(200, await readServerStateWithCapabilities(deps.repository, deps.generation, parsed.businessId, actor.id));
      }
      if (parsed.command.kind === 'enqueue') throw new ServerBoundaryError('route_not_found', 404);
      return reply(200, await executeServerCommand(deps.repository, parsed.businessId, actor.id, parsed.command));
    } catch (error) {
      const response = serverErrorResponse(error);
      return reply(response.status, { error: response.code });
    }
  };
}
