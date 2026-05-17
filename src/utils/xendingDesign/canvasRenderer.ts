import type { Brand } from '@/types/xendingDesign';
import { supabase } from '@/integrations/supabase/client';

const RENDER_SERVER_URL = 'http://localhost:3333/render';

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
  height = 1920
): Promise<string> {
  try {
    const renderResponse = await fetch(RENDER_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, width, height, filename: `${brand}-piece.png` }),
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

/**
 * Combined: generate HTML + render to PNG (backward compatible)
 */
export async function renderPieceToCanvas(params: RenderPieceParams): Promise<string> {
  const html = await generatePieceHtml(params);
  return renderHtmlToPng(html, params.brand, params.width || 1080, params.height || 1920);
}
