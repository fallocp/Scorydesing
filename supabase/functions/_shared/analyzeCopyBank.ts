/**
 * Turns the live copy bank into generation instructions.
 *
 * This is the piece that makes variety deterministic. Instead of asking the
 * model to "be diverse" — which v1 did at length, with poor results — we read
 * what the bank already has, subtract it from the target quota, and hand the
 * model an explicit assignment: "2 of segunda_cotizacion, 1 of
 * simplificacion_cuentas, don't open with 'El costo'".
 *
 * Also powers the weekly proposal job: same computation, 5 copies instead of 3.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import type { BankState, CopyKit } from "./buildCopyPromptV2.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopyBankRow {
  headline: string;
  cta: string | null;
  angle_tag: string | null;
  corridor: string | null;
  status: string | null;
  created_at?: string;
}

export interface ComputeBankStateParams {
  supabase: SupabaseClient;
  businessId: string;
  kit: CopyKit;
  branchSlug: string;
  /** When set, angle deficit is computed within that corridor only. */
  corridor?: string | null;
  quantity: number;
  /** How many recent headlines to feed back as "do not repeat". */
  headlineLimit?: number;
  /** Rows to consider. Defaults to approved + seeded. */
  statuses?: string[];
}

export interface ComputeBankStateResult {
  bankState: BankState;
  /** Corridor with the largest quota deficit, when the caller did not pick one. */
  suggestedCorridor: string | null;
  totals: { rows: number; withAngle: number };
}

const DEFAULT_HEADLINE_LIMIT = 40;
const DEFAULT_STATUSES = ["approved", "seed"];

/** An opening is saturated once it accounts for this share of the bank. */
const SATURATION_SHARE = 0.06;
/** ...or once it appears at least this many times, whichever hits first. */
const SATURATION_MIN_COUNT = 4;

// ---------------------------------------------------------------------------
// Pure helpers — unit-testable without a DB
// ---------------------------------------------------------------------------

