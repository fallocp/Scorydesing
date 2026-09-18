import { describe, expect, it } from 'vitest';
import { toJson } from '../json';

describe('toJson', () => {
  it('preserves nested payloads and leaves the source unchanged', () => {
    const source = { title: 'Diseño ✈', nested: [{ active: true, count: 2 }], absent: null };
    const copy = toJson(source);
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
  });

  it('uses the same undefined, date and non-finite semantics as a JSON request', () => {
    expect(toJson({ omitted: undefined, list: [undefined, Number.NaN], when: new Date('2026-01-01T00:00:00.000Z') }))
      .toEqual({ list: [null, null], when: '2026-01-01T00:00:00.000Z' });
  });

  it('rejects unsupported top-level and circular values before persistence', () => {
    expect(() => toJson(undefined)).toThrow(TypeError);
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(() => toJson(cycle)).toThrow(TypeError);
  });
});
