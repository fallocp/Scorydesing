/**
 * Copy kit registry — resolves the editorial layer for a branch.
 *
 * Mirrors the pattern already used for images in generate-design-image:
 * the kit lives in code by default (versioned, diffable, deployed atomically
 * with the prompt that consumes it), with an opt-in database override for
 * editing without a redeploy.
 *
 *   COPY_KIT_SOURCE=database   read from copy_kits table, fall back to code
 *   COPY_KIT_SOURCE unset      code only (default)
 *
 * Kits live next to this file rather than in docs/ so there is exactly one
 * source of truth. docs/prompts/masterCopyPrompt_v2.md documents the universal
 * layer and points here for the editorial layer.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0?deps=@supabase/storage-js@2.10.4";
import type { CopyKit } from "./buildCopyPromptV2.ts";
import { BRANCH_KIT_SLUGS, resolveKitSlug } from "./branchSlug.ts";

/**
 * `resolveKitSlug` se movió a `branchSlug.ts` y se reexporta desde aquí.
 *
 * Este módulo importa el cliente de Supabase desde esm.sh, así que no lo puede
 * importar el frontend, y la resolución de rama sí la necesita ahí. Se reexporta
 * para no cambiarle la API pública a nadie.
 */
export { resolveKitSlug };
export type { BranchKitSlug } from "./branchSlug.ts";

import velocidadKit from "./copy-kits/velocidad.json" with { type: "json" };
import costosAhorroKit from "./copy-kits/costos-ahorro.json" with { type: "json" };
import coberturasKit from "./copy-kits/coberturas.json" with { type: "json" };
import cuentaMultidivisaKit from "./copy-kits/cuenta-multidivisa.json" with { type: "json" };

import plataformaMultidivisaUsaKit from "./copy-kits/plataforma-multidivisa-usa.json" with { type: "json" };
import velocidadUsaKit from "./copy-kits/velocidad-usa.json" with { type: "json" };
import costosAhorroUsaKit from "./copy-kits/costos-ahorro-usa.json" with { type: "json" };
import masivosUsaKit from "./copy-kits/masivos-usa.json" with { type: "json" };
import coberturasUsaKit from "./copy-kits/coberturas-usa.json" with { type: "json" };

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Dos mercados, sin nada compartido en esta capa.
 *
 * Los kits de USA no derivan de los de México y no se les cae encima ningún
 * default: el comprador es otro (empresa estadounidense, base USD), y el kit de
 * México describe a una empresa mexicana con base MXN. Mezclarlos produce una
 * pieza con la capa editorial del mercado equivocado, que es el fallo que el
 * guard de `branchSlug.ts` existe para hacer visible.
 */
const KITS: Record<string, CopyKit> = {
  // México
  velocidad: velocidadKit as unknown as CopyKit,
  "costos-ahorro": costosAhorroKit as unknown as CopyKit,
  coberturas: coberturasKit as unknown as CopyKit,
  "cuenta-multidivisa": cuentaMultidivisaKit as unknown as CopyKit,
  // Estados Unidos
  "plataforma-multidivisa-usa": plataformaMultidivisaUsaKit as unknown as CopyKit,
  "velocidad-usa": velocidadUsaKit as unknown as CopyKit,
  "costos-ahorro-usa": costosAhorroUsaKit as unknown as CopyKit,
  "masivos-usa": masivosUsaKit as unknown as CopyKit,
  "coberturas-usa": coberturasUsaKit as unknown as CopyKit,
};

export function listCopyKitSlugs(): string[] {
  return [...BRANCH_KIT_SLUGS];
}

export interface GetCopyKitResult {
  kit: CopyKit;
  slug: string;
  source: "code" | "database";
}

/**
 * Resolve a kit for a branch. Throws when the slug cannot be mapped, so the
 * caller returns a 400 instead of silently generating off-brand copy.
 */
export async function getCopyKit(
  branchSlugOrName: string,
  supabase?: SupabaseClient,
  businessId?: string,
): Promise<GetCopyKitResult> {
  const slug = resolveKitSlug(branchSlugOrName);
  if (!slug) {
    throw new Error(
      `No hay copy_kit para la rama "${branchSlugOrName}". Disponibles: ${listCopyKitSlugs().join(", ")}.`,
    );
  }

  const useDb = Deno.env.get("COPY_KIT_SOURCE") === "database";
  if (useDb && supabase && businessId) {
    try {
      const { data } = await supabase
        .from("copy_kits")
        .select("kit")
        .eq("business_id", businessId)
        .eq("branch_slug", slug)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.kit) {
        return { kit: data.kit as CopyKit, slug, source: "database" };
      }
    } catch (err) {
      // Non-fatal: an unreachable or missing table falls back to the code kit.
      console.warn("copy_kits lookup failed, usando kit del código:", err);
    }
  }

  return { kit: KITS[slug], slug, source: "code" };
}

/** Synchronous accessor for the code kit. Used by tests and tooling. */
export function getCopyKitFromCode(branchSlugOrName: string): CopyKit {
  const slug = resolveKitSlug(branchSlugOrName);
  if (!slug) throw new Error(`No hay copy_kit para "${branchSlugOrName}".`);
  return KITS[slug];
}
