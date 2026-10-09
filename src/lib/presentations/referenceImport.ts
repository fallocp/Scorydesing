import { requestRendererJson } from './rendererTransport';
import { preparePresentationReference, type PreparedPresentationReference, type PresentationReferenceRole } from './presentationReferences';

export type ReferenceImportSource = { kind: 'web'; url: string } | { kind: 'pdf' | 'pptx'; name: string; base64: string };
export interface ReferenceImportPage { number: number; pngBase64: string }
export interface ReferenceImportResult { name: string; pageCount: number; pages: ReferenceImportPage[]; notice?: string }
export const REFERENCE_IMPORT_MAX_BYTES = 16 * 1024 * 1024;
export const REFERENCE_IMPORT_BATCH = 6;

export function referenceImportKind(name: string): 'pdf' | 'pptx' {
  const extension = name.toLowerCase().split('.').pop();
  if (extension !== 'pdf' && extension !== 'pptx') throw new Error('Usa un PDF o una presentación PPTX. Para otros formatos, exporta primero a PDF.');
  return extension;
}
export async function referenceImportFile(file: File): Promise<ReferenceImportSource> {
  const kind = referenceImportKind(file.name);
  if (!file.size || file.size > REFERENCE_IMPORT_MAX_BYTES) throw new Error('Usa un archivo de hasta 16 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === 'pdf' ? String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-' : bytes[0] !== 80 || bytes[1] !== 75) {
    throw new Error('El contenido del archivo no coincide con su formato.');
  }
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { kind, name: file.name.slice(0, 240), base64: btoa(binary) };
}
export function referenceImportUrl(value: string): ReferenceImportSource {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Escribe el enlace completo, por ejemplo https://marca.com.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw new Error('Usa un enlace público HTTP o HTTPS sin credenciales.');
  return { kind: 'web', url: url.href };
}
export function referencePageNumbers(start: number, total: number): number[] {
  return Array.from({ length: Math.max(0, Math.min(REFERENCE_IMPORT_BATCH, total - start + 1)) }, (_, index) => start + index);
}
export async function importReferencePages(businessId: string, source: ReferenceImportSource, preview: boolean,
  pages?: number[], signal?: AbortSignal): Promise<ReferenceImportResult> {
  const result = await requestRendererJson('reference-import', { ...source, preview, pages }, { businessId, signal });
  if (!Number.isSafeInteger(result.pageCount) || result.pageCount < 1 || result.pageCount > 100 || !Array.isArray(result.pages)
    || result.pages.length < 1 || result.pages.length > (preview ? 6 : 3) || result.pages.some((page: ReferenceImportPage) =>
      !Number.isSafeInteger(page.number) || page.number < 1 || page.number > result.pageCount || typeof page.pngBase64 !== 'string'
      || !page.pngBase64.startsWith('iVBORw0KGgo') || page.pngBase64.length > 12 * 1024 * 1024)) throw new Error('El importador devolvió páginas inválidas.');
  return result as ReferenceImportResult;
}
export async function prepareImportedPages(result: ReferenceImportResult, role: PresentationReferenceRole): Promise<PreparedPresentationReference[]> {
  const prepared: PreparedPresentationReference[] = [];
  for (const page of result.pages) {
    const bytes = Uint8Array.from(atob(page.pngBase64), value => value.charCodeAt(0));
    prepared.push(await preparePresentationReference(new File([bytes], `${result.name.slice(0, 190)} · página ${page.number}.png`, { type: 'image/png' }), role));
  }
  return prepared;
}
