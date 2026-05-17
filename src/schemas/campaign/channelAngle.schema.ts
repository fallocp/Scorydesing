import { z } from 'zod';

export const businessChannelSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Channel name is required').max(100, 'Channel name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  platform_format: z.string().optional(),
  display_order: z.number().int('Display order must be an integer').min(0, 'Display order must be 0 or greater').default(0),
  is_active: z.boolean().default(true),
});

export const businessAngleSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  name: z.string().min(1, 'Angle name is required').max(100, 'Angle name must be 100 characters or less'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be 100 characters or less'),
  description: z.string().optional(),
  display_order: z.number().int('Display order must be an integer').min(0, 'Display order must be 0 or greater').default(0),
  is_active: z.boolean().default(true),
});

export type BusinessChannel = z.infer<typeof businessChannelSchema>;
export type BusinessAngle = z.infer<typeof businessAngleSchema>;
