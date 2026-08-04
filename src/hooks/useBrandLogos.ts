/**
 * useBrandLogos — lists the brand logos available in Supabase Storage.
 *
 * Scans every known logo location instead of a single folder, because they are
 * spread across buckets today:
 *  - `Brand` (root)              → where the presentation logo lives
 *                                  (see the signed URL in presentationTemplates_v2)
 *  - `design-images/brand-icons` → what the editor's brand icon picker uses
 *
 * One level of subfolders is scanned too, so `Brand/xending/logo.png` works and
 * lets the panel narrow logos per brand.
 *
 * URLs are always signed. Signed URLs work for both public and private buckets,
 * and `Brand` is private (hence the signed URL hardcoded in the templates), so
 * `getPublicUrl` would silently return links that 404.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

const IMG_RE = /\.(png|jpe?g|webp|svg|avif)$/i
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7

/** Where logos may live. Missing buckets are skipped silently. */
const LOGO_SOURCES: Array<{ bucket: string; prefix: string }> = [
  { bucket: 'Brand', prefix: '' },
  { bucket: 'design-images', prefix: 'brand-icons' },
]

/** Upload target — `design-images` is the bucket the app already writes to. */
const UPLOAD_BUCKET = 'design-images'
const UPLOAD_PREFIX = 'brand-icons'
/** Portraits live apart so they never show up in the logo picker. */
const PROMOTER_PREFIX = 'promoter-photos'

export interface BrandLogo {
  name: string
  url: string
  bucket: string
  /** Subfolder inside the source prefix, when logos are filed per brand. */
  folder: string | null
}

function joinPath(...parts: Array<string | null | undefined>): string {
  return parts.filter((part) => !!part).join('/')
}

/** List image files in one bucket path and sign them in a single round trip. */
async function listSigned(
  bucket: string,
  path: string,
  folder: string | null,
): Promise<BrandLogo[]> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(path, { limit: 500, sortBy: { column: 'name', order: 'asc' } })

  if (error || !data) return []

  // `id === null` marks a subfolder entry, not a file.
  const files = data.filter((item) => item.id !== null && IMG_RE.test(item.name))
  if (files.length === 0) return []

  const paths = files.map((item) => joinPath(path, item.name))
  const { data: signed, error: signError } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) return []

  return signed.flatMap((entry, index) =>
    entry.signedUrl
      ? [{ name: files[index].name, url: entry.signedUrl, bucket, folder }]
      : [],
  )
}

/** Subfolder names directly under a bucket path. */
async function listSubfolders(bucket: string, path: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(path, { limit: 500, sortBy: { column: 'name', order: 'asc' } })

  if (error || !data) return []
  return data.filter((item) => item.id === null).map((item) => item.name)
}

async function fetchBrandLogos(): Promise<BrandLogo[]> {
  const perSource = await Promise.all(
    LOGO_SOURCES.map(async (source) => {
      const root = source.prefix
      const subfolders = await listSubfolders(source.bucket, root)

      const batches = await Promise.all([
        listSigned(source.bucket, root, null),
        ...subfolders.map((folder) =>
          listSigned(source.bucket, joinPath(root, folder), folder),
        ),
      ])

      return batches.flat()
    }),
  )

  return perSource.flat()
}

export function useBrandLogos(brandKey?: string | null) {
  const query = useQuery({
    queryKey: ['brand-logos'],
    queryFn: fetchBrandLogos,
    staleTime: 5 * 60_000,
  })

  const all = query.data ?? []

  // Narrow to the active brand when the naming allows it, but never render an
  // empty picker: an unmatched brand falls back to the full list.
  const matched = brandKey
    ? all.filter((logo) => {
        const key = brandKey.toLowerCase()
        const bare = key.replace(/^xending_?/, '')
        const name = logo.name.toLowerCase()
        return (
          logo.folder?.toLowerCase() === key ||
          name.includes(key) ||
          (bare.length > 0 && name.includes(bare))
        )
      })
    : all

  return {
    ...query,
    logos: matched.length > 0 ? matched : all,
    allLogos: all,
  }
}

/**
 * Upload an image from the panel.
 *
 * `kind` keeps portraits out of the logo picker: a promoter headshot filed under
 * `brand-icons/` would show up as a selectable brand logo.
 *  - 'logo'     → `design-images/brand-icons/<brand>/`
 *  - 'promoter' → `design-images/promoter-photos/`
 */
export function useUploadBrandLogo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      file: File
      brandKey?: string | null
      kind?: 'logo' | 'promoter'
    }) => {
      const kind = params.kind ?? 'logo'
      const ext = params.file.name.split('.').pop() || 'png'
      const path =
        kind === 'promoter'
          ? joinPath(
              PROMOTER_PREFIX,
              `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
            )
          : joinPath(
              UPLOAD_PREFIX,
              params.brandKey,
              `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
            )

      const { error } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .upload(path, params.file, { upsert: false })
      if (error) throw new Error(error.message)

      const { data: signed, error: signError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
      if (signError || !signed?.signedUrl) {
        throw new Error(signError?.message || 'No se pudo firmar la URL de la imagen')
      }

      return signed.signedUrl
    },
    onSuccess: (_url, params) => {
      if ((params.kind ?? 'logo') === 'logo') {
        queryClient.invalidateQueries({ queryKey: ['brand-logos'] })
      }
    },
  })
}
