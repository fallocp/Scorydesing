import { z } from 'zod';

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const fontsSchema = z.object({
  display: z.string().min(1, 'Display font is required'),
  body: z.string().min(1, 'Body font is required'),
  mono: z.string().min(1, 'Mono font is required'),
});

export const complianceRulesSchema = z.object({
  forbidden_terms: z.array(z.string()),
  required_qualifiers: z.array(z.string()),
  max_values: z.record(z.string(), z.string()),
});

export const businessTenantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Business name is required'),
  slug: z.string().min(1, 'Slug is required').regex(slugRegex, 'Slug must be URL-safe (lowercase alphanumeric and hyphens)'),
  industry: z.string().optional(),
  logo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  primary_color: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g., #FF7A4A)'),
  secondary_color: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g., #2ED4C7)'),
  accent_color: z.string().regex(hexColorRegex, 'Must be a valid hex color (e.g., #0F1419)'),
  fonts: fontsSchema,
  disclaimer: z.string().min(1, 'Disclaimer is required'),
  short_disclaimer: z.string().min(1, 'Short disclaimer is required'),
  compliance_rules: complianceRulesSchema,
  is_active: z.boolean().default(true),
});

export type Fonts = z.infer<typeof fontsSchema>;
export type ComplianceRules = z.infer<typeof complianceRulesSchema>;
export type BusinessTenant = z.infer<typeof businessTenantSchema>;
