import { describe, expect, it } from 'vitest';
import { fullDesignImageSize } from '../presentationFullDesign.ts';
import { validateImageSize } from '../formats.ts';
import { XENDING_STYLES, xendingStyleBlock } from '../xendingVisualSystem.ts';

describe('catalog canvases in full designs', () => {
  it('renders catalog canvases at their documented generation size', () => {
    expect(fullDesignImageSize({ width: 1080, height: 1920 })).toEqual({ width: 1152, height: 2048 });
    expect(fullDesignImageSize({ width: 1080, height: 1350 })).toEqual({ width: 1088, height: 1360 });
    expect(fullDesignImageSize({ width: 1080, height: 1080 })).toEqual({ width: 1088, height: 1088 });
    expect(fullDesignImageSize({ width: 1200, height: 627 })).toEqual({ width: 1216, height: 640 });
    for (const canvas of [{ width: 1080, height: 1920 }, { width: 1200, height: 627 }]) expect(validateImageSize(fullDesignImageSize(canvas)).valid).toBe(true);
  });
  it('keeps the legacy sizes for existing slides and Diseño libre canvases', () => {
    expect(fullDesignImageSize({ width: 1920, height: 1080 })).toEqual({ width: 1536, height: 864 });
    expect(fullDesignImageSize({ width: 1280, height: 720 })).toEqual({ width: 1536, height: 864 });
    expect(fullDesignImageSize({ width: 1088, height: 1408 })).toEqual({ width: 1088, height: 1408 });
    expect(fullDesignImageSize({ width: 1024, height: 1024 })).toEqual({ width: 1024, height: 1024 });
  });
  it('renders the 3:1 source band of ultrawide covers at its own size', () => {
    expect(fullDesignImageSize({ width: 1536, height: 512 })).toEqual({ width: 1536, height: 512 });
    expect(fullDesignImageSize({ width: 3072, height: 1024 })).toEqual({ width: 1536, height: 864 });
  });
});

describe('Xending visual system block', () => {
  it('includes brand color semantics and only the selected background style', () => {
    const v2 = xendingStyleBlock('white_v2', true), navy = xendingStyleBlock('navy', true);
    expect(v2).toContain('#2ED4C7'); expect(v2).toContain('BLANCO XENDING V2'); expect(v2).not.toContain('ESTILO: NAVY');
    expect(navy).toContain('ESTILO: NAVY'); expect(navy).not.toContain('BLANCO XENDING V2');
    expect(xendingStyleBlock('white_v3', true)).toContain('CAPA PRODUCTO');
  });
  it('switches between literal text and no text', () => {
    expect(xendingStyleBlock('white_v2', true)).toContain('Montserrat');
    expect(xendingStyleBlock('white_v2', false)).toContain('ninguno');
    expect(xendingStyleBlock('white_v2', false)).not.toContain('Montserrat');
  });
  it('stays well below the design brief limit', () => {
    for (const style of XENDING_STYLES) expect(new TextEncoder().encode(xendingStyleBlock(style, true)).length).toBeLessThan(6000);
    expect(() => xendingStyleBlock('other' as never, true)).toThrow('invalid_xending_style');
  });
});
