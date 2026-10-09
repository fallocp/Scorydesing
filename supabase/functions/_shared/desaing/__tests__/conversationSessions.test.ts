import { describe, expect, it } from 'vitest';
import { DESIGN_CONVERSATION_SESSIONS, designConversationSessionToken, isDesignConversationSessionOf,
  isDesignConversationSessionToken, withDesignConversationSession } from '../conversationSessions.ts';
import { designSurfaceSessionId, designSurfaceTarget, designSurfaceWorkspace } from '../designSurface.ts';
import { fullDesignImmutables, fullDesignLocalInstruction, readPresentationFullDesign } from '../presentationFullDesign.ts';
import { request } from './fixtures/explorationFixture.ts';

describe('isolated conversation generation sessions', () => {
  it('keeps the existing first session and gives other slots and reset generations distinct identities', () => {
    const base = designSurfaceSessionId('deck', 'slide', 'full_design');
    expect(DESIGN_CONVERSATION_SESSIONS).toEqual(['main', 'session-2', 'session-3']);
    expect(designConversationSessionToken('main')).toBeUndefined();
    expect(withDesignConversationSession(base, designConversationSessionToken('main'))).toBe(base);
    const isolated = [designConversationSessionToken('main', 2), designConversationSessionToken('session-2'),
      designConversationSessionToken('session-2', 2), designConversationSessionToken('session-3')].map(token => withDesignConversationSession(base, token));
    expect(new Set([base, ...isolated]).size).toBe(5);
    expect(isolated.every(session => isDesignConversationSessionOf(session, base))).toBe(true);
    expect(isolated.every(session => !isDesignConversationSessionOf(session, designSurfaceSessionId('deck', 'another', 'full_design')))).toBe(true);
  });

  it.each(['main:g1', 'session-4:g1', 'session-2:g0', 'session-2:g01', 'session-2:g-1', 'session-2:g1.5',
    'session-2:g1000000001', 'session-2:g1:extra', 'session-2:g1\n', '', 'main', 'session-2'])('rejects noncanonical token %j', token => {
    expect(isDesignConversationSessionToken(token)).toBe(false);
    expect(() => withDesignConversationSession('base', token)).toThrow('invalid_conversation_session');
    expect(isDesignConversationSessionOf(`base:conversation:${token}`, 'base')).toBe(false);
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 1000000001])('rejects invalid generation %s', generation => {
    expect(() => designConversationSessionToken('session-2', generation)).toThrow('invalid_conversation_session');
  });

  it('rejects a session namespace that exceeds the operation identity limit', () => {
    expect(() => withDesignConversationSession('a'.repeat(200), 'session-2:g1')).toThrow('invalid_conversation_session');
    expect(isDesignConversationSessionOf(`${'a'.repeat(200)}:conversation:session-2:g1`, 'a'.repeat(200))).toBe(false);
  });

  it.each([undefined, { document_type: 'cover' as const, page_id: 'slide' }, { document_type: 'page' as const, page_id: 'slide' }])(
    'accepts another chat only for its actual full-design destination %j', destination => {
      const canvas = { width: 1920, height: 1080 }, copy = 'Contenido aprobado', context = request().context;
      const base = designSurfaceSessionId('deck', 'slide', 'full_design', destination);
      Object.assign(context, { workspace: designSurfaceWorkspace(destination), project_id: 'deck',
        target: designSurfaceTarget('deck', { id: 'slide', revision: 1 }, destination),
        instruction: fullDesignLocalInstruction('Conservar la composición.', canvas), immutable_elements: fullDesignImmutables(copy, canvas),
        session_id: withDesignConversationSession(base, 'session-2:g1') });
      expect(readPresentationFullDesign(context)).toEqual({ canvas, approvedCopy: copy });
      const otherBase = designSurfaceSessionId('deck', 'other-slide', 'full_design', destination ? { ...destination, page_id: 'other-slide' } : undefined);
      expect(() => readPresentationFullDesign({ ...context, session_id: withDesignConversationSession(otherBase, 'session-2:g1') }))
        .toThrow('invalid_full_design_context');
      expect(() => readPresentationFullDesign({ ...context, session_id: `${base}:conversation:session-4:g1` })).toThrow('invalid_full_design_context');
    });
});
