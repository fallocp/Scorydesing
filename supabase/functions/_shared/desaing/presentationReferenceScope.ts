import type { ReferenceRole } from './contracts.ts';

/** Local bytes are hashed, never represented as fictitious remote asset IDs. */
export const PRESENTATION_REFERENCE_ROLES = ['object_reference', 'image_style_reference', 'layout_reference', 'content_source', 'brand_reference'] as const satisfies readonly ReferenceRole[];
export interface PresentationReferenceScope {
  references: { reference_id: string; role: typeof PRESENTATION_REFERENCE_ROLES[number] }[];
  recreate_reference_id?: string;
}
export function assertPresentationReferenceScope(value: unknown): asserts value is PresentationReferenceScope {
  const record = value as PresentationReferenceScope;
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).some(key => !['references', 'recreate_reference_id'].includes(key))
    || !Array.isArray(record.references) || record.references.length > 3
    || record.references.some(ref => !ref || typeof ref !== 'object' || Object.keys(ref).length !== 2
      || !/^reference:[a-f0-9]{64}$/.test(ref.reference_id)
      || !PRESENTATION_REFERENCE_ROLES.includes(ref.role))
    || new Set(record.references.map(ref => ref.reference_id)).size !== record.references.length
    || (record.recreate_reference_id !== undefined && !record.references.some(ref =>
      ref.reference_id === record.recreate_reference_id && ref.role === 'object_reference'))) throw new Error('invalid_presentation_reference_scope');
}
export function presentationReferenceScopeSuffix(value?: PresentationReferenceScope): string {
  if (!value) return '';
  assertPresentationReferenceScope(value);
  return value.references.length ? `\nReferencias del diseño: ${JSON.stringify(value)}` : '';
}
export function parsePresentationReferenceScope(instruction: string): { instruction: string; scope: PresentationReferenceScope } {
  const markers = ['\nReferencias del diseño: ', '\nReferencias locales para generar (la planificación no inspecciona sus píxeles): '];
  const found = markers.map(marker => ({ marker, at: instruction.lastIndexOf(marker) })).sort((a, b) => b.at - a.at)[0];
  if (found.at === -1) return { instruction, scope: { references: [] } };
  const start = found.at + found.marker.length, lineEnd = instruction.indexOf('\n', start);
  const scope: unknown = JSON.parse(instruction.slice(start, lineEnd === -1 ? undefined : lineEnd));
  assertPresentationReferenceScope(scope);
  return { instruction: instruction.slice(0, found.at) + (lineEnd === -1 ? '' : instruction.slice(lineEnd)), scope };
}
