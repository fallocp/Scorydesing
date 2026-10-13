import { describe, expect, it, vi } from 'vitest';
import { adaptTemplate, blankSlideHtml, insertSlideAfter, isAddSlideNewEnabled, isBlankSlide, newSlideDesignTarget, readTemplateAsIs, TEMPLATE_AS_IS_KEY,
  writeTemplateAsIs } from '../addSlide';
import { getSlideDimensions, normalizeSlides } from '../presentationDocument';
import { designScreenPath } from '../designScreenRoute';

const deck = normalizeSlides([{ title: 'Portada', html: '<main>Uno</main>' }, { title: 'Dos', html: '<main>Dos</main>' }, { title: 'Tres', html: '<main>Tres</main>' }]);

describe('agregar slide con el sistema de la presentación', () => {
  it('turns on only with VITE_DESAING_ADD_SLIDE_NEW=true (off = current menu)', () => {
    expect(isAddSlideNewEnabled({})).toBe(false);
    expect(isAddSlideNewEnabled({ VITE_DESAING_ADD_SLIDE_NEW: 'false' })).toBe(false);
    expect(isAddSlideNewEnabled({ VITE_DESAING_ADD_SLIDE_NEW: '1' })).toBe(false);
    expect(isAddSlideNewEnabled({ VITE_DESAING_ADD_SLIDE_NEW: 'true' })).toBe(true);
  });

  it('builds a valid empty slide of the deck canvas, with the system background, inserted right after the current one', () => {
    const html = blankSlideHtml({ canvas: { width: 1280, height: 720 }, background: { color: '#F5F3F0', image: 'radial-gradient(circle, #FF7A4A 0%, transparent 60%)' } });
    expect(getSlideDimensions(html)).toEqual({ width: 1280, height: 720 });
    expect(isBlankSlide(html)).toBe(true);
    expect(html).toContain('background-color: #F5F3F0'); expect(html).toContain('radial-gradient');
    const item = { id: 'nueva', revision: 1, title: 'Nueva diapositiva', html };
    const next = normalizeSlides(insertSlideAfter(deck, 1, item));
    expect(next.map(slide => slide.title)).toEqual(['Portada', 'Dos', 'Nueva diapositiva', 'Tres']);
    expect(next[2]).toMatchObject({ id: 'nueva', revision: 1 });
    expect(insertSlideAfter(deck, 2, item).at(-1)).toBe(item);
    // A measured value never closes the rule or the <style>; an invalid color falls back to white.
    const hostile = blankSlideHtml({ canvas: { width: 1920, height: 1080 }, background: { color: 'red;}</style><b>x', image: 'url(a)}</style>' } });
    expect(hostile).not.toMatch(/<\/style><b>/); expect(hostile).toContain('background-color: #FFFFFF');
    expect(isBlankSlide(hostile)).toBe(true);
  });

  it('places the deck logo where the deck uses it, escaped, and nothing else', () => {
    const html = blankSlideHtml({ canvas: { width: 1920, height: 1080 }, logo: { src: 'data:image/svg+xml,%3Csvg%3E" onerror="x', alt: 'Logo', x: 80.4, y: 60, width: 160, height: 40, slides: 2 } });
    expect(html).toContain('left:80px;top:60px;width:160px;height:40px');
    expect(html).toContain('&quot; onerror=&quot;x'); expect(isBlankSlide(html)).toBe(true);
  });

  it('«Nueva con IA» opens the design screen on the new slide, or the popup without the screen', () => {
    expect(newSlideDesignTarget({ screen: true, index: 2, path: number => designScreenPath('p1', number) })).toEqual({ kind: 'screen', path: '/presentaciones/p1/disenar/3' });
    expect(newSlideDesignTarget({ screen: false, index: 2, path: number => designScreenPath('p1', number) })).toEqual({ kind: 'popup' });
  });

  it('remembers «Usar plantilla tal cual»', () => {
    const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(readTemplateAsIs(storage)).toBe(false);
    writeTemplateAsIs(true, storage); expect(values.get(TEMPLATE_AS_IS_KEY)).toBe('true'); expect(readTemplateAsIs(storage)).toBe(true);
    expect(readTemplateAsIs({ getItem: () => { throw Error('blocked'); } })).toBe(false);
  });

  it('inserts the template as is, without measuring, when there is no system or detection is off', async () => {
    const measureSamples = vi.fn(), measureSheet = vi.fn(), html = '<style>.slide{width:1920px;height:1080px}</style><div class="slide">Plantilla</div>';
    const base = { html, canvas: { width: 1920, height: 1080 }, position: { index: 1, count: 4 }, brand: 'Marca', measureSamples, measureSheet };
    const off = await adaptTemplate({ ...base, lookup: { system: null, reason: 'off' } });
    expect(off).toMatchObject({ html, adapted: false }); expect(off.notice).toMatch(/tal cual.*apagada/);
    const none = await adaptTemplate({ ...base, lookup: { system: null, reason: 'none' } });
    expect(none.html).toBe(html); expect(none.notice).toMatch(/tal cual/);
    const flags = { deteccion: true, tokens: false, arquetipo: true, planner: true };
    const noTokens = await adaptTemplate({ ...base, lookup: { system: {} as any, flags } });
    expect(noTokens.html).toBe(html);
    const otherCanvas = await adaptTemplate({ ...base, canvas: { width: 1280, height: 720 }, lookup: { system: {} as any, flags: { ...flags, tokens: true } } });
    expect(otherCanvas.html).toBe(html); expect(otherCanvas.notice).toContain('1920×1080');
    expect(measureSamples).not.toHaveBeenCalled(); expect(measureSheet).not.toHaveBeenCalled();
  });
});
