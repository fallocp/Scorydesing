/**
 * Retry wrapper for Supabase Edge Function calls.
 * Handles intermittent 503 errors from cold starts by retrying automatically.
 */

import { supabase } from '@/integrations/supabase/client';

interface InvokeOptions {
  body: Record<string, unknown>;
}

const RETRY_STATUS_CODES = [503, 502, 504];
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invoke a Supabase Edge Function with automatic retry on 503/502/504 errors.
 * Retries up to 2 times with a 1.5s delay between attempts.
 */
export async function invokeWithRetry<T = unknown>(
  functionName: string,
  options: InvokeOptions
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_DELAY_MS);
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options.body,
    });

    if (error) {
      // Check if it's a retryable status code error
      const isRetryable = RETRY_STATUS_CODES.some(
        (code) => error.message?.includes(String(code)) || error.message?.includes('non-2xx')
      );

      if (isRetryable && attempt < MAX_RETRIES) {
        console.warn(`[retry] ${functionName} attempt ${attempt + 1} failed (${error.message}), retrying...`);
        lastError = new Error(error.message || `Error calling ${functionName}`);
        continue;
      }

      throw new Error(error.message || `Error calling ${functionName}`);
    }

    if (data?.error) {
      throw new Error(data.message || data.error);
    }

    return data as T;
  }

  throw lastError || new Error(`Failed after ${MAX_RETRIES + 1} attempts`);
}
