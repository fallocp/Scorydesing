import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));

import {
  buildTimeline,
  type AssetSnapshot,
  type LearningDelta,
} from '../useMemoryTimeline';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeSnapshot = (overrides: Partial<AssetSnapshot> = {}): AssetSnapshot => ({
  id: 'snap-1',
  business_id: 'biz-1',
  asset_type: 'image',
  asset_id: 'asset-1',
  version: 1,
  content: 'base64...',
  metadata: {},
  feedback: null,
  parent_snapshot_id: null,
  created_at: '2025-01-15T10:00:00Z',
  ...overrides,
});

const makeDelta = (overrides: Partial<LearningDelta> = {}): LearningDelta => ({
  id: 'delta-1',
  business_id: 'biz-1',
  profile_version: 1,
  increase: ['fondos claros'],
  decrease: ['glow effects'],
  trigger_type: 'explicit_feedback',
  trigger_context: null,
  created_at: '2025-01-15T11:00:00Z',
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns empty array when no snapshots or deltas', () => {
    const result = buildTimeline([], []);
    expect(result).toEqual([]);
  });

  it('returns only snapshots when no deltas provided', () => {
    const snapshots = [
      makeSnapshot({ id: 'snap-2', version: 2, created_at: '2025-01-15T12:00:00Z' }),
      makeSnapshot({ id: 'snap-1', version: 1, created_at: '2025-01-15T10:00:00Z' }),
    ];

    const result = buildTimeline(snapshots, []);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('snapshot');
    expect((result[0].data as AssetSnapshot).version).toBe(2);
    expect(result[1].type).toBe('snapshot');
    expect((result[1].data as AssetSnapshot).version).toBe(1);
  });

  it('returns only deltas when no snapshots provided', () => {
    const deltas = [
      makeDelta({ id: 'delta-1', created_at: '2025-01-15T11:00:00Z' }),
    ];

    const result = buildTimeline([], deltas);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('learning_delta');
  });

  it('interleaves snapshots and deltas sorted by created_at descending', () => {
    const snapshots = [
      makeSnapshot({ id: 'snap-1', version: 1, created_at: '2025-01-15T10:00:00Z' }),
      makeSnapshot({ id: 'snap-2', version: 2, created_at: '2025-01-15T14:00:00Z' }),
    ];
    const deltas = [
      makeDelta({ id: 'delta-1', created_at: '2025-01-15T12:00:00Z' }),
    ];

    const result = buildTimeline(snapshots, deltas);

    expect(result).toHaveLength(3);
    // Newest first: snap-2 (14:00), delta-1 (12:00), snap-1 (10:00)
    expect(result[0].type).toBe('snapshot');
    expect((result[0].data as AssetSnapshot).id).toBe('snap-2');
    expect(result[1].type).toBe('learning_delta');
    expect((result[1].data as LearningDelta).id).toBe('delta-1');
    expect(result[2].type).toBe('snapshot');
    expect((result[2].data as AssetSnapshot).id).toBe('snap-1');
  });

  it('preserves all data in timeline events', () => {
    const snapshot = makeSnapshot({
      feedback: 'Improved contrast',
      metadata: { template_type: 'breaking-news', platform: 'instagram-story' },
    });
    const delta = makeDelta({
      increase: ['tipografía bold', 'fondos oscuros'],
      decrease: ['colores pastel'],
      trigger_type: 'approval',
    });

    const result = buildTimeline([snapshot], [delta]);

    expect(result).toHaveLength(2);

    // Delta is newer (11:00 vs 10:00)
    const deltaEvent = result[0];
    expect(deltaEvent.type).toBe('learning_delta');
    expect((deltaEvent.data as LearningDelta).increase).toEqual(['tipografía bold', 'fondos oscuros']);
    expect((deltaEvent.data as LearningDelta).decrease).toEqual(['colores pastel']);
    expect((deltaEvent.data as LearningDelta).trigger_type).toBe('approval');

    const snapshotEvent = result[1];
    expect(snapshotEvent.type).toBe('snapshot');
    expect((snapshotEvent.data as AssetSnapshot).feedback).toBe('Improved contrast');
    expect((snapshotEvent.data as AssetSnapshot).metadata).toEqual({
      template_type: 'breaking-news',
      platform: 'instagram-story',
    });
  });
});
