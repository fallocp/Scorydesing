import { assertPresentationSlides, type PresentationSlide } from './presentationDocument';
import { sanitizePresentationHtml } from './presentationHtml';
import { reconcileMountedAssets } from './presentationManifest';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
export interface ReviewedPresentationProject { id: string; business_id: string; name: string; slides: PresentationSlide[] }
export interface ReviewedPresentationPort {
  read(businessId: string, projectId: string): Promise<unknown | null>;
  insert(project: ReviewedPresentationProject): Promise<unknown>;
}
const same = (a: unknown, b: unknown): boolean => canonicalExploration(a) === canonicalExploration(b);
export function prepareReviewedPresentation(slides: PresentationSlide[], businessId: string): PresentationSlide[] {
  assertPresentationSlides(slides);
  if (slides.length < 2 || slides.length > 20 || slides.some(slide => slide.mounted_assets?.some(item => item.asset.business_id !== businessId))) throw new Error('invalid_deck');
  return slides.map(slide => { const html = sanitizePresentationHtml(slide.html);
    return { ...structuredClone(slide), html, mounted_assets: reconcileMountedAssets(slide, html) }; });
}
/** A stable draft ID and frozen payload make recovery safe even if insert acknowledgement was lost. */
export async function saveReviewedPresentation(port: ReviewedPresentationPort, input: ReviewedPresentationProject, assertCurrent: () => Promise<void>): Promise<ReviewedPresentationProject> {
  const project = structuredClone(input);
  if (!/^[0-9a-f-]{36}$/i.test(project.id) || !project.business_id || !project.name.trim() || project.name.length > 160) throw new Error('invalid_deck');
  assertPresentationSlides(project.slides);
  if (project.slides.length < 2 || project.slides.length > 20 || project.slides.some(slide => slide.mounted_assets?.some(asset => asset.asset.business_id !== project.business_id))) throw new Error('invalid_deck');
  const matching = (value: unknown): value is ReviewedPresentationProject => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const saved = value as ReviewedPresentationProject;
    return saved.id === project.id && saved.business_id === project.business_id && saved.name === project.name && same(saved.slides, project.slides);
  };
  await assertCurrent(); let saved = await port.read(project.business_id, project.id); await assertCurrent();
  if (saved && !matching(saved)) throw new Error('deck_saved_payload_changed');
  if (!saved) {
    try { saved = await port.insert(structuredClone(project)); } catch { /* A fixed-ID read resolves a lost acknowledgement. */ }
    await assertCurrent();
    if (!saved) saved = await port.read(project.business_id, project.id);
    await assertCurrent();
    if (!saved) throw new Error('deck_save_unknown');
    if (!matching(saved)) throw new Error('deck_saved_payload_changed');
  }
  return structuredClone(project);
}
