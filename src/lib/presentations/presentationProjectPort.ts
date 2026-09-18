import { supabase } from '@/integrations/supabase/client';
import type { ReviewedPresentationPort } from './reviewedPresentationProject';
/** Same tenant-filtered presentations table as the existing editor. */
export const presentationProjectPort: ReviewedPresentationPort = {
  async read(businessId, projectId) {
    const { data, error } = await (supabase as any).from('presentations').select('id,business_id,name,slides')
      .eq('id', projectId).eq('business_id', businessId).maybeSingle();
    if (error) throw new Error('deck_save_unknown'); return data;
  },
  async insert(project) {
    const { data, error } = await (supabase as any).from('presentations').insert(project).select('id,business_id,name,slides').single();
    if (error) throw new Error('deck_save_unknown'); return data;
  },
};
