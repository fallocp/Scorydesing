import { z } from 'zod';

export const masterPromptSchema = z.object({
  id: z.string().uuid().optional(),
  business_id: z.string().uuid(),
  prompt_text: z.string().min(10, 'Prompt text must be at least 10 characters'),
  version: z.number().int('Version must be an integer').min(1, 'Version must be 1 or greater'),
});

export type MasterPrompt = z.infer<typeof masterPromptSchema>;
