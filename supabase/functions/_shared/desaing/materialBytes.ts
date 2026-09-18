import { PDFDocument } from 'pdf-lib';
import { inspectServerPng } from './serverPng.ts';

export const MATERIAL_FILE_LIMITS = { bytes: 8388608, textBytes: 65536, pdfPages: 20, imageEdge: 4096 } as const;
export class MaterialBytesError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'MaterialBytesError'; }
}
const fail = (code: string): never => { throw new MaterialBytesError(code); };
export function readMaterialText(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > MATERIAL_FILE_LIMITS.textBytes) return fail('material_text_size');
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('material_text_encoding'); }
  if (!value.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) return fail('material_text_invalid');
  return value;
}
/** Actual bytes are parsed before durable import; filenames and Content-Type are never evidence of validity. */
export async function inspectMaterialBytes(input: Uint8Array, mime: string): Promise<{ page_count: number | null }> {
  if (!(input instanceof Uint8Array) || !input.length || input.length > MATERIAL_FILE_LIMITS.bytes) return fail('material_file_size');
  const bytes = input.slice();
  if (mime === 'text/plain' || mime === 'text/markdown') { readMaterialText(bytes); return { page_count: null }; }
  if (mime === 'image/png') {
    try {
      const image = await inspectServerPng(bytes);
      if (image.width > MATERIAL_FILE_LIMITS.imageEdge || image.height > MATERIAL_FILE_LIMITS.imageEdge) return fail('material_image_size');
    } catch (error) { if (error instanceof MaterialBytesError) throw error; return fail('material_image_invalid'); }
    return { page_count: null };
  }
  if (mime !== 'application/pdf') return fail('material_mime_unsupported');
  if (bytes.length < 64 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-'
    || !new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 1024))).includes('%%EOF')) return fail('material_pdf_invalid');
  let document: PDFDocument;
  try { document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true }); }
  catch (error) { return fail(error instanceof Error && error.name === 'EncryptedPDFError' ? 'material_pdf_encrypted' : 'material_pdf_invalid'); }
  if (document.isEncrypted) return fail('material_pdf_encrypted');
  try {
    const pages = document.getPages();
    if (!pages.length || pages.length > MATERIAL_FILE_LIMITS.pdfPages) return fail('material_pdf_page_limit');
    if (pages.some(page => !Number.isFinite(page.getWidth()) || !Number.isFinite(page.getHeight())
      || page.getWidth() <= 0 || page.getHeight() <= 0 || page.getWidth() > 14400 || page.getHeight() > 14400)) return fail('material_pdf_invalid');
    return { page_count: pages.length };
  } catch (error) { if (error instanceof MaterialBytesError) throw error; return fail('material_pdf_invalid'); }
}
