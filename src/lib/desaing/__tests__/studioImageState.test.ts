import { describe, expect, it } from 'vitest';
import { adoptStudioCarouselReceipt, assertStudioCarouselCurrent, assertStudioPending, assertStudioReceipt, isStudioApplyRefusal,
  studioSourceKey, type StudioCarouselContext, type StudioPendingApply } from '../studioImageState';
import type { ProductionReceipt, ProductionSnapshot, ProductionSource } from '../../../../supabase/functions/_shared/desaing/production';
import type { CarouselMeta, CarouselSlot } from '@/types/design-studio';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const business = uuid(1), actor = uuid(2), baseMockup = uuid(3);
const source: Extract<ProductionSource, { kind: 'carousel' }> = { kind: 'carousel', source_table: 'copy_bank_items', row_id: uuid(4), group_id: uuid(5), slide_id: 'slide-1' };
const slot: CarouselSlot = { id: 'slide-1', index: 0, role: 'hook', slideCopy: { headline: 'Un costo claro', body: 'USD 100', cta: 'Consulta' },
  imageIntent: 'Una cotización', prompt: 'Conserva USD 100 y la etiqueta TOTAL.', brandElements: [], status: 'done', mockupId: baseMockup, imageUrl: 'https://example.test/base.png' };
const carousel: CarouselMeta = { presetSlug: 'arco', visualAnchor: 'Fondo blanco', visualMotif: 'Cotización', groupId: source.group_id,
  imageType: 'infografia', slots: [slot, { ...slot, id: 'slide-2', index: 1, mockupId: uuid(6) }], createdAt: '2026-09-18T00:00:00Z' };
const local: StudioCarouselContext = { meta: { imageMode: 'carousel', customRule: 'Conservar', carousel }, carousel,
  editorial: { headline: 'Semilla aprobada', subcopy: null, cta: 'Consulta', status: 'approved' } };
const { slots: _slots, ...globalCarousel } = carousel;
const snapshot: ProductionSnapshot = { schema_version: 1, id: uuid(7), business_id: business, actor_id: actor, source,
  source_hash: 'a'.repeat(64), base_mockup_id: baseMockup, base_asset: { business_id: business, asset_id: 'base', version_id: 'b'.repeat(64) },
  canvas: { width: 1024, height: 1024 }, output_canvas: { width: 1024, height: 1024 }, prompt: slot.prompt,
  copy: { text: 'Un costo claro\nUSD 100\nConsulta', version_id: 'c'.repeat(64), origin: 'source' },
  protected_context: JSON.stringify({ meta: { customRule: 'Conservar', imageMode: 'carousel' }, carousel: globalCarousel, slot, editorial: local.editorial }),
  created_at: '2026-09-18T00:00:00Z' };
const pending: StudioPendingApply = { schema_version: 1, actor_id: actor, snapshot, input: { business_id: business, apply_id: uuid(8),
  snapshot_id: snapshot.id, source_hash: snapshot.source_hash, base_asset: snapshot.base_asset,
  result_asset: { business_id: business, asset_id: 'result', version_id: 'd'.repeat(64) } } };
const receipt: ProductionReceipt = { apply_id: pending.input.apply_id, snapshot_id: snapshot.id, business_id: business, actor_id: actor,
  source, source_hash: snapshot.source_hash, base_asset: snapshot.base_asset, result_asset: pending.input.result_asset, mockup_id: uuid(9),
  image_url: 'https://example.test/result.png', applied_at: '2026-09-18T01:00:00Z',
  slot: { id: slot.id, index: 0, mockupId: uuid(9), imageUrl: 'https://example.test/result.png', status: 'done' } };

describe('production image consumer guards', () => {
  it('binds recovery to actor, business, source and exact base version', () => {
    expect(() => assertStudioPending(pending, business, actor, source)).not.toThrow();
    expect(() => assertStudioPending(pending, business, uuid(10), source)).toThrow();
    expect(() => assertStudioPending(pending, uuid(10), actor, source)).toThrow();
    expect(() => assertStudioPending(pending, business, actor, { ...source, slide_id: 'slide-2' })).toThrow();
    expect(() => assertStudioPending({ ...pending, input: { ...pending.input, base_asset: pending.input.result_asset } }, business, actor, source)).toThrow();
    expect(studioSourceKey(business, actor, source)).not.toBe(studioSourceKey(business, uuid(10), source));
  });
  it('rejects a recovery receipt for another approved output or request', () => {
    expect(() => assertStudioReceipt(receipt, pending)).not.toThrow();
    expect(() => assertStudioReceipt({ ...receipt, apply_id: uuid(20) }, pending)).toThrow();
    expect(() => assertStudioReceipt({ ...receipt, result_asset: snapshot.base_asset }, pending)).toThrow();
  });
  it('compares JSON fields independent of key order and disregards only transient pixels', () => {
    const pixels = structuredClone(local);
    Object.assign(pixels.carousel.slots[0], { imageBase64: 'in-memory-only', error: undefined });
    expect(() => assertStudioCarouselCurrent(snapshot, pixels)).not.toThrow();
    expect(() => assertStudioCarouselCurrent(snapshot)).toThrow('studio_local_changes');
  });
  it('blocks unsaved prompt, copy, global plan and editorial changes without saving them', () => {
    const changed = [structuredClone(local), structuredClone(local), structuredClone(local), structuredClone(local)];
    changed[0].carousel.slots[0].prompt = 'Otro prompt';
    changed[1].carousel.slots[0].slideCopy.body = 'USD 200';
    changed[2].carousel.visualAnchor = 'Otra dirección';
    changed[3].editorial.headline = 'Otra semilla';
    for (const value of changed) expect(() => assertStudioCarouselCurrent(snapshot, value)).toThrow('studio_local_changes');
    expect(local.carousel.slots[0].slideCopy.body).toBe('USD 100');
  });
  it('adopts only the selected pointer, retaining copy/figures and other slide objects; refuses a later base', () => {
    const slots = carousel.slots.map(item => ({ ...item, imageBase64: 'cached-original' }));
    const applied = adoptStudioCarouselReceipt(slots, source, receipt, baseMockup);
    expect(applied[1]).toBe(slots[1]);
    expect(applied[0].slideCopy).toBe(slots[0].slideCopy);
    expect(applied[0].prompt).toBe(slots[0].prompt);
    expect(applied[0].mockupId).toBe(receipt.mockup_id);
    expect(applied[0].imageBase64).toBeUndefined();
    expect(slots[0].mockupId).toBe(baseMockup);
    expect(() => adoptStudioCarouselReceipt(applied, source, receipt, baseMockup)).not.toThrow();
    expect(() => adoptStudioCarouselReceipt([{ ...slots[0], mockupId: uuid(30) }, slots[1]], source, receipt, baseMockup)).toThrow('studio_source_changed');
    expect(() => adoptStudioCarouselReceipt(slots, { ...source, slide_id: 'slide-2' }, receipt, baseMockup)).toThrow();
  });
  it('unfreezes definitive refusals and keeps ambiguous outcomes frozen', () => {
    for (const code of ['production_source_changed', 'production_not_approved', 'production_base_changed', 'production_result_mismatch', 'production_request_conflict'])
      expect(isStudioApplyRefusal({ code, httpStatus: 409 })).toBe(true);
    expect(isStudioApplyRefusal({ code: 'server_production_outcome_unknown', httpStatus: 503 })).toBe(false);
    expect(isStudioApplyRefusal({ code: 'server_response_unknown', httpStatus: null })).toBe(false);
    expect(isStudioApplyRefusal({ code: 'unknown', httpStatus: 409 })).toBe(false);
  });
});
