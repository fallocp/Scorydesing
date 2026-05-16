import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum rendering timeout in milliseconds
const RENDER_TIMEOUT_MS = 30000;

interface RenderRequest {
  html: string;
  width: number;
  height: number;
  filename: string;
}

serve(async (req) => {
  console.log('render-design-png function started');

  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody: RenderRequest;
    try {
      requestBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (_jsonError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { html, width, height, filename } = requestBody;

    // Validate required fields
    if (!html || !width || !height || !filename) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: html, width, height, filename' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate dimensions
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
      return new Response(
        JSON.stringify({ error: 'Invalid dimensions. Width and height must be between 1 and 4096.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate filename
    if (!/^[\w\-. ]+$/.test(filename)) {
      return new Response(
        JSON.stringify({ error: 'Invalid filename. Use only alphanumeric characters, hyphens, underscores, dots, and spaces.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── Rendering Delegation ───
    // Deno Edge Functions cannot run Puppeteer natively.
    // This function is structured for future integration with an external render service.
    //
    // Options for rendering:
    // 1. External render service (e.g., a Node.js microservice with Puppeteer)
    // 2. Local rendering via xending-design/scripts/render.js
    // 3. Third-party HTML-to-image API (e.g., htmlcsstoimage.com)
    //
    // For now, this returns an informative error directing users to the local render scripts.

    const renderServiceUrl = Deno.env.get('RENDER_SERVICE_URL');

    if (renderServiceUrl) {
      // ─── Future: Proxy to external render service ───
      console.log('Proxying render request to external service:', renderServiceUrl);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);

        const renderResponse = await fetch(renderServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html, width, height, filename }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!renderResponse.ok) {
          const errorText = await renderResponse.text();
          console.error('Render service error:', renderResponse.status, errorText);

          // Classify rendering errors
          if (errorText.includes('font') || errorText.includes('Font')) {
            return new Response(
              JSON.stringify({
                error: 'Rendering failed: missing fonts. The output may use fallback fonts.',
                filename,
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          if (errorText.includes('image') || errorText.includes('img') || errorText.includes('broken')) {
            return new Response(
              JSON.stringify({
                error: 'Rendering failed: broken image references in the HTML template.',
                filename,
              }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ error: `Render service error: ${renderResponse.status}`, filename }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const renderData = await renderResponse.json();

        return new Response(
          JSON.stringify({
            pngBase64: renderData.pngBase64,
            filename: renderData.filename || filename,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err) {
        // Timeout handling
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.error('Render service timeout after', RENDER_TIMEOUT_MS, 'ms');
          return new Response(
            JSON.stringify({
              error: `Rendering timed out after ${RENDER_TIMEOUT_MS / 1000} seconds. The HTML may be too complex or the render service is overloaded.`,
              filename,
            }),
            { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.error('Render service network error:', err);
        return new Response(
          JSON.stringify({ error: 'Failed to connect to render service.', filename }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── No render service configured — return guidance ───
    console.log('No RENDER_SERVICE_URL configured. Returning local render instructions.');

    return new Response(
      JSON.stringify({
        error: 'render_not_available',
        message: 'PNG rendering is not available via this Edge Function. Deno Edge Functions cannot run Puppeteer natively. Please use the local render scripts in the xending-design/ project.',
        instructions: {
          singleRender: 'cd xending-design && npm run render -- <html-file-path>',
          batchRender: 'cd xending-design && npm run render-batch -- <directory-or-file-list>',
          setup: 'cd xending-design && npm install',
        },
        renderServiceSetup: 'To enable remote rendering, set the RENDER_SERVICE_URL Supabase secret to point to a Node.js service with Puppeteer that accepts POST { html, width, height, filename } and returns { pngBase64, filename }.',
        requestReceived: {
          width,
          height,
          filename,
          htmlLength: html.length,
        },
      }),
      {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