export function countBy<T>(items: T[], key: (t: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/** First two words of a headline, lowercased and unaccented. */
export function openingOf(headline: string): string {
  return headline
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
}

export function saturatedOpenings(headlines: string[]): string[] {
  if (headlines.length === 0) return [];
  const counts = countBy(headlines, openingOf);
  const threshold = Math.max(SATURATION_MIN_COUNT, Math.ceil(headlines.length * SATURATION_SHARE));
  return Object.entries(counts)
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([opening]) => opening);
}

/**
 * Distributes `quantity` slots across the angles that are furthest below quota.
 *
 * Deficit is measured in percentage points, so a bank of 4 and a bank of 400
 * behave the same way. Angles at or above quota get nothing until the
 * under-served ones are covered. With an empty bank, every angle has its full
 * quota as deficit, so the assignment simply follows the quota.
 */
export function assignTargetAngles(
  quota: Record<string, number> | undefined,
  angleCounts: Record<string, number>,
  quantity: number,
): { angleTag: string; count: number }[] {
  if (!quota || Object.keys(quota).length === 0) return [];

  const total = Object.values(angleCounts).reduce((a, b) => a + b, 0);

  const deficits = Object.entries(quota)
    .map(([tag, target]) => {
      const actual = total > 0 ? ((angleCounts[tag] ?? 0) / total) * 100 : 0;
      return { tag, deficit: target - actual, target };
    })
    // Ties broken by the larger quota, so the strategically bigger angle wins.
    .sort((a, b) => b.deficit - a.deficit || b.target - a.target);

  const assignment: { angleTag: string; count: number }[] = [];
  let remaining = quantity;

  // One slot per under-quota angle, in deficit order. Spreading beats stacking:
  // three copies on one angle read as three variations of the same idea.
  for (const d of deficits) {
    if (remaining === 0) break;
    if (d.deficit <= 0) continue;
    assignment.push({ angleTag: d.tag, count: 1 });
    remaining -= 1;
  }

  /*
   * Quedan espacios. Antes de darle un segundo a cualquier ángulo, se le da el
   * primero a los que todavía no tienen ninguno, aunque estén sobre cuota.
   *
   * Una tanda se revisa y se publica completa, así que doce ángulos distintos se
   * leen como doce ideas y dos copys del mismo ángulo se leen como una idea con
   * una variación. Con un banco desbalanceado —el de costos tiene 32% en un solo
   * ángulo— solo 9 de 12 ángulos quedan en déficit, y sin esto el décimo espacio
   * de una tanda de 10 repetía el primero en vez de estrenar uno.
   */
  for (const d of deficits) {
    if (remaining === 0) break;
    if (assignment.some((a) => a.angleTag === d.tag)) continue;
    assignment.push({ angleTag: d.tag, count: 1 });
    remaining -= 1;
  }

  // Ya no hay ángulos sin estrenar: recién ahí se apila, ciclando en orden de
  // déficit para que el más atrasado reciba el refuerzo primero.
  let i = 0;
  while (remaining > 0 && deficits.length > 0) {
    const tag = deficits[i % deficits.length].tag;
    const existing = assignment.find((a) => a.angleTag === tag);
    if (existing) existing.count += 1;
    else assignment.push({ angleTag: tag, count: 1 });
    remaining -= 1;
    i += 1;
  }

  return assignment;
}

/** Corridor with the largest quota deficit. Null when the kit has no corridor quota. */
export function suggestCorridor(
  quota: Record<string, number> | undefined,
  corridorCounts: Record<string, number>,
  available: string[],
): string | null {
  if (!quota || Object.keys(quota).length === 0) return null;

  const total = Object.values(corridorCounts).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(quota)
    .filter(([slug]) => available.includes(slug))
    .map(([slug, target]) => {
      const actual = total > 0 ? ((corridorCounts[slug] ?? 0) / total) * 100 : 0;
      return { slug, deficit: target - actual };
    })
    .sort((a, b) => b.deficit - a.deficit);

  return ranked[0]?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function computeBankState(
  params: ComputeBankStateParams,
): Promise<ComputeBankStateResult> {
  const {
    supabase,
    businessId,
    kit,
    branchSlug,
    corridor = null,
    quantity,
    headlineLimit = DEFAULT_HEADLINE_LIMIT,
    statuses = DEFAULT_STATUSES,
  } = params;

  const { data, error } = await supabase
    .from("copy_bank_items")
    .select("headline, cta, angle_tag, corridor, status, created_at")
    .eq("business_id", businessId)
    .eq("branch_slug", branchSlug)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`copy_bank_items query failed: ${error.message}`);

  const rows = (data ?? []) as CopyBankRow[];

  // Corridor counts come from the whole branch; angle counts and saturated
  // openings are scoped to the corridor being generated, because "el costo" may
  // be exhausted in china_asia and still be fresh elsewhere.
  const corridorCounts = countBy(rows, (r) => r.corridor);
  const scoped = corridor ? rows.filter((r) => r.corridor === corridor) : rows;

  const angleCounts = countBy(scoped, (r) => r.angle_tag);
  const ctaUsage = countBy(scoped, (r) => r.cta);
  const headlines = scoped.map((r) => r.headline).filter(Boolean);

  const targetAngles = assignTargetAngles(kit.angle_quota, angleCounts, quantity);

  const kitOpenings = (kit.banned_openings ?? []).map((o) => o.toLowerCase());
  const measured = saturatedOpenings(headlines);
  const mergedOpenings = [...new Set([...kitOpenings, ...measured])];

  const bankState: BankState = {
    angleCounts,
    corridorCounts,
    targetAngles,
    saturatedOpenings: mergedOpenings,
    ctaUsage,
    recentHeadlines: headlines.slice(0, headlineLimit),
  };

  return {
    bankState,
    suggestedCorridor: suggestCorridor(
      kit.corridor_quota,
      corridorCounts,
      Object.keys(kit.corridors),
    ),
    totals: { rows: rows.length, withAngle: Object.values(angleCounts).reduce((a, b) => a + b, 0) },
  };
}
