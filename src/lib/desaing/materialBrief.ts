/** Applying a reviewed sheet is explicit and literal; it never starts generation or silently truncates findings. */
export function appendReviewedMaterialsBrief(current: string, reviewedText: string, limit = 8000): string {
  if (!reviewedText.trim()) throw new Error('materials_review_required');
  const addition = `Materiales revisados:\n${reviewedText}`;
  const next = current.includes(addition) ? current : [current.trim(), addition].filter(Boolean).join('\n\n');
  if (next.length > limit) throw new Error('materials_brief_too_long');
  return next;
}
