export type EntryOrigin = 'new' | 'template' | 'edit';
export type PieceKind = 'image' | 'carousel' | 'presentation' | 'free';
export interface CreateEntry {
  origin: EntryOrigin;
  piece: PieceKind;
  brief: string;
}
export const emptyEntry: CreateEntry = { origin: 'new', piece: 'image', brief: '' };
export const originLabels: Record<EntryOrigin, string> = { new: 'Crear nuevo', template: 'Usar plantilla', edit: 'Editar' };

// A tab-local brief, not a saved project or an approved copy. Account and business
// are part of the key so switching either never carries another scope's content.
export function entryKey(actor: string, business: string) {
  return `scory:create-entry:v1:${encodeURIComponent(actor)}:${encodeURIComponent(business)}`;
}
export function readEntry(storage: Pick<Storage, 'getItem'>, key: string): CreateEntry {
  try {
    const item: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (!item || typeof item !== 'object') return { ...emptyEntry };
    const value = item as Record<string, unknown>;
    if (!['new', 'template', 'edit'].includes(String(value.origin)) ||
      !['image', 'carousel', 'presentation', 'free'].includes(String(value.piece)) ||
      typeof value.brief !== 'string' || value.brief.length > 8000) return { ...emptyEntry };
    return value as unknown as CreateEntry;
  } catch { return { ...emptyEntry }; }
}
export function entryRoute(entry: CreateEntry): string {
  if (entry.piece === 'presentation') return '/presentations';
  if (entry.piece === 'free') return entry.origin === 'new' ? '/create/design' : '/free-design';
  if (entry.origin === 'edit' && entry.piece === 'image') return '/assets';
  return '/design-studio?tab=studio';
}
export function studioTab(value: string | null): 'studio' | 'news' | 'fx-daily' {
  return value === 'news' || value === 'fx-daily' ? value : 'studio';
}
