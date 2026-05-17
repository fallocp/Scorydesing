import { z } from 'zod';

export const strategicConfigSchema = z.object({
  objetivo: z.string().min(10, 'Objetivo must be at least 10 characters'),
  insight: z.string().min(1, 'Insight is required'),
  dolor: z.string().min(1, 'Dolor is required'),
  promesa: z.string().min(1, 'Promesa is required'),
  audiencia: z.string().min(1, 'Audiencia is required'),
  angulos: z.array(z.string()).min(1, 'At least one angle is required'),
  claims_permitidos: z.array(z.string()),
  claims_prohibidos: z.array(z.string()),
  ctas: z.array(z.string()).min(1, 'At least one CTA is required'),
  footers: z.array(z.string()),
  guia_visual: z.string(),
});

export const commercialBranchSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Branch name is required').max(100, 'Branch name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  category_id: z.string().uuid(),
  strategic_config: strategicConfigSchema,
  display_order: z.number().int('Display order must be an integer').min(0, 'Display order must be 0 or greater').default(0),
  is_active: z.boolean().default(true),
});

export type StrategicConfig = z.infer<typeof strategicConfigSchema>;
export type CommercialBranch = z.infer<typeof commercialBranchSchema>;
