import type { PresentationSlide } from './presentationDocument';
import { getSlideDimensions } from './presentationDocument';
import { captureConversationHtml } from './designConversationVisuals';
import { preparePresentationReference, type PreparedPresentationReference } from './presentationReferences';

/** One labelled contact sheet leaves the user's three reference slots intact.
 * Exact copy/structure travel separately, since thumbnails are visual evidence. */
export async function capturePresentationInspection(slides: ReadonlyArray<PresentationSlide>,
  index: ReadonlyArray<{ id: string; number: number; title: string }>,
  access: { businessId: string; expectedActorId?: string }, assertCurrent: () => Promise<void>): Promise<{
    reference: PreparedPresentationReference | null; capturedIds: string[];
  }> {
  const captured: Array<{ slide: PresentationSlide; blob: Blob }> = [];
  // The local renderer is also used by export; keep concurrency bounded.
  for (let offset = 0; offset < slides.length; offset += 2) {
    const batch = slides.slice(offset, offset + 2);
    const results = await Promise.allSettled(batch.map(async slide => ({ slide,
      blob: (await captureConversationHtml(slide.html, getSlideDimensions(slide.html), access)).blob })));
    await assertCurrent();
    for (const result of results) if (result.status === 'fulfilled') captured.push(result.value);
  }
  if (!captured.length) return { reference: null, capturedIds: [] };
  const cols = captured.length === 1 ? 1 : captured.length <= 4 ? 2 : 3;
  const rows = Math.ceil(captured.length / cols), cellWidth = Math.floor(1024 / cols);
  const cellHeight = Math.min(Math.floor(1024 / rows), Math.round(cellWidth * 0.65));
  const canvas = document.createElement('canvas'); canvas.width = cols * cellWidth; canvas.height = rows * cellHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('No se pudo preparar la vista de las diapositivas.');
  ctx.fillStyle = '#e8edf0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < captured.length; i++) {
    const item = captured[i], bitmap = await createImageBitmap(item.blob);
    try {
      const x = i % cols * cellWidth, y = Math.floor(i / cols) * cellHeight;
      const label = index.find(slide => slide.id === item.slide.id);
      ctx.fillStyle = '#12233d'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText(`${label?.number ?? '?'} · ${label?.title ?? item.slide.title ?? ''}`, x + 8, y + 20, cellWidth - 16);
      const scale = Math.min((cellWidth - 16) / bitmap.width, (cellHeight - 36) / bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      ctx.drawImage(bitmap, x + (cellWidth - width) / 2, y + 28 + (cellHeight - 36 - height) / 2, width, height);
    } finally { bitmap.close(); }
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value)
    : reject(Error('No se pudo preparar la vista de las diapositivas.')), 'image/png'));
  const reference = await preparePresentationReference(new File([blob], 'Diapositivas consultadas.png', { type: 'image/png' }), 'layout_reference', async file => file);
  await assertCurrent(); return { reference, capturedIds: captured.map(item => item.slide.id) };
}
