import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateCampaignInput } from '../useCampaigns';
import type { SaveTemplateRequest } from '@/types/design-studio';

const db = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: db.getUser }, from: db.from },
}));

// Exercise the real mutation functions without a browser or React provider.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [] }),
  useQueryClient: () => ({}),
  useMutation: ({ mutationFn }: { mutationFn: (input: unknown) => Promise<unknown> }) => ({
    mutateAsync: mutationFn,
  }),
}));

import { useCampaigns } from '../useCampaigns';
import { useSaveCustomTemplate } from '../useSaveCustomTemplate';

const campaign: CreateCampaignInput = {
  brand: 'xending', name: 'Campaña', brief: 'Descripción', contentType: 'tip-educational',
};
const template: SaveTemplateRequest = {
  name: ' Portada ', business_id: 'business-1', platform: 'banner',
  template_html: '<main>{{headline}}</main>',
  slots: [{ name: 'headline', type: 'text', required: true }],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getUser.mockResolvedValue({ data: { user: { id: 'authenticated-user' } }, error: null });
  db.from.mockReturnValue(db);
  db.insert.mockReturnValue(db);
  db.select.mockReturnValue(db);
  db.single.mockResolvedValue({ data: { id: 'saved-1', name: 'Portada' }, error: null });
});

describe('authenticated inserts', () => {
  it('includes the authenticated owner when saving a campaign', async () => {
    await useCampaigns().createCampaign.mutateAsync(campaign);
    expect(db.from).toHaveBeenCalledWith('design_campaigns');
    expect(db.insert).toHaveBeenCalledWith({
      user_id: 'authenticated-user', brand: 'xending', name: 'Campaña',
      brief: 'Descripción', content_type: 'tip-educational', partner: 'none',
    });
  });

  it('includes the authenticated creator and complete slots when saving a template', async () => {
    await useSaveCustomTemplate().mutateAsync(template);
    expect(db.from).toHaveBeenCalledWith('custom_templates');
    expect(db.insert).toHaveBeenCalledWith({
      name: 'Portada', business_id: 'business-1', created_by: 'authenticated-user',
      platform: 'banner', html_template: template.template_html, slots: template.slots,
      thumbnail_url: null, source_mockup_url: null,
    });
  });

  it('does not insert either resource without a session', async () => {
    db.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(useCampaigns().createCampaign.mutateAsync(campaign)).rejects.toThrow('No autenticado');
    await expect(useSaveCustomTemplate().mutateAsync(template)).rejects.toThrow('iniciar sesión');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does not insert if authentication validation fails', async () => {
    db.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Sesión expirada' } });
    await expect(useCampaigns().createCampaign.mutateAsync(campaign)).rejects.toThrow('Sesión expirada');
    await expect(useSaveCustomTemplate().mutateAsync(template)).rejects.toThrow('Sesión expirada');
    expect(db.insert).not.toHaveBeenCalled();
  });
});
