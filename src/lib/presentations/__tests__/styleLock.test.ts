import { describe, expect, it, vi } from 'vitest';
import { applyStyleLock, buildStyleLockCss, compareStyleSamples, describeStyleLock, enforceStyleLock, inferStyleUnlocks, releaseStyleLock } from '../styleLock';
import type { StyleSamples, TextSample } from '../styleSpec';

const text = (value: string, size: number, selector: string, extra: Partial<TextSample> = {}): TextSample =>
  ({ text: value, family: 'Montserrat', size, weight: 700, italic: false, upper: false, color: 'rgb(11, 42, 91)', align: 'left', area: 100, selector, ...extra });
const design = (title: number, cardBackground = 'rgb(255, 255, 255)', titleSelector = '.title'): StyleSamples => ({
  canvas: { width: 1920, height: 1080 }, background: 'rgb(255, 255, 255)', images: [],
  texts: [text('Beneficios', title, titleSelector), text('Texto de apoyo con varias palabras', 22, '.lead', { family: 'Poppins', weight: 400 })],
  boxes: [{ rect: { x: 0, y: 0, width: 400, height: 200 }, background: cardBackground, radius: 16, shadow: '', border: '', padding: '', texts: [], images: [], selector: '.card' }],
});
const doc = '<!doctype html><html><head><style>.title{font-size:64px}</style></head><body><div class="slide"><h1 class="title">Beneficios</h1></div></body></html>';

describe('candado de estilo (sin IA)', () => {
  it('compares by selector and restores only what the user did not unlock', () => {
    const differences = compareStyleSamples(design(72, 'rgb(255, 255, 255)'), design(64, 'rgb(10, 20, 30)'));
    expect(differences.map(item => [item.target, item.property, item.base, item.output])).toEqual([
      ['.title', 'font-size', '72px', '64px'], ['.card', 'background-color', '#ffffff', '#0a141e']]);
    const css = buildStyleLockCss(differences, ['colors']);
    expect(css).toBe('/*lock:font-size*/.title{font-size:72px!important}');
    expect(applyStyleLock(doc, css)).toContain('<style id="scory-style-lock">\n/*lock:font-size*/.title{font-size:72px!important}\n</style></head>');
  });
  it('pairs by role when a rewrite renamed the classes', () => {
    const differences = compareStyleSamples(design(72), design(60, 'rgb(255, 255, 255)', '.heading'));
    expect(differences).toContainEqual(expect.objectContaining({ target: '.heading', property: 'font-size', base: '72px', matched: 'role' }));
  });
  it('without unlock only reports and never reverts what was asked', async () => {
    const measure = vi.fn().mockResolvedValueOnce(design(72)).mockResolvedValueOnce(design(64));
    const result = await enforceStyleLock({ base: doc, output: doc, measure, fits: vi.fn() });
    expect(result.html).toBe(doc); expect(result.report).toEqual({ status: 'reported', differences: ['.title: tamaño 72px → 64px'] });
    expect(describeStyleLock(result.report)).toBe('Diferencias de estilo: .title: tamaño 72px → 64px.');
  });
  it('reports «ninguna» when the only change was unlocked by the request', async () => {
    const measure = vi.fn().mockResolvedValueOnce(design(72)).mockResolvedValueOnce(design(64));
    const result = await enforceStyleLock({ base: doc, output: doc, unlock: ['typography'], measure, fits: vi.fn() });
    expect(result.report.status).toBe('none'); expect(describeStyleLock(result.report)).toBe('Diferencias de estilo: ninguna.');
  });
  it('drops the size pin and asks when the original size does not fit', async () => {
    const measure = vi.fn().mockResolvedValueOnce(design(72)).mockResolvedValueOnce(design(64));
    const result = await enforceStyleLock({ base: doc, output: doc, unlock: [], measure, fits: vi.fn().mockResolvedValue('overflow') });
    expect(result.report).toMatchObject({ status: 'overflow', question: 'No cabe con el tamaño original; ¿reacomodo o reduzco a 64 px?' });
    expect(result.html).not.toContain('scory-style-lock');
  });
  it('keeps earlier pins and releases a category the user unlocks later', () => {
    const locked = applyStyleLock(doc, '/*lock:font-size*/.title{font-size:72px!important}\n/*lock:color*/.title{color:#0b2a5b!important}');
    expect(applyStyleLock(locked, '/*lock:font-size*/.title{font-size:70px!important}')).toContain('/*lock:color*/.title{color:#0b2a5b!important}\n/*lock:font-size*/.title{font-size:70px!important}');
    const released = releaseStyleLock(locked, ['colors']);
    expect(released).toContain('font-size:72px'); expect(released).not.toContain('color:#0b2a5b');
  });
  it('infers unlocks from the user words so an explicit change is never locked', () => {
    expect(inferStyleUnlocks('números 01-04 turquesa y barco más grande')).toEqual(['typography', 'colors']);
    expect(inferStyleUnlocks('tarjetas horizontales')).toEqual(['layout']);
    expect(inferStyleUnlocks('aplica el estilo de esta referencia')).toEqual(expect.arrayContaining(['colors', 'components', 'typography']));
    expect(inferStyleUnlocks('agrega 3 tarjetas')).toEqual([]);
  });
});
