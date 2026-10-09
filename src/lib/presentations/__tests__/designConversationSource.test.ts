import { describe, expect, it } from 'vitest';
import { conversationDesignSourceInstruction, describeConversationDesignSource, designEditableHtmlHash, resolveConversationDesignSource } from '../designConversationSource';
import type { ConversationDesignSource } from '../../../../supabase/functions/_shared/desaing/conversationActions';
import type { PreparedPresentationReference } from '../presentationReferences';

const slides = [
  { id: 'target-1', revision: 1, title: 'Destino', html: '<main>Original del destino</main>' },
  { id: 'middle-2', revision: 1, title: 'Intermedia', html: '<main>Intermedia</main>' },
  { id: 'source-3', revision: 7, title: 'Tarjetas', html: '<main>Plantilla de tarjetas</main>' },
];
const source = (): ConversationDesignSource => ({ mode: 'adapt_layout', source: { kind: 'slide', slide_id: 'source-3', revision: '7' } });
const reference = (): PreparedPresentationReference => ({ id: `reference:${'a'.repeat(64)}`, sha256: 'a'.repeat(64), name: 'Referencia elegida.png',
  role: 'image_style_reference', blob: new Blob(['pixels'], { type: 'image/png' }) });

describe('resolving the agreed design source separately from its destination', () => {
  it('finds the exact source identity after reorder without substituting the current slide or renumbering its ID', () => {
    const before = structuredClone(slides), resolved = resolveConversationDesignSource(source(), slides, []);
    expect(resolved.slide).toEqual(slides[2]); expect(resolved.slide!.id).not.toBe(slides[0].id); expect(slides).toEqual(before);
    const reordered = [slides[2], slides[0], slides[1]];
    expect(resolveConversationDesignSource(source(), reordered, []).slide).toEqual(slides[2]);
    expect(describeConversationDesignSource(source(), slides, [])).toBe('Adaptar distribución · Diapositiva 3: Tarjetas');
    expect(describeConversationDesignSource(source(), reordered, [])).toBe('Adaptar distribución · Diapositiva 1: Tarjetas');
  });

  it('rejects stale revisions, missing IDs and same-position replacements instead of selecting another source', () => {
    for (const available of [slides.map(slide => slide.id === 'source-3' ? { ...slide, revision: 8 } : slide), slides.slice(0, 2),
      [slides[0], slides[1], { ...slides[2], id: 'replacement-3' }]]) {
      expect(() => resolveConversationDesignSource(source(), available, [])).toThrow('referencia cambió');
    }
  });

  it('resolves a named visual attachment and refuses removal or demotion to content-only', () => {
    const ref = reference(), choice: ConversationDesignSource = { mode: 'style_only', source: { kind: 'reference', reference_id: ref.id } };
    expect(resolveConversationDesignSource(choice, slides, [ref]).reference).toEqual(ref);
    expect(describeConversationDesignSource(choice, slides, [ref])).toBe('Tomar sólo el estilo · Referencia elegida.png');
    expect(() => resolveConversationDesignSource(choice, slides, [])).toThrow('ya no está disponible');
    expect(() => resolveConversationDesignSource(choice, slides, [{ ...ref, role: 'content_source' }])).toThrow('ya no está disponible');
  });

  it('retains all immutable asset identity fields and keeps approved copy and destination independent in every source mode', () => {
    const asset = { business_id: 'business', asset_id: 'image-1', version_id: 'v7' };
    for (const mode of ['replicate', 'adapt_layout', 'style_only'] as const) {
      const choice: ConversationDesignSource = { mode, source: { kind: 'asset', asset } };
      expect(resolveConversationDesignSource(choice, slides, [])).toEqual({ asset });
      const instruction = conversationDesignSourceInstruction(choice);
      expect(instruction).toContain(JSON.stringify(choice)); expect(instruction).toContain('El destino y el tamaño del lienzo siguen siendo los actuales');
      expect(instruction).toContain('El texto de la fuente no reemplaza el contenido aprobado');
    }
    expect(conversationDesignSourceInstruction({ ...source(), mode: 'replicate' })).toContain('composición y proporciones');
    expect(conversationDesignSourceInstruction(source())).toContain('Reorganiza los bloques');
    expect(conversationDesignSourceInstruction({ ...source(), mode: 'style_only' })).toContain('crea una distribución');
  });

  it('binds editor commands to exact HTML bytes including text, asset and position changes', async () => {
    const html = '<main><h1 style="left:12px">Título</h1><img src="asset-a"></main>';
    const hash = await designEditableHtmlHash(html); expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await designEditableHtmlHash(html)).toBe(hash);
    for (const changed of [html.replace('Título', 'Otro título'), html.replace('12px', '24px'), html.replace('asset-a', 'asset-b'), `${html}\n`])
      expect(await designEditableHtmlHash(changed)).not.toBe(hash);
  });
});
