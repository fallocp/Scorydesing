import { useEffect, useState } from 'react';
import { StudioImagePanel } from '@/components/design-studio/StudioImagePanel';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { assertProductionSource, type ProductionReceipt, type ProductionSource } from '../../supabase/functions/_shared/desaing/production';
import type { StudioCarouselContext } from '@/lib/desaing/studioImageState';
import { TEST_BUSINESS_ID } from './fixture';

export type ProductionFixtureKey = 'image' | 'empty' | 'long' | 'copy' | 'generated';
export interface ProductionHarnessFixture {
  sources: Record<ProductionFixtureKey, ProductionSource>;
  contexts: { copy: StudioCarouselContext; generated: StudioCarouselContext };
}
const choices: readonly [ProductionFixtureKey, string][] = [
  ['image', 'Abrir imagen individual'], ['empty', 'Abrir imagen sin texto'], ['long', 'Abrir prompt largo'],
  ['copy', 'Abrir carrusel de copys'], ['generated', 'Abrir carrusel de ideas'],
];
const selectionKey = 'desaing-production-harness-selection';
function readSelection(): ProductionFixtureKey | null {
  const selected = localStorage.getItem(selectionKey);
  return choices.find(([key]) => key === selected)?.[0] ?? null;
}
/** Real consumer over local SQL and fake providers; source identities remain pinned across reloads. */
export function ProductionHarness() {
  const service = usePresentationDesignService();
  const [fixture, setFixture] = useState<ProductionHarnessFixture | null>(null);
  const [selected, setSelected] = useState<ProductionFixtureKey | null>(readSelection);
  const [receipt, setReceipt] = useState<ProductionReceipt | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await fetch('/__desaing-production-fixture', { cache: 'no-store' });
      if (!response.ok) throw Error('No se pudo leer la fuente simulada.');
      const value = await response.json() as ProductionHarnessFixture;
      for (const [key] of choices) assertProductionSource(value.sources[key]);
      if (!value.contexts.copy || !value.contexts.generated) throw Error('Faltan los contextos de carrusel.');
      if (live) setFixture(value);
    })().catch(problem => { if (live) setError(problem instanceof Error ? problem.message : 'No se pudo preparar la prueba.'); });
    return () => { live = false; };
  }, []);
  function choose(next: ProductionFixtureKey | null) {
    if (next) localStorage.setItem(selectionKey, next); else localStorage.removeItem(selectionKey);
    setSelected(next);
  }
  return <main style={{ maxWidth: 1000, margin: '40px auto', padding: 24, fontFamily: 'Arial, sans-serif' }}>
    <h1 style={{ fontSize: 28, fontWeight: 700 }}>Imágenes y carruseles · prueba local</h1>
    <p style={{ margin: '12px 0 24px' }}>Panel real, fuentes de prueba y respuestas simuladas. No se realizan llamadas a proveedores.</p>
    {error && <p role="alert">{error}</p>}
    {!fixture && !error && <p role="status">Preparando fuentes…</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{choices.map(([key, label]) =>
      <button key={key} type="button" disabled={!fixture || !!selected} onClick={() => choose(key)}
        style={{ border: '1px solid #bcc8d8', padding: '10px 14px', borderRadius: 8, background: '#fff' }}>{label}</button>)}</div>
    {receipt && <section style={{ marginTop: 24 }}><h2>Último recibo confirmado</h2>
      <pre data-testid="production-receipt" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{JSON.stringify(receipt, null, 2)}</pre></section>}
    {fixture && selected && service && <StudioImagePanel key={selected} service={service} businessId={TEST_BUSINESS_ID}
      source={fixture.sources[selected]} initialAction="compare"
      localCarousel={selected === 'copy' || selected === 'generated' ? fixture.contexts[selected] : undefined}
      onClose={() => choose(null)} onSaved={confirmed => { setReceipt(structuredClone(confirmed)); }} />}
  </main>;
}
