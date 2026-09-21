import { describe, expect, it } from 'vitest';
import { parsePresentationReferenceScope, presentationReferenceScopeSuffix, type PresentationReferenceScope } from '../presentationReferenceScope.ts';

const scope: PresentationReferenceScope = { references: [{ reference_id: `reference:${'a'.repeat(64)}`, role: 'content_source' }] };
describe('reference scope metadata alongside conversational context', () => {
  it('writes neutral metadata and preserves following brand or conversational text when parsing', () => {
    const suffix = presentationReferenceScopeSuffix(scope);
    expect(suffix).toContain('\nReferencias del diseño: '); expect(suffix).not.toContain('no inspecciona');
    expect(parsePresentationReferenceScope(`Encargo${suffix}\n\nMarca: Xending`)).toEqual({ instruction: 'Encargo\n\nMarca: Xending', scope });
  });
  it('reads the historical text-only marker without modifying its source IDs', () => {
    const suffix = `\nReferencias locales para generar (la planificación no inspecciona sus píxeles): ${JSON.stringify(scope)}`;
    expect(parsePresentationReferenceScope(`Encargo${suffix}`)).toEqual({ instruction: 'Encargo', scope });
    expect(parsePresentationReferenceScope(`Encargo${suffix}\nMás contexto`)).toEqual({ instruction: 'Encargo\nMás contexto', scope });
  });
  it('continues rejecting malformed reference metadata and leaves plain instructions intact', () => {
    expect(() => parsePresentationReferenceScope('Encargo\nReferencias del diseño: {"references":[{"reference_id":"unknown","role":"content_source"}]}')).toThrow();
    expect(parsePresentationReferenceScope('Encargo sin referencias')).toEqual({ instruction: 'Encargo sin referencias', scope: { references: [] } });
  });
});
