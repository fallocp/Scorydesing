import { z } from 'zod';

export const marketMomentSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Moment name is required').max(100, 'Moment name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  category_id: z.string().uuid(),
  trigger_type: z.string().min(1, 'Trigger type is required'),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

export type MarketMoment = z.infer<typeof marketMomentSchema>;
