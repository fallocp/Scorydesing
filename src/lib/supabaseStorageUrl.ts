/**
 * Public Storage URL built from the configured Supabase URL (VITE_SUPABASE_URL), so the same code
 * works against the local Supabase and the hosted one. Only for public buckets (Brand, design-images).
 */
export function publicStorageUrl(bucket: string, path: string): string {
  // `env?.`: bundles built outside Vite (esbuild iife in browser tests) have no import.meta.env.
  const base = String(import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

/** Xending orb logo in the root of the public Brand bucket. */
export const XENDING_BRAND_LOGO_URL = publicStorageUrl('Brand', 'Xending%20bola%20logoabril26.png');
