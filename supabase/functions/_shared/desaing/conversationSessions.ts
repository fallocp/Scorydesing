/** Three durable conversations share a canvas, never a generation history. */
export const DESIGN_CONVERSATION_SESSIONS = ['main', 'session-2', 'session-3'] as const;
export type DesignConversationSessionId = typeof DESIGN_CONVERSATION_SESSIONS[number];
export function isDesignConversationSessionId(value: unknown): value is DesignConversationSessionId {
  return typeof value === 'string' && (DESIGN_CONVERSATION_SESSIONS as readonly string[]).includes(value);
}
/** Main's first generation keeps the exact pre-session storage identity. */
export function designConversationSessionToken(session: DesignConversationSessionId, generation = 1): string | undefined {
  if (!isDesignConversationSessionId(session) || !Number.isSafeInteger(generation) || generation < 1 || generation > 1000000000)
    throw Error('invalid_conversation_session');
  return session === 'main' && generation === 1 ? undefined : `${session}:g${generation}`;
}
export function isDesignConversationSessionToken(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(main|session-2|session-3):g([1-9]\d{0,9})$/.exec(value);
  return !!match && Number(match[2]) <= 1000000000 && value !== 'main:g1';
}

export function withDesignConversationSession(session: string, token?: string): string {
  if (token === undefined) return session;
  if (!isDesignConversationSessionToken(token)) throw Error('invalid_conversation_session');
  const result = `${session}:conversation:${token}`;
  if (result.length > 200) throw Error('invalid_conversation_session');
  return result;
}
export function isDesignConversationSessionOf(session: string, base: string): boolean {
  return session === base || session.startsWith(`${base}:conversation:`)
    && isDesignConversationSessionToken(session.slice(`${base}:conversation:`.length)) && session.length <= 200;
}
