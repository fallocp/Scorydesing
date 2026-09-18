import { assertProductionApplyInput, assertProductionReceipt, assertProductionSnapshot,
  PRODUCTION_ERRORS, type ProductionApplyInput, type ProductionReceipt, type ProductionSnapshot, type ProductionSource } from '../../../supabase/functions/_shared/desaing/production';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import type { CarouselMeta, CarouselSlot } from '@/types/design-studio';

export type StudioImageAction = 'edit_image' | 'regenerate_image' | 'compare';
export type StudioCarouselContext = { meta: unknown; carousel: CarouselMeta; editorial: { headline: string; subcopy: string | null; cta: string | null; status: string } };
export interface StudioPendingApply { schema_version: 1; actor_id: string; snapshot: ProductionSnapshot; input: ProductionApplyInput }
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
/** Compare serialized fields only; in-memory pixels are never part of the source contract. */
const persisted = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function studioSourceKey(businessId: string, actorId: string, source: ProductionSource): string {
  return `scory-studio-image:${businessId}:${actorId}:${canonicalExploration(source)}`;
}
export function assertStudioPending(value: unknown, businessId: string, actorId: string, source: ProductionSource): asserts value is StudioPendingApply {
  const found = value as StudioPendingApply;
  if (!found || found.schema_version !== 1 || found.actor_id !== actorId) throw Error('studio_pending_invalid');
  assertProductionSnapshot(found.snapshot); assertProductionApplyInput(found.input);
  if (found.snapshot.business_id !== businessId || found.snapshot.actor_id !== actorId || found.input.business_id !== businessId
    || !same(found.snapshot.source, source) || found.input.snapshot_id !== found.snapshot.id || found.input.source_hash !== found.snapshot.source_hash
    || !same(found.input.base_asset, found.snapshot.base_asset)) throw Error('studio_pending_invalid');
}
export function assertStudioReceipt(receipt: ProductionReceipt, pending: StudioPendingApply): void {
  assertProductionReceipt(receipt);
  if (receipt.apply_id !== pending.input.apply_id || receipt.snapshot_id !== pending.snapshot.id || receipt.business_id !== pending.input.business_id
    || receipt.actor_id !== pending.actor_id || receipt.source_hash !== pending.input.source_hash || !same(receipt.source, pending.snapshot.source)
    || !same(receipt.base_asset, pending.input.base_asset) || !same(receipt.result_asset, pending.input.result_asset)) throw Error('studio_pending_invalid');
}
export function isStudioApplyRefusal(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || !('httpStatus' in error)) return false;
  return typeof error.httpStatus === 'number' && error.httpStatus >= 400 && error.httpStatus < 500
    && [...PRODUCTION_ERRORS, 'server_authentication_required', 'server_invalid_request'].includes(String(error.code));
}
/** No silent saves here: local prompt/copy/figure changes must pass their existing gate first. */
export function assertStudioCarouselCurrent(snapshot: ProductionSnapshot, local?: StudioCarouselContext): void {
  if (snapshot.source.kind !== 'carousel') return;
  const source = snapshot.source;
  if (!local || local.carousel.groupId !== snapshot.source.group_id) throw Error('studio_local_changes');
  const expected = JSON.parse(snapshot.protected_context) as { meta?: unknown; carousel?: unknown; slot?: unknown; editorial?: unknown };
  const { slots, ...carousel } = local.carousel;
  const selected = slots.find(slot => slot.id === source.slide_id);
  if (!selected) throw Error('studio_local_changes');
  const { imageBase64: _pixels, ...slot } = selected as CarouselSlot & { imageBase64?: string };
  const meta = local.meta && typeof local.meta === 'object' ? { ...local.meta as Record<string, unknown> } : local.meta;
  if (meta && typeof meta === 'object') delete (meta as Record<string, unknown>).carousel;
  if (!same(persisted(meta), expected.meta) || !same(persisted(carousel), expected.carousel) || !same(persisted(slot), expected.slot)
    || !same(local.editorial, expected.editorial)) throw Error('studio_local_changes');
}
/** The server has already applied this pointer atomically. Never persist the whole carousel again. */
export function adoptStudioCarouselReceipt<T extends CarouselSlot & { imageBase64?: string }>(
  slots: T[], source: Extract<ProductionSource, { kind: 'carousel' }>, receipt: ProductionReceipt, expectedMockupId: string,
): T[] {
  assertProductionReceipt(receipt);
  if (!same(receipt.source, source) || !receipt.slot) throw Error('studio_source_changed');
  const found = slots.find(slot => slot.id === source.slide_id);
  if (!found || found.index !== receipt.slot.index || found.mockupId !== expectedMockupId && found.mockupId !== receipt.mockup_id) throw Error('studio_source_changed');
  return slots.map(slot => slot.id !== source.slide_id ? slot : { ...slot, ...receipt.slot!, imageBase64: undefined, error: undefined });
}
