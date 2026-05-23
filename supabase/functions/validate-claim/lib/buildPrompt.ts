/**
 * Prompt Builder for Nivel 2 (OpenAI) claim validation.
 *
 * Fetches the master prompt from the database (or uses fallback),
 * interpolates piece variables, and injects tenant compliance rules
 * into dedicated prompt sections.
 *
 * Requirements: 6.1, 6.2, 6.3, 4.2, 4.3, 4.4
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { fetchMasterPromptByType } from "../../_shared/fetchBusinessContext.ts";
import { interpolateTemplate } from "../../_shared/interpolateTemplate.ts";
import { FALLBACK_CLAIM_VALIDATION_PROMPT } from "./constants.ts";
import type { PieceInput, TenantResolution } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptBuildResult {
  systemPrompt: string;
  userPrompt: string;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Builds the system and user prompts for Nivel 2 claim validation.
 *
 * 1. Fetches the master prompt by type `claim_validation` from the DB.
 * 2. Falls back to the hardcoded prompt if none found.
 * 3. Interpolates piece variables into the template.
 * 4. Injects compliance rules (forbidden_terms, required_qualifiers, max_values).
 * 5. Returns { systemPrompt, userPrompt }.
 */
export async function buildValidationPrompt(
  supabase: SupabaseClient,
  businessId: string,
  piece: PieceInput,
  complianceRules: TenantResolution["complianceRules"],
  brandName: string,
): Promise<PromptBuildResult> {
  // 1. Fetch master prompt or use fallback
  const masterPrompt = await fetchMasterPromptByType(
    supabase,
    businessId,
    "claim_validation",
  );

  const template = masterPrompt ?? FALLBACK_CLAIM_VALIDATION_PROMPT;

  // 2. Interpolate piece variables into the template
  const interpolated = interpolateTemplate(template, {
    brand: brandName,
    headline: piece.headline,
    body: piece.body,
    cta: piece.cta,
    footer: piece.footer ?? "",
    proofPoints: piece.proofPoints,
    avoidClaims: piece.avoidClaims,
  });

  // 3. Build compliance rules sections
  const complianceSections = buildComplianceSections(complianceRules);

  // 4. Construct system prompt (interpolated template + compliance rules)
  const systemPrompt = `${interpolated}\n\n${complianceSections}`;

  // 5. Construct user prompt with the piece content for validation
  const userPrompt = buildUserPrompt(piece);

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the compliance rules sections to inject into the prompt.
 * Each section is clearly delimited for the LLM to parse.
 */
function buildComplianceSections(
  complianceRules: TenantResolution["complianceRules"],
): string {
  const sections: string[] = [];

  // Forbidden terms section
  if (complianceRules.forbidden_terms.length > 0) {
    sections.push(
      `## TÉRMINOS PROHIBIDOS\n\nLos siguientes términos están estrictamente prohibidos. Si aparecen en la pieza, clasifica como riesgo alto:\n- ${complianceRules.forbidden_terms.join("\n- ")}`,
    );
  }

  // Required qualifiers section
  if (complianceRules.required_qualifiers.length > 0) {
    sections.push(
      `## CALIFICADORES OBLIGATORIOS\n\nLos siguientes calificadores DEBEN estar presentes cuando se hacen claims financieros:\n- ${complianceRules.required_qualifiers.join("\n- ")}`,
    );
  }

  // Max values section
  const maxValueEntries = Object.entries(complianceRules.max_values);
  if (maxValueEntries.length > 0) {
    const maxValuesLines = maxValueEntries
      .map(([key, value]) => `- ${key}: ${value}`)
      .join("\n");
    sections.push(
      `## LÍMITES NUMÉRICOS\n\nLos siguientes valores máximos NO deben ser excedidos en las piezas:\n${maxValuesLines}`,
    );
  }

  return sections.join("\n\n");
}

/**
 * Builds the user prompt containing the piece content to validate.
 */
function buildUserPrompt(piece: PieceInput): string {
  const parts = [
    `Valida la siguiente pieza publicitaria:`,
    ``,
    `Headline: ${piece.headline}`,
    `Body: ${piece.body}`,
    `CTA: ${piece.cta}`,
  ];

  if (piece.footer) {
    parts.push(`Footer: ${piece.footer}`);
  }

  if (piece.proofPoints && piece.proofPoints.length > 0) {
    parts.push(`Claims permitidos: ${piece.proofPoints.join(", ")}`);
  }

  if (piece.avoidClaims && piece.avoidClaims.length > 0) {
    parts.push(`Claims a evitar: ${piece.avoidClaims.join(", ")}`);
  }

  parts.push(
    ``,
    `Responde exclusivamente con JSON válido siguiendo el formato especificado.`,
  );

  return parts.join("\n");
}
