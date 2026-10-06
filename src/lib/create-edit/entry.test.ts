import { describe, expect, it } from 'vitest';
import { emptyEntry, entryKey, entryRoute, readEntry, studioTab, type CreateEntry } from './entry';

describe('Crear y editar: scoped navigation, without generation or approval', () => {
  it('restores only the matching account and business, including separator characters', () => {
    const storage = new Map<string, string>();
    const key = entryKey('actor:a', 'brand:b');
    const draft: CreateEntry = { origin: 'new', piece: 'carousel', brief: 'Una historia de pagos\nConservar Navy' };
    storage.set(key, JSON.stringify(draft));
    const port = { getItem: (name: string) => storage.get(name) ?? null };
    expect(readEntry(port, key)).toEqual(draft);
    expect(readEntry(port, entryKey('actor:a', 'other'))).toEqual(emptyEntry);
    expect(readEntry(port, entryKey('another', 'brand:b'))).toEqual(emptyEntry);
    expect(entryKey('a:b', 'c')).not.toBe(entryKey('a', 'b:c'));
  });
  it('recovers malformed or unavailable storage without promoting arbitrary fields to a valid entry', () => {
    for (const raw of ['{', 'null', '[]', '{}', JSON.stringify({ ...emptyEntry, origin: '/admin' }), JSON.stringify({ ...emptyEntry, brief: 'x'.repeat(8001) })]) {
      expect(readEntry({ getItem: () => raw }, 'key')).toEqual(emptyEntry);
    }
    expect(readEntry({ getItem: () => { throw new Error('storage unavailable'); } }, 'key')).toEqual(emptyEntry);
  });
  it('opens the existing editors and image library; a carousel does not require creating an image first', () => {
    expect(entryRoute({ ...emptyEntry, piece: 'carousel' })).toBe('/design-studio?tab=studio');
    expect(entryRoute({ ...emptyEntry, origin: 'edit', piece: 'image' })).toBe('/assets');
    for (const origin of ['new', 'edit'] as const) {
      expect(entryRoute({ ...emptyEntry, origin, piece: 'presentation' })).toBe('/presentations');
      expect(entryRoute({ ...emptyEntry, origin, piece: 'free' })).toBe(origin === 'new' ? '/create/design' : '/free-design');
    }
  });
  it('routes editorial shortcuts to the precise current tab and rejects unknown tabs', () => {
    expect(studioTab('news')).toBe('news'); expect(studioTab('fx-daily')).toBe('fx-daily');
    for (const unknown of [null, '', 'campaign', 'javascript:alert(1)']) expect(studioTab(unknown)).toBe('studio');
  });
});
