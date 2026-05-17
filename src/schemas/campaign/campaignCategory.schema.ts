import { z } from 'zod';

export const campaignCategorySchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Category name is required').max(100, 'Category name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  display_order: z.number().int('Display order must be an integer').min(0, 'Display order must be 0 or greater').default(0),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

export type CampaignCategory = z.infer<typeof campaignCategorySchema>;
