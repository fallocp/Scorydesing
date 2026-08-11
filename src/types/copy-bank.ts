/**
 * Types for the v2 copy bank (`copy_bank_items`).
 *
 * Separate from `generated_ideas` / `DesignStudioIdeaMeta`: that table backs the
 * v1 flow and its `piece_v2` column carries multi-channel output the v2 contract
 * dropped. Keeping them apart means the v1 path keeps working untouched.
 */

import type {
  CarouselMeta,
  CorridorOverride,
  DesignImageType,
  MasterImagePromptVersion,
} from './design-studio';

/** Lifecycle of a bank item. */
export type CopyBankStatus = 'proposed' | 'approved' | 'rejected' | 'seed' | 'archived';

/** Where the copy came from. */
export type CopyBankSource = 'agent' | 'seed' | 'manual';

/**
 * Image prompt state for a copy. The v2 equivalent of the image half of
 * `DesignStudioIdeaMeta`, without the copy fields that now live in columns.
 */
export interface CopyBankImageMeta {
  imageType?: DesignImageType;
  imagePrompt?: string;
  /** Matches DESIGN_STUDIO_IMAGE_PROMPT_REVISION; stale values force a rebuild. */
  imagePromptRevision?: string;
  /** 'carousel' once a 4-slide set exists for this copy. */
  imageMode?: 'single' | 'carousel';
  carousel?: CarouselMeta;
  masterImagePromptVersion?: MasterImagePromptVersion;
  imageBackgroundStyle?: string;
  corridorOverride?: CorridorOverride;
  corridorAnalysis?: unknown;
}

/** A row of `copy_bank_items`. */
export interface CopyBankRow {
  id: string;
  business_id: string;

  branch_slug: string;
  corridor: string | null;
  industry: string | null;

  headline: string;
  subcopy: string;
  cta: string;
  cta_alt: string[];

  angle_tag: string | null;
  angle_label: string | null;
  formula: string | null;
  tone_bucket: string | null;

  needs_legal_note: boolean;
  legal_note: string | null;

  status: CopyBankStatus;
  review_note: string | null;

  prompt_revision: string | null;
  kit_version: string | null;
  model: string | null;
  source: CopyBankSource;
  week_batch: string | null;

  lint: unknown | null;

  used_at: string | null;
  used_note: string | null;
  used_by: string | null;

  image_meta: CopyBankImageMeta | null;

  created_at: string;
  updated_at: string;
}

/** Filters applied client-side over the fetched bank. */
export interface CopyBankFilters {
  branch: string | null;
  corridor: string | null;
  angleTag: string | null;
  industry: string | null;
  /** 'available' hides used copies, 'used' shows only those, 'all' shows both. */
  usage: 'available' | 'used' | 'all';
  /** Free-text match over headline + subcopy. */
  search: string;
}

export const DEFAULT_COPY_BANK_FILTERS: CopyBankFilters = {
  branch: null,
  corridor: null,
  angleTag: null,
  industry: null,
  usage: 'available',
  search: '',
};

/** Human labels for the corridor slugs used by both kits. */
export const CORRIDOR_LABELS: Record<string, string> = {
  china_asia: 'China y Asia',
  internacional_general: 'Internacional',
  industria: 'Por industria',
  usa: 'Estados Unidos',
  europa: 'Europa',
  institucional: 'Institucional',
  // Coberturas is not segmented by geography — FX risk reads the same for China,
  // the US or Europe — so its corridors are levels of concreteness instead.
  general: 'General',
};

export const BRANCH_LABELS: Record<string, string> = {
  velocidad: 'Velocidad',
  'costos-ahorro': 'Costos y ahorro',
  coberturas: 'Coberturas y forwards',
};

export function corridorLabel(slug: string | null): string {
  if (!slug) return 'Sin corredor';
  return CORRIDOR_LABELS[slug] ?? slug;
}

export function branchLabel(slug: string | null): string {
  if (!slug) return 'Sin rama';
  return BRANCH_LABELS[slug] ?? slug;
}

/** Turns `impacto_acumulado` into `Impacto acumulado` when no label was stored. */
export function angleLabelOf(row: CopyBankRow): string {
  if (row.angle_label?.trim()) return row.angle_label;
  if (!row.angle_tag) return 'Sin ángulo';
  const s = row.angle_tag.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Counts per key, for the filter chips and the distribution view. */
export function tallyBy(
  rows: CopyBankRow[],
  key: (r: CopyBankRow) => string | null,
): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Maps a v2 `branch_slug` onto the matching `commercial_branches` row.
 *
 * The v2 bank keys copy by kit slug (`velocidad`, `costos-ahorro`) while the rest
 * of Design Studio keys everything by commercial branch UUID. Downstream agents
 * that take a `branch_id` — the carousel script most of all — must receive the
 * branch of the COPY, not whatever the UI selector happens to be on. Otherwise a
 * costos copy spawns velocidad narrative: "Los aranceles no son el único costo"
 * producing a slide about "tres días de espera" and "frenar embarque".
 *
 * Matching is heuristic on purpose: branch names are editorial ("Ahorro / Costos
 * Ocultos", "Velocidad - Mismo Día") and change without notice, so we look for
 * the theme rather than an exact slug.
 */
export function resolveBranchForKitSlug<T extends { id: string; slug: string; name: string }>(
  branches: T[],
  kitSlug: string | null,
): T | null {
  if (!kitSlug || branches.length === 0) return null;

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Exact slug match first: the cheapest and most reliable path.
  const exact = branches.find((b) => norm(b.slug) === norm(kitSlug));
  if (exact) return exact;

  const themes: Record<string, RegExp> = {
    velocidad: /velocidad|mismo\s*dia|rapidez|same\s*day/,
    'costos-ahorro': /costo|ahorro|tipo\s*de\s*cambio|\bfx\b|spread/,
    // Matches the `cobertura-cambiaria` commercial branch, which predates the
    // copy bank and is already seeded with content_ingredients.
    coberturas: /cobertura|forward|hedg|riesgo\s*cambiario/,
  };
  const theme = themes[kitSlug];
  if (!theme) return null;

  return (
    branches.find((b) => theme.test(norm(b.slug)) || theme.test(norm(b.name))) ?? null
  );
}

/** Applies the filter set. Kept pure so it can be unit-tested. */
export function applyCopyBankFilters(
  rows: CopyBankRow[],
  f: CopyBankFilters,
): CopyBankRow[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.branch && r.branch_slug !== f.branch) return false;
    if (f.corridor && r.corridor !== f.corridor) return false;
    if (f.angleTag && r.angle_tag !== f.angleTag) return false;
    if (f.industry && r.industry !== f.industry) return false;
    if (f.usage === 'available' && r.used_at) return false;
    if (f.usage === 'used' && !r.used_at) return false;
    if (needle) {
      const hay = `${r.headline} ${r.subcopy} ${r.cta}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}
