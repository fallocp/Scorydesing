import { z } from 'zod';

export const industryVerticalSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Vertical name is required').max(100, 'Vertical name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  category_id: z.string().uuid(),
  description: z.string().optional(),
  keywords: z.array(z.string()),
  visual_context: z.string().optional(),
  display_order: z.number().int('Display order must be an integer').min(0, 'Display order must be 0 or greater').default(0),
  is_active: z.boolean().default(true),
});

export type IndustryVertical = z.infer<typeof industryVerticalSchema>;
