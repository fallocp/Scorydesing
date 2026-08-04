/**
 * Shared helper for edge functions: encapsulates all communication with
 * the OpenAI Chat Completions API.
 *
 * Replaces direct fetch calls to Anthropic and duplicated fetchWithRetry()
 * functions across edge functions with a single, typed utility.
 *
 * Features:
 * - API key validation from Deno.env
 * - Configurable timeout via AbortController
 * - 1 automatic retry on network errors with backoff
 * - Typed error mapping (rate_limit, auth_error, content_policy, api_error)
 * - Multimodal content support (image_url type)
 * - No API key or prompt content in error messages
 *
 * Requirements: 1.1–1.6, 2.1, 2.2, 3.1–3.4, 4.1–4.4, 8.1, 8.2, 9.1–9.3, 10.1–10.3
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
}

export interface CallOpenAIOptions {
  model?: string;
  messages: OpenAIMessage[];
  max_completion_tokens: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface CallOpenAISuccess {
  success: true;
  content: string;
}

export interface CallOpenAIError {
  success: false;
  error: 'rate_limit' | 'auth_error' | 'content_policy' | 'network_error' | 'api_error';
  message: string;
  status?: number;
  retryAfter?: number;
}

export type CallOpenAIResult = CallOpenAISuccess | CallOpenAIError;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to OpenAI.
 *
 * Handles API key retrieval, timeout, retry on network errors, and
 * error classification. Returns a discriminated union so callers can
 * pattern-match on `result.success`.
 */
export async function callOpenAI(options: CallOpenAIOptions): Promise<CallOpenAIResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'auth_error',
      message: 'OPENAI_API_KEY missing',
      status: 500,
    };
  }

  const {
    model = 'gpt-5.4-mini',
    messages,
    max_completion_tokens,
    temperature = 0.7,
    timeoutMs = 120_000,
  } = options;

  return await fetchWithRetry(
    apiKey,
    { model, messages, max_completion_tokens, temperature },
    timeoutMs,
  );
}

// ---------------------------------------------------------------------------
// Internal: fetch with retry
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  apiKey: string,
  body: object,
  timeoutMs: number,
  retryCount = 0,
): Promise<CallOpenAIResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return { success: true, content };
    }

    // --- HTTP error mapping ---

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '30', 10);
      return {
        success: false,
        error: 'rate_limit',
        message: 'Demasiadas solicitudes.',
        retryAfter,
        status: 429,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        success: false,
        error: 'auth_error',
        message: 'Service unavailable',
        status: response.status,
      };
    }

    if (response.status === 400) {
      const errorBody = await response.text();
      if (errorBody.includes('content_policy') || errorBody.includes('safety')) {
        return {
          success: false,
          error: 'content_policy',
          message: 'Rechazado por políticas de contenido.',
          status: 400,
        };
      }
      // Exponer el motivo real del 400 (p.ej. modelo inexistente o parámetro no
      // soportado) en vez de un mensaje genérico, para poder diagnosticarlo.
      console.error('OpenAI API error 400:', errorBody.slice(0, 500));
      let detail = '';
      try {
        detail = JSON.parse(errorBody)?.error?.message ?? '';
      } catch {
        detail = errorBody.slice(0, 200);
      }
      return {
        success: false,
        error: 'api_error',
        message: detail ? `API error 400: ${detail}` : 'API error: 400',
        status: 400,
      };
    }

    // Other HTTP errors — no retry. Surface OpenAI's actual error reason
    // (e.g. model not found / no access) instead of hiding it.
    const errorBody = await response.text().catch(() => '');
    console.error(`OpenAI API error ${response.status}:`, errorBody.slice(0, 500));
    let detail = '';
    try {
      detail = JSON.parse(errorBody)?.error?.message ?? '';
    } catch {
      detail = errorBody.slice(0, 200);
    }
    return {
      success: false,
      error: 'api_error',
      message: detail ? `API error ${response.status}: ${detail}` : `API error: ${response.status}`,
      status: response.status,
    };
  } catch (_err) {
    // Network error or timeout — retry once with backoff
    if (retryCount < 1) {
      const backoffMs = (retryCount + 1) * 2000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchWithRetry(apiKey, body, timeoutMs, retryCount + 1);
    }

    return {
      success: false,
      error: 'network_error',
      message: 'Error de conexión. Intenta de nuevo.',
      status: 500,
    };
  }
}

// ---------------------------------------------------------------------------
// Streaming support
// ---------------------------------------------------------------------------

export interface CallOpenAIStreamOptions {
  model?: string;
  messages: OpenAIMessage[];
  max_completion_tokens: number;
  temperature?: number;
}

/**
 * Send a streaming chat completion request to OpenAI.
 * Returns a ReadableStream of Server-Sent Events (SSE) text chunks.
 * The caller can pipe this directly to a Response for real-time streaming.
 */
export async function callOpenAIStream(
  options: CallOpenAIStreamOptions,
): Promise<{ success: true; stream: ReadableStream<Uint8Array> } | CallOpenAIError> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return {
      success: false,
      error: 'auth_error',
      message: 'OPENAI_API_KEY missing',
      status: 500,
    };
  }

  const {
    model = 'gpt-5.4-mini',
    messages,
    max_completion_tokens,
    temperature = 0.7,
  } = options;

  // Igual que en callOpenAI: los modelos gpt-5 / o-series solo admiten
  // temperature=1, así que lo omitimos para ellos (evita HTTP 400).
  const reqBody: Record<string, unknown> = { model, messages, max_completion_tokens, stream: true };
  if (supportsCustomTemperature(model)) reqBody.temperature = temperature;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reqBody),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return { success: false, error: 'rate_limit', message: 'Rate limited', status: 429 };
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: 'auth_error', message: 'Auth error', status: response.status };
    }
    return { success: false, error: 'api_error', message: `API error: ${response.status}`, status: response.status };
  }

  if (!response.body) {
    return { success: false, error: 'api_error', message: 'No response body', status: 500 };
  }

  // Transform the OpenAI SSE stream into a simpler text stream for the client
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transformedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Send final event
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') {
              if (trimmed === 'data: [DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
                return;
              }
              continue;
            }

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  // Send just the text chunk as SSE
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`));
        controller.close();
      }
    },
  });

  return { success: true, stream: transformedStream };
}

// ---------------------------------------------------------------------------
// Model capability helpers
// ---------------------------------------------------------------------------

/**
 * Whether a model accepts a custom `temperature`.
 *
 * The gpt-5 family and the o-series reasoning models only allow the default
 * (temperature=1) and reject any other value with HTTP 400, so callers must omit
 * the field entirely for them.
 */
export function supportsCustomTemperature(model: string): boolean {
  const normalized = model.toLowerCase();
  if (normalized.startsWith('gpt-5')) return false;
  if (/^o\d/.test(normalized)) return false;
  return true;
}
