/**
 * Version Persister — Compliance Wizard
 *
 * Persiste reglas aprobadas, crea versiones inmutables, maneja rollbacks,
 * y permite desactivar la validación sin perder reglas.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import { ComplianceRules } from "./index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleVersion {
  id: string;
  business_id: string;
  version_number: number;
  rules_snapshot: ComplianceRules;
  change_summary: string;
  created_by: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// persistRules
// ---------------------------------------------------------------------------

/**
 * Persiste un nuevo conjunto de reglas de compliance.
 *
 * Lógica:
 * 1. Obtener max version_number para el tenant
 * 2. Insertar nueva fila en compliance_rule_versions con version_number + 1
 * 3. Actualizar business_tenants.compliance_rules con las nuevas reglas
 * 4. Actualizar business_tenants.claim_validation_enabled = true
 * 5. Si cualquier paso falla → retornar error sin perder estado
 *
 * Requirements: 5.1, 5.2, 5.5, 6.1
 */
export async function persistRules(
  supabase: SupabaseClient,
  businessId: string,
  rules: ComplianceRules,
  changeSummary: string,
  userId: string,
): Promise<{ success: boolean; version: number; error?: string }> {
  try {
    // 1. Get max version_number for this tenant
    const { data: maxVersionRow, error: maxError } = await supabase
      .from('compliance_rule_versions')
      .select('version_number')
      .eq('business_id', businessId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxError) {
      return { success: false, version: 0, error: `Error reading version history: ${maxError.message}` };
    }

    const nextVersion = (maxVersionRow?.version_number ?? 0) + 1;

    // 2. Insert new version row
    const { error: insertError } = await supabase
      .from('compliance_rule_versions')
      .insert({
        business_id: businessId,
        version_number: nextVersion,
        rules_snapshot: rules,
        change_summary: changeSummary,
        created_by: userId,
      });

    if (insertError) {
      return { success: false, version: 0, error: `Error creating version: ${insertError.message}` };
    }

    // 3. Update business_tenants.compliance_rules
    const { error: updateRulesError } = await supabase
      .from('business_tenants')
      .update({ compliance_rules: rules })
      .eq('id', businessId);

    if (updateRulesError) {
      return { success: false, version: nextVersion, error: `Error updating compliance rules: ${updateRulesError.message}` };
    }

    // 4. Update business_tenants.claim_validation_enabled = true
    const { error: enableError } = await supabase
      .from('business_tenants')
      .update({ claim_validation_enabled: true })
      .eq('id', businessId);

    if (enableError) {
      return { success: false, version: nextVersion, error: `Error enabling validation: ${enableError.message}` };
    }

    return { success: true, version: nextVersion };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, version: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// rollbackToVersion
// ---------------------------------------------------------------------------

/**
 * Restaura una versión anterior de las reglas.
 *
 * Lógica:
 * 1. Leer el snapshot de la versión seleccionada
 * 2. Llamar a persistRules con ese snapshot (crea nueva versión, no elimina historial)
 *
 * Requirements: 6.3, 6.4
 */
export async function rollbackToVersion(
  supabase: SupabaseClient,
  businessId: string,
  versionId: string,
  userId: string,
): Promise<{ success: boolean; version: number; rules?: ComplianceRules; error?: string }> {
  // 1. Read the snapshot from the selected version
  const { data: versionRow, error: readError } = await supabase
    .from('compliance_rule_versions')
    .select('version_number, rules_snapshot')
    .eq('id', versionId)
    .eq('business_id', businessId)
    .single();

  if (readError || !versionRow) {
    return {
      success: false,
      version: 0,
      error: readError?.message ?? 'Version not found',
    };
  }

  const snapshot = versionRow.rules_snapshot as ComplianceRules;
  const changeSummary = `Rollback to version ${versionRow.version_number}`;

  // 2. Call persistRules with the snapshot (creates new version, doesn't delete history)
  const result = await persistRules(supabase, businessId, snapshot, changeSummary, userId);

  if (!result.success) {
    return { success: false, version: 0, error: result.error };
  }

  return { success: true, version: result.version, rules: snapshot };
}

// ---------------------------------------------------------------------------
// getVersionHistory
// ---------------------------------------------------------------------------

/**
 * Lista versiones del tenant ordenadas por version_number DESC.
 *
 * Requirements: 6.2
 */
export async function getVersionHistory(
  supabase: SupabaseClient,
  businessId: string,
): Promise<RuleVersion[]> {
  const { data, error } = await supabase
    .from('compliance_rule_versions')
    .select('id, business_id, version_number, rules_snapshot, change_summary, created_by, created_at')
    .eq('business_id', businessId)
    .order('version_number', { ascending: false });

  if (error) {
    throw new Error(`Error loading version history: ${error.message}`);
  }

  return (data ?? []) as RuleVersion[];
}

// ---------------------------------------------------------------------------
// disableValidation
// ---------------------------------------------------------------------------

/**
 * Desactiva la validación sin tocar compliance_rules.
 *
 * Lógica:
 * 1. Set claim_validation_enabled = false sin modificar compliance_rules
 *
 * Requirements: 5.4
 */
export async function disableValidation(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('business_tenants')
    .update({ claim_validation_enabled: false })
    .eq('id', businessId);

  if (error) {
    return { success: false, error: `Error disabling validation: ${error.message}` };
  }

  return { success: true };
}
