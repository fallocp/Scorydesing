import { describe, expect, it } from 'vitest';
import { changeInteractionMode, suggestExploration } from '../session.ts';
import { airplaneOperation } from './fixtures.ts';

describe('explicit interaction mode changes', () => {
  it('retains target, version, references, placement, copy and decisions', () => {
    const original = airplaneOperation().context;
    const before = structuredClone(original);

    const changed = changeInteractionMode(original, 'explore_design');

    expect(changed).toEqual({ ...before, interaction_mode: 'explore_design' });
    expect(original).toEqual(before);
    expect(changed.target).not.toBe(original.target);
    expect(changed.references).not.toBe(original.references);
    expect(changed.placement).not.toBe(original.placement);
  });

  it('does not share mutable context across old and new mode snapshots', () => {
    const original = airplaneOperation().context;
    const changed = changeInteractionMode(original, 'explore_design');
    original.references[0].version_id = 'new-reference-version';
    original.target.slide_id = 'another-slide';
    original.placement!.region.x = 0;

    expect(changed.references[0].version_id).toBe('version-capture-1');
    expect(changed.target.slide_id).toBe('slide-2');
    expect(changed.placement!.region.x).toBe(960);
  });

  it('a concrete instruction in exploration does not automatically return to execute', () => {
    const original = airplaneOperation().context;
    original.interaction_mode = 'explore_design';
    original.instruction = 'Mueve el avión diez píxeles a la derecha.';

    const current = changeInteractionMode(original, 'explore_design');

    expect(current.interaction_mode).toBe('explore_design');
    expect(current.instruction).toBe(original.instruction);
  });

  it('allows explicit return to execute while preserving context', () => {
    const original = airplaneOperation().context;
    original.interaction_mode = 'explore_design';

    expect(changeInteractionMode(original, 'execute_change')).toEqual({
      ...original, interaction_mode: 'execute_change',
    });
  });
});

describe('exploration suggestions use intent without switching the session', () => {
  it('suggests exploration for an explicit request for ideas', () => {
    expect(suggestExploration({ requests_ideas: true, open_creative_decisions: [] }))
      .toMatchObject({ suggested_mode: 'explore_design' });
  });

  it('suggests exploration for an open composition decision', () => {
    expect(suggestExploration({
      requests_ideas: false, open_creative_decisions: ['Elegir composición para la portada'],
    })).toMatchObject({ suggested_mode: 'explore_design' });
  });

  it('does not treat empty decision labels as open creative choices', () => {
    expect(suggestExploration({ requests_ideas: false, open_creative_decisions: ['', '   '] }))
      .toBeNull();
  });

  it('long precise instructions do not imply exploration and short open instructions can', () => {
    const longPreciseInstruction = 'Mantén texto, posición y dimensiones aprobadas. '.repeat(200);
    const shortOpenInstruction = 'Dame ideas';
    expect(longPreciseInstruction.length).toBeGreaterThan(shortOpenInstruction.length);
    // The caller classifies intent; raw length and feedback counts are not inputs.
    expect(suggestExploration({ requests_ideas: false, open_creative_decisions: [] })).toBeNull();
    expect(suggestExploration({ requests_ideas: true, open_creative_decisions: [] }))
      .toMatchObject({ suggested_mode: 'explore_design' });
  });
});
