import { describe, expect, it } from 'vitest';
import { designScreenPath, isDesignScreenEnabled, parseDesignScreenLocation, DRAFT_PROJECT } from '../designScreenRoute';

const params = (path: string) => {
  const url = new URL(path, 'https://app.invalid');
  const [, , projectId, , slideNumber] = url.pathname.split('/');
  return { params: { projectId: decodeURIComponent(projectId), slideNumber }, search: url.search };
};

describe('design screen route', () => {
  it('only VITE_DESAING_DESIGN_SCREEN=true turns the screen on; anything else keeps the popup', () => {
    expect(isDesignScreenEnabled({ VITE_DESAING_DESIGN_SCREEN: 'true' })).toBe(true);
    for (const value of [undefined, 'false', '1', 'TRUE', true]) expect(isDesignScreenEnabled({ VITE_DESAING_DESIGN_SCREEN: value })).toBe(false);
  });
  it('a reload of the URL keeps the slide, the session and the format', () => {
    const path = designScreenPath('deck-1', 3, { session: 'session-2', format: 'image' });
    expect(path).toBe('/presentaciones/deck-1/disenar/3?sesion=session-2&formato=imagen');
    const { params: route, search } = params(path);
    expect(parseDesignScreenLocation(route, search, 6)).toEqual({ projectId: 'deck-1', draft: false, slideIndex: 2, session: 'session-2', format: 'image' });
  });
  it('the main session and no format keep a clean URL', () => {
    expect(designScreenPath('deck-1', 1, { session: 'main' })).toBe('/presentaciones/deck-1/disenar/1');
    expect(parseDesignScreenLocation({ projectId: 'deck-1', slideNumber: '1' }, '')).toEqual({ projectId: 'deck-1', draft: false, slideIndex: 0 });
  });
  it('the unsaved deck has its own project id', () => {
    expect(designScreenPath(null, 2)).toBe(`/presentaciones/${DRAFT_PROJECT}/disenar/2`);
    expect(parseDesignScreenLocation({ projectId: DRAFT_PROJECT, slideNumber: '2' }, '')).toMatchObject({ projectId: null, draft: true, slideIndex: 1 });
  });
  it('clamps the slide to the deck and ignores unknown sessions or formats', () => {
    expect(parseDesignScreenLocation({ projectId: 'deck', slideNumber: '40' }, '?sesion=otra&formato=pdf', 5)).toEqual({ projectId: 'deck', draft: false, slideIndex: 4 });
    expect(parseDesignScreenLocation({ projectId: 'deck', slideNumber: 'x' }, '', 5)?.slideIndex).toBe(0);
    expect(parseDesignScreenLocation({ projectId: 'deck' }, '')).toBeNull();
  });
});
