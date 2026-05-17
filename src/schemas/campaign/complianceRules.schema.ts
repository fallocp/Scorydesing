// Re-export complianceRulesSchema and ComplianceRules from businessTenant to avoid duplication.
// The canonical definition lives in businessTenant.schema.ts.
export { complianceRulesSchema } from './businessTenant.schema';
export type { ComplianceRules } from './businessTenant.schema';
