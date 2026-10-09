import type { Brand } from '@/types/xendingDesign';
import { supabase } from '@/integrations/supabase/client';
import { requestRendererJson } from '@/lib/presentations/rendererTransport';

const RENDER_SERVER_URL = 'http://localhost:3333/render';
const RENDER_PDF_URL = 'http://localhost:3333/render-pdf';

export interface RenderPieceParams {
  imageUrl: string;
  headline: string;
  subcopy: string;
  cta: string;
  brand: Brand;
  angle?: string;
  punchline?: string;
  usedPhrases?: string[];
  pieceNumber?: number;
  totalPieces?: number;
  template?: string;
  width?: number;
  height?: number;
}

/**
 * Step 1: Claude generates branded HTML via generate-design-html Edge Function
 */
export async function generatePieceHtml(params: RenderPieceParams): Promise<string> {
  const {
    headline,
    subcopy,
    cta,
    brand,
    angle,
    punchline,
    imageUrl,
    usedPhrases,
    pieceNumber,
    totalPieces,
    template,
  } = params;

  const { data: htmlData, error: htmlError } = await supabase.functions.invoke(
    'generate-design-html',
    {
      body: {
        headline,
        subcopy,
        cta,
        brand,
        angle: angle || 'general',
        punchline,
        imageUrl,
        usedPhrases: usedPhrases || [],
        pieceNumber,
        totalPieces,
        template: template || 'card',
      },
    }
  );

  if (htmlError) throw new Error(htmlError.message || 'Error generando HTML');
  if (htmlData?.error) throw new Error(htmlData.message || htmlData.error);

  const html = htmlData.html;
  if (!html) throw new Error('No se generó HTML');

  return html;
}

/**
 * Step 2: Puppeteer render server converts HTML to PNG
 */
export async function renderHtmlToPng(
  html: string,
  brand: string,
  width = 1080,
  height = 1920,
  options?: { signal?: AbortSignal },
): Promise<string> {
  try {
    const renderResponse = await fetch(RENDER_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, width, height, filename: `${brand}-piece.png` }),
      signal: options?.signal,
    });

    if (!renderResponse.ok) {
      const err = await renderResponse.json();
      throw new Error(err.error || `Render server error: ${renderResponse.status}`);
    }

    const { pngBase64 } = await renderResponse.json();
    return `data:image/png;base64,${pngBase64}`;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(
        'No se pudo conectar al servidor de renderizado. ' +
        'Ejecuta: cd xending-design && node scripts/render-server.js'
      );
    }
    throw err;
  }
}

export interface DesignLayoutDiagnostics {
  issues: Array<{ code: string; element?: string; message: string }>;
  truncated?: boolean;
}

/** Capture the exact canvas plus measured text clipping/overlap from the same Chromium page. */
export async function renderHtmlForReview(html: string, width: number, height: number, options: {
  businessId: string; expectedActorId?: string; signal?: AbortSignal;
}): Promise<{
  image: string; diagnostics?: DesignLayoutDiagnostics;
}> {
  const data = await requestRendererJson('design-preview', { html, width, height }, options);
  if (typeof data.pngBase64 !== 'string' || !data.pngBase64.startsWith('iVBORw0KGgo') || data.pngBase64.length > 12 * 1024 * 1024) {
    throw Error(data.message || 'No se pudo renderizar el diseño para revisarlo.');
  }
  const raw = data.diagnostics;
  if (raw && (!Array.isArray(raw.issues) || raw.issues.some((issue: unknown) => !issue || typeof issue !== 'object'
    || typeof (issue as { code?: unknown }).code !== 'string' || typeof (issue as { message?: unknown }).message !== 'string'))) {
    throw Error('El servidor no devolvió mediciones válidas del diseño.');
  }
  const diagnostics: DesignLayoutDiagnostics | undefined = raw ? {
    issues: raw.issues.slice(0, 40).map((issue: { code: string; message: string; element?: unknown }) => ({
      code: issue.code.slice(0, 80), message: issue.message.slice(0, 500),
      ...(typeof issue.element === 'string' ? { element: issue.element.slice(0, 160) } : {}),
    })), truncated: raw.truncated === true || raw.issues.length > 40,
  } : undefined;
  return { image: `data:image/png;base64,${data.pngBase64}`, diagnostics };
}

/**
 * Combined: generate HTML + render to PNG (backward compatible)
 */
export async function renderPieceToCanvas(params: RenderPieceParams): Promise<string> {
  const html = await generatePieceHtml(params);
  return renderHtmlToPng(html, params.brand, params.width || 1080, params.height || 1920);
}

/**
 * Render multiple slides into a single multi-page PDF with EXACT pixel dimensions
 * (idénticas al export PNG). Devuelve el PDF como base64.
 */
export async function renderSlidesToPdf(
  items: Array<{ html: string; width: number; height: number }>,
  filename = 'presentation.pdf'
): Promise<string> {
  try {
    const response = await fetch(RENDER_PDF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, filename, waitForFonts: true }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Render server error: ${response.status}`);
    }

    const { pdfBase64 } = await response.json();
    if (!pdfBase64) throw new Error('El servidor no devolvió el PDF');
    return pdfBase64;
  } catch (err) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error(
        'No se pudo conectar al servidor de renderizado. ' +
        'Ejecuta: cd renderer && node scripts/render-server.js'
      );
    }
    throw err;
  }
}
