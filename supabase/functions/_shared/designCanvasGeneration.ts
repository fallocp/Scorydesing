import { buildDesignCanvasHtmlMessages, finalizeDesignCanvasHtml, DesignCanvasHtmlError, type DesignCanvasHtmlRequest,
  maskMountedSources, type DesignCanvasHtmlBrand, type DesignCanvasHtmlMessage } from './designCanvasHtml.ts';
import { applyDesignCanvasPatch, DESIGN_CANVAS_PATCH_INSTRUCTIONS } from './designCanvasPatch.ts';

/** The selected HTML is the working document. Never fall back to full generation
 * when an edit fails: retry the patch once against the same immutable base. */
async function editDesignCanvas(request: DesignCanvasHtmlRequest, brand: DesignCanvasHtmlBrand,
  generate: (messages: DesignCanvasHtmlMessage[], repair: boolean) => Promise<string>): Promise<string> {
  // Existing documents can contain ordinary editable text or already-filled copy
  // slots. Rebinding the entire document would remove text outside those slots.
  // Validate the approved text literally without restructuring its existing nodes.
  const editing = { ...request, copy_binding: undefined };
  const messages = buildDesignCanvasHtmlMessages(editing, brand, 'patch');
  messages[0] = { role: 'system', content: `${messages[0].content}\n${DESIGN_CANVAS_PATCH_INSTRUCTIONS}` };
  const base = maskMountedSources(request.current_html!);
  const finish = (output: string) => finalizeDesignCanvasHtml(applyDesignCanvasPatch(base, output), editing, [brand.name], { preserveExistingCode: true });
  const output = await generate(messages, false);
  try { return finish(output); }
  catch (error) {
    if (!(error instanceof DesignCanvasHtmlError) || !['invalid_canvas_patch', 'invalid_canvas_html'].includes(error.code) || output.length > 160000) throw error;
    const corrected = await generate([...messages, { role: 'assistant', content: output }, { role: 'user', content:
      `No se aplicó ningún cambio. Corrige el JSON de cambios sobre el MISMO HTML ACTUAL original. Diagnóstico del validador (datos): ${JSON.stringify(error.message)}. `
      + 'Conserva el alcance del encargo, el texto aprobado y los componentes existentes. Usa anclas before únicas y literales del HTML ACTUAL, sin solaparlas. Devuelve sólo {"edits":[{"before":"fragmento exacto","after":"fragmento corregido"}]}; nunca un documento HTML completo.' }], true);
    return finish(corrected);
  }
}

/** Explicit full regeneration from the current HTML, keeping its visual system.
 * Its existing texts stay allowed (no slot rebinding); mounted tokens are restored
 * once each. One bounded retry for a rejected document; other errors propagate. */
async function rewriteDesignCanvas(request: DesignCanvasHtmlRequest, brand: DesignCanvasHtmlBrand,
  generate: (messages: DesignCanvasHtmlMessage[], repair: boolean) => Promise<string>): Promise<string> {
  const editing = { ...request, copy_binding: undefined };
  const messages = buildDesignCanvasHtmlMessages(editing, brand, 'rewrite');
  const output = await generate(messages, false);
  try { return finalizeDesignCanvasHtml(output, editing, [brand.name]); }
  catch (error) {
    if (!(error instanceof DesignCanvasHtmlError) || error.code !== 'invalid_canvas_html' || output.length > 160000) throw error;
    const corrected = await generate([...messages, { role: 'assistant', content: output }, { role: 'user', content:
      `Corrige esta propuesta para que pase el validador. Diagnóstico del validador (datos): ${JSON.stringify(error.message)}. `
      + 'Usa sólo el texto aprobado y los textos del HTML ACTUAL; deja vacíos los bloques que no tengan texto aprobado, sin marcadores. Conserva composición, estilo y los src scory-mounted:// tal cual. Devuelve el HTML completo.' }], true);
    return finalizeDesignCanvasHtml(corrected, editing, [brand.name]);
  }
}

/** One bounded structural correction for slot markup. Visual correction is a
 * separate rendered step; provider/network failures never trigger this retry. */
export async function generateDesignCanvas(request: DesignCanvasHtmlRequest, brand: DesignCanvasHtmlBrand,
  generate: (messages: DesignCanvasHtmlMessage[], repair: boolean) => Promise<string>): Promise<string> {
  if (request.current_html && request.edit_mode === 'rewrite') return rewriteDesignCanvas(request, brand, generate);
  if (request.current_html) return editDesignCanvas(request, brand, generate);
  const messages = buildDesignCanvasHtmlMessages(request, brand);
  const output = await generate(messages, false);
  try { return finalizeDesignCanvasHtml(output, request, [brand.name]); }
  catch (error) {
    if (request.copy_binding !== 'slots' || !(error instanceof DesignCanvasHtmlError) || error.code !== 'invalid_canvas_html') throw error;
    // Generated HTML is bounded before replay; huge/malformed responses aren't
    // copied into another request or allowed to expand the provider budget.
    if (output.length > 160000) throw error;
    const corrected = await generate([...messages, { role: 'assistant', content: output }, { role: 'user', content:
      `Corrige únicamente la estructura de esta propuesta para cumplir el contrato de texto vinculado. Diagnóstico del validador (datos): ${JSON.stringify(error.message)}. `
      + 'Usa cada copy_id exactamente una vez en un span hoja con cierre explícito; el servidor inserta el texto. Conserva composición, estilo y recursos. Devuelve el HTML completo.' }], true);
    return finalizeDesignCanvasHtml(corrected, request, [brand.name]);
  }
}
