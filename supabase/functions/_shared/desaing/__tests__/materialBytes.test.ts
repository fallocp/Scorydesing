import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { inspectMaterialBytes, readMaterialText } from '../materialBytes';

async function pdf(pages: number) {
  const document = await PDFDocument.create(), font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index++) {
    const page = document.addPage([400, 600]);
    page.drawText(`Material ${index + 1}`, { x: 30, y: 550, size: 18, font });
    page.drawRectangle({ x: 30, y: 430, width: 90, height: 70, color: rgb(0.1, 0.4, 0.3) });
  }
  return document.save();
}
describe('actual material bytes', () => {
  it('counts actual PDF pages independently of file size and rejects excess pages', async () => {
    expect(await inspectMaterialBytes(await pdf(2), 'application/pdf')).toEqual({ page_count: 2 });
    await expect(inspectMaterialBytes(await pdf(21), 'application/pdf')).rejects.toThrow('material_pdf_page_limit');
  });
  it('rejects an URL, a fake header and a truncated PDF before provider transport', async () => {
    for (const bytes of [new TextEncoder().encode('https://example.invalid/manual.pdf'),
      new TextEncoder().encode('%PDF-1.7\n' + 'x'.repeat(100) + '\n%%EOF'), (await pdf(1)).slice(0, 80)]) {
      await expect(inspectMaterialBytes(bytes, 'application/pdf')).rejects.toThrow('material_pdf_invalid');
    }
  });
  it('keeps literal UTF-8 text and rejects binary or malformed encoding', async () => {
    const literal = 'Idea: conservar símbolos <marca>\nAudiencia: México.\tSin cambios.';
    const bytes = new TextEncoder().encode(literal);
    expect(readMaterialText(bytes)).toBe(literal);
    expect(await inspectMaterialBytes(bytes, 'text/markdown')).toEqual({ page_count: null });
    expect(() => readMaterialText(new Uint8Array([0xc3, 0x28]))).toThrow('material_text_encoding');
    expect(() => readMaterialText(new Uint8Array([97, 0, 98]))).toThrow('material_text_invalid');
    expect(() => readMaterialText(new Uint8Array(65537).fill(65))).toThrow('material_text_size');
  });
  it('never accepts a PDF as PNG or unsupported executable content as documentation', async () => {
    await expect(inspectMaterialBytes(await pdf(1), 'image/png')).rejects.toThrow('material_image_invalid');
    await expect(inspectMaterialBytes(new Uint8Array([1, 2, 3]), 'application/octet-stream')).rejects.toThrow('material_mime_unsupported');
  });
});
