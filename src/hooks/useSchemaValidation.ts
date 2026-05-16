/**
 * Hook that provides Zod schema instances for entity validation in forms.
 *
 * Centralizes access to all campaign architecture schemas so that form
 * components and the onboarding wizard can validate input consistently.
 *
 * Requirements: 15.1, 15.8
 */

import {
  businessTenantSchema,
  campaignCategorySchema,
  commercialBranchSchema,
  strategicConfigSchema,
  industryVerticalSchema,
  marketMomentSchema,
  masterPromptSchema,
  businessChannelSchema,
  businessAngleSchema,
  complianceRulesSchema,
} from '@/schemas/campaign';

/**
 * Returns all campaign architecture Zod schemas for use in form validation.
 *
 * Usage:
 * ```ts
 * const { schemas } = useSchemaValidation();
 * const result = schemas.commercialBranch.safeParse(formData);
 * ```
 */
export function useSchemaValidation() {
  return {
    schemas: {
      businessTenant: businessTenantSchema,
      campaignCategory: campaignCategorySchema,
      commercialBranch: commercialBranchSchema,
      strategicConfig: strategicConfigSchema,
      industryVertical: industryVerticalSchema,
      marketMoment: marketMomentSchema,
      masterPrompt: masterPromptSchema,
      businessChannel: businessChannelSchema,
      businessAngle: businessAngleSchema,
      complianceRules: complianceRulesSchema,
    },
  };
}
