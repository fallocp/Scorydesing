import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { capturePresentationInspection } from '../designConversationInspection';

vi.mock('../designConversationVisuals', () => ({ captureConversationHtml: vi.fn() }));
vi.mock('../presentationReferences', () => ({ preparePresentationReference: vi.fn() }));
vi.mock('../presentationDocument', () => ({ getSlideDimensions: vi.fn() }));
const puppeteer = createRequire(`${process.cwd()}/renderer/package.json`)('puppeteer');
let browser: any;
beforeAll(async () => { browser = await puppeteer.launch({ headless: true }); }, 30000);
afterAll(async () => { await browser?.close(); });

async function capture(options: { count?: number; failIds?: string[]; failGuard?: number; renumber?: boolean } = {}) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (request: any) => void request.respond({ status: 200, contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://localhost/inspection-test');
    // Vite's SSR namespace wrappers are test transport only; inject the three
    // ports while exercising the production function and Chromium's real PNG/canvas APIs.
    const source = capturePresentationInspection.toString().replace(/\b[\w$]+\.(captureConversationHtml|preparePresentationReference|getSlideDimensions)\b/g, '$1');
    return await page.evaluate(async (fn: string, settings: typeof options) => {
      const ids = settings.count ? Array.from({ length: settings.count }, (_, index) => index + 1) : [2, 7, 9, 12];
      const slides = ids.map(number => ({ id: `slide-${number}`, revision: 1, title: `Título ${number}`,
        html: JSON.stringify({ id: `slide-${number}`, width: number % 2 ? 240 : 320, height: number % 2 ? 320 : 180 }) }));
      const index = slides.map((slide, position) => ({ id: slide.id, number: settings.renumber ? position + 20 : ids[position],
        title: settings.renumber ? `Nuevo ${position + 20}` : slide.title }));
      let active = 0, maxActive = 0, guards = 0, prepared = 0;
      const calls: string[] = [], labels: string[] = [], nativeFillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args: [number, number, number?]) {
        labels.push(text); return nativeFillText.call(this, text, ...args);
      };
      const captureHtml = async (html: string, dimensions: { width: number; height: number }, access: { expectedActorId?: string }) => {
        const scene = JSON.parse(html); calls.push(scene.id); active++; maxActive = Math.max(maxActive, active);
        try {
          await new Promise(resolve => setTimeout(resolve, 5));
          if (settings.failIds?.includes(scene.id)) throw Error('renderer_unavailable');
          if (access.expectedActorId !== 'actor') throw Error('wrong_actor');
          const canvas = document.createElement('canvas'); canvas.width = dimensions.width; canvas.height = dimensions.height;
          const ctx = canvas.getContext('2d')!; ctx.fillStyle = scene.width > scene.height ? '#c74929' : '#2868a7';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
          return { blob };
        } finally { active--; }
      };
      const prepare = async (file: File, role: string, normalize: (file: File) => Promise<Blob>) => {
        prepared++; const blob = await normalize(file), digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        return { blob, sha256, id: `reference:${sha256}`, name: file.name, role };
      };
      const capture = new Function('captureConversationHtml', 'preparePresentationReference', 'getSlideDimensions', `return (${fn})`)(captureHtml, prepare,
        (html: string) => { const scene = JSON.parse(html); return { width: scene.width, height: scene.height }; }) as typeof capturePresentationInspection;
      try {
        const result = await capture(slides, index, { businessId: 'business', expectedActorId: 'actor' }, async () => {
          guards++; if (guards === settings.failGuard) throw Error('session_changed');
        });
        const bitmap = result.reference ? await createImageBitmap(result.reference.blob) : null;
        const dimensions = bitmap ? { width: bitmap.width, height: bitmap.height } : null; bitmap?.close();
        return { capturedIds: result.capturedIds, reference: result.reference ? { id: result.reference.id, name: result.reference.name,
          role: result.reference.role, size: result.reference.blob.size, type: result.reference.blob.type } : null,
          dimensions, calls, labels, maxActive, guards, prepared, error: '' };
      } catch (error) {
        return { capturedIds: [], reference: null, dimensions: null, calls, labels, maxActive, guards, prepared, error: (error as Error).message };
      }
    }, source, options);
  } finally { await page.close(); }
}

describe('numbered presentation contact sheets', () => {
  it('uses actual noncontiguous slide numbers, preserves source order and limits concurrent renders to two', async () => {
    const result = await capture();
    expect(result.error).toBe(''); expect(result.capturedIds).toEqual(['slide-2', 'slide-7', 'slide-9', 'slide-12']);
    expect(result.labels).toEqual(['2 · Título 2', '7 · Título 7', '9 · Título 9', '12 · Título 12']);
    expect(result.maxActive).toBe(2); expect(result.guards).toBe(3);
    expect(result.reference).toMatchObject({ type: 'image/png', role: 'layout_reference', name: 'Diapositivas consultadas.png' });
    expect(result.reference!.id).toMatch(/^reference:[a-f0-9]{64}$/);
    expect(result.dimensions!.width).toBeLessThanOrEqual(1024); expect(result.dimensions!.height).toBeLessThanOrEqual(1024);
  });

  it.each([1, 12, 13])('keeps all %i captures including an auxiliary base within a 1024-pixel PNG', async count => {
    const result = await capture({ count });
    expect(result.error).toBe(''); expect(result.capturedIds).toHaveLength(count); expect(result.labels).toHaveLength(count);
    expect(result.dimensions!.width).toBeGreaterThan(0); expect(result.dimensions!.width).toBeLessThanOrEqual(1024);
    expect(result.dimensions!.height).toBeGreaterThan(0); expect(result.dimensions!.height).toBeLessThanOrEqual(1024);
  });

  it('labels only successful captures and preserves actual numbering when a requested slide cannot render', async () => {
    const result = await capture({ failIds: ['slide-7'] });
    expect(result.error).toBe(''); expect(result.capturedIds).toEqual(['slide-2', 'slide-9', 'slide-12']);
    expect(result.labels).toEqual(['2 · Título 2', '9 · Título 9', '12 · Título 12']); expect(result.prepared).toBe(1);
    const unavailable = await capture({ failIds: ['slide-2', 'slide-7', 'slide-9', 'slide-12'] });
    expect(unavailable.reference).toBeNull(); expect(unavailable.capturedIds).toEqual([]); expect(unavailable.prepared).toBe(0);
  });

  it('does not return or continue preparing evidence after the actor or target guard fails', async () => {
    const during = await capture({ failGuard: 1 });
    expect(during.error).toBe('session_changed'); expect(during.calls).toHaveLength(2); expect(during.prepared).toBe(0);
    expect(during.reference).toBeNull();
    const final = await capture({ failGuard: 3 });
    expect(final.error).toBe('session_changed'); expect(final.prepared).toBe(1); expect(final.reference).toBeNull();
  });

  it('takes fresh labels from the current index when the same slide content has been reordered or renamed', async () => {
    const result = await capture({ renumber: true });
    expect(result.error).toBe(''); expect(result.labels).toEqual(['20 · Nuevo 20', '21 · Nuevo 21', '22 · Nuevo 22', '23 · Nuevo 23']);
    expect(result.capturedIds).toEqual(['slide-2', 'slide-7', 'slide-9', 'slide-12']);
  });
});
