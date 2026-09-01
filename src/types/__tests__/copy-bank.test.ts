/**
 * Tests for the pure filter/tally helpers behind CopyBankV2Panel.
 *
 * These run the logic the panel depends on for correct counts: the chip counts
 * are computed per-dimension excluding that dimension's own filter, so a wrong
 * `applyCopyBankFilters` would silently show misleading numbers rather than
 * crash.
 */

import { describe, it, expect } from 'vitest';

import {
  angleLabelOf,
  applyCopyBankFilters,
  branchLabel,
  copyBankProgress,
  corridorLabel,
  DEFAULT_COPY_BANK_FILTERS,
  matchesCopyBankTab,
  resolveBranchForKitSlug,
  tallyBy,
  type CopyBankRow,
} from '../copy-bank';

function row(over: Partial<CopyBankRow>): CopyBankRow {
  return {
    id: crypto.randomUUID(),
    business_id: 'b',
    branch_slug: 'velocidad',
    corridor: 'china_asia',
    industry: null,
    business_side: null,
    headline: 'Headline',
    subcopy: 'Subline',
    cta: 'Paga a China hoy',
    cta_alt: [],
    angle_tag: 'menos_espera',
    angle_label: null,
    formula: null,
    tone_bucket: null,
    needs_legal_note: false,
    legal_note: null,
    status: 'seed',
    review_note: null,
    prompt_revision: 'copy-v2.0',
    kit_version: 'velocidad-v2.0',
    model: null,
    source: 'seed',
    week_batch: null,
    lint: null,
    used_at: null,
    used_note: null,
    used_by: null,
    image_meta: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('applyCopyBankFilters', () => {
  const rows = [
    row({ headline: 'A', branch_slug: 'velocidad', corridor: 'china_asia', angle_tag: 'menos_espera' }),
    row({ headline: 'B', branch_slug: 'velocidad', corridor: 'industria', angle_tag: 'inventario', industry: 'autopartes' }),
    row({ headline: 'C', branch_slug: 'costos-ahorro', corridor: 'china_asia', angle_tag: 'impacto_acumulado' }),
    row({ headline: 'D', branch_slug: 'costos-ahorro', corridor: 'internacional_general', angle_tag: 'segunda_cotizacion', used_at: new Date().toISOString() }),
  ];

  it('sin filtros muestra solo los disponibles', () => {
    // El default es 'available', que es lo que quieres ver al abrir el panel.
    const out = applyCopyBankFilters(rows, DEFAULT_COPY_BANK_FILTERS);
    expect(out.map((r) => r.headline)).toEqual(['A', 'B', 'C']);
  });

  it('usage=all incluye los usados', () => {
    const out = applyCopyBankFilters(rows, { ...DEFAULT_COPY_BANK_FILTERS, usage: 'all' });
    expect(out).toHaveLength(4);
  });

  it('usage=used muestra solo los usados', () => {
    const out = applyCopyBankFilters(rows, { ...DEFAULT_COPY_BANK_FILTERS, usage: 'used' });
    expect(out.map((r) => r.headline)).toEqual(['D']);
  });

  it('filtra por rama', () => {
    const out = applyCopyBankFilters(rows, { ...DEFAULT_COPY_BANK_FILTERS, branch: 'velocidad' });
    expect(out.map((r) => r.headline)).toEqual(['A', 'B']);
  });

  it('combina rama y corredor', () => {
    const out = applyCopyBankFilters(rows, {
      ...DEFAULT_COPY_BANK_FILTERS,
      branch: 'costos-ahorro',
      corridor: 'china_asia',
    });
    expect(out.map((r) => r.headline)).toEqual(['C']);
  });

  it('filtra por industria', () => {
    const out = applyCopyBankFilters(rows, { ...DEFAULT_COPY_BANK_FILTERS, industry: 'autopartes' });
    expect(out.map((r) => r.headline)).toEqual(['B']);
  });

  it('busca en headline, subline y CTA sin distinguir mayúsculas', () => {
    const withText = [
      row({ headline: 'El costo total', subcopy: 'nada', cta: 'Cotiza' }),
      row({ headline: 'Otro', subcopy: 'habla del COSTO real', cta: 'Cotiza' }),
      row({ headline: 'Tercero', subcopy: 'nada', cta: 'Compara tu costo' }),
      row({ headline: 'Cuarto', subcopy: 'nada', cta: 'Paga hoy' }),
    ];
    const out = applyCopyBankFilters(withText, { ...DEFAULT_COPY_BANK_FILTERS, search: 'costo' });
    expect(out.map((r) => r.headline)).toEqual(['El costo total', 'Otro', 'Tercero']);
  });

  it('devuelve vacío cuando nada coincide', () => {
    const out = applyCopyBankFilters(rows, {
      ...DEFAULT_COPY_BANK_FILTERS,
      branch: 'velocidad',
      corridor: 'internacional_general',
    });
    expect(out).toEqual([]);
  });
});

describe('tallyBy', () => {
  it('cuenta y ordena por frecuencia', () => {
    const rows = [
      row({ corridor: 'china_asia' }),
      row({ corridor: 'china_asia' }),
      row({ corridor: 'industria' }),
    ];
    expect(tallyBy(rows, (r) => r.corridor)).toEqual([
      { value: 'china_asia', count: 2 },
      { value: 'industria', count: 1 },
    ]);
  });

  it('ignora nulos', () => {
    const rows = [row({ industry: null }), row({ industry: 'autopartes' })];
    expect(tallyBy(rows, (r) => r.industry)).toEqual([{ value: 'autopartes', count: 1 }]);
  });

  it('desempata alfabéticamente', () => {
    const rows = [row({ corridor: 'zeta' }), row({ corridor: 'alfa' })];
    expect(tallyBy(rows, (r) => r.corridor).map((t) => t.value)).toEqual(['alfa', 'zeta']);
  });
});

describe('etiquetas', () => {
  it('traduce los slugs conocidos', () => {
    expect(corridorLabel('china_asia')).toBe('China y Asia');
    expect(branchLabel('costos-ahorro')).toBe('Costos y ahorro');
  });

  it('devuelve el slug tal cual si no lo conoce', () => {
    expect(corridorLabel('marte')).toBe('marte');
  });

  it('maneja null', () => {
    expect(corridorLabel(null)).toBe('Sin corredor');
    expect(branchLabel(null)).toBe('Sin rama');
  });

  it('deriva el label del ángulo desde el slug cuando no hay uno guardado', () => {
    expect(angleLabelOf(row({ angle_label: null, angle_tag: 'impacto_acumulado' }))).toBe(
      'Impacto acumulado',
    );
  });

  it('prefiere el label guardado', () => {
    expect(angleLabelOf(row({ angle_label: 'Protección del margen' }))).toBe(
      'Protección del margen',
    );
  });
});

describe('resolveBranchForKitSlug', () => {
  // Real Xending branch names, which are editorial rather than slug-shaped.
  const branches = [
    { id: 'b1', slug: 'velocidad-mismo-dia', name: 'Velocidad - Mismo Día' },
    { id: 'b2', slug: 'ahorro-costos-ocultos', name: 'Ahorro / Costos Ocultos' },
    { id: 'b3', slug: 'cuenta-multidivisa', name: 'Cuenta Multidivisa' },
    { id: 'b4', slug: 'cobertura-cambiaria', name: 'Cobertura Cambiaria' },
  ];

  it('resuelve velocidad por tema del slug', () => {
    expect(resolveBranchForKitSlug(branches, 'velocidad')?.id).toBe('b1');
  });

  it('resuelve costos-ahorro por tema del nombre', () => {
    expect(resolveBranchForKitSlug(branches, 'costos-ahorro')?.id).toBe('b2');
  });

  it('prefiere la coincidencia exacta de slug sobre el tema', () => {
    const withExact = [
      { id: 'x', slug: 'costos-ahorro', name: 'Nombre cualquiera' },
      ...branches,
    ];
    expect(resolveBranchForKitSlug(withExact, 'costos-ahorro')?.id).toBe('x');
  });

  it('ignora acentos y mayúsculas', () => {
    const accented = [{ id: 'a', slug: 'VELOCIDAD-MISMO-DÍA', name: 'Velocidad' }];
    expect(resolveBranchForKitSlug(accented, 'velocidad')?.id).toBe('a');
  });

  it('devuelve null con slug desconocido', () => {
    expect(resolveBranchForKitSlug(branches, 'multidivisa')).toBeNull();
  });

  it('devuelve null sin ramas o sin slug', () => {
    expect(resolveBranchForKitSlug([], 'velocidad')).toBeNull();
    expect(resolveBranchForKitSlug(branches, null)).toBeNull();
  });

  it('no confunde costos con velocidad', () => {
    // La regresión que motiva esto: un copy de costos generando narrativa de
    // velocidad porque el selector de UI estaba en otra rama.
    expect(resolveBranchForKitSlug(branches, 'costos-ahorro')?.name).not.toMatch(/velocidad/i);
    expect(resolveBranchForKitSlug(branches, 'velocidad')?.name).not.toMatch(/ahorro/i);
  });
});

describe('copyBankProgress', () => {
  it('sin image_meta no hay nada empezado', () => {
    const p = copyBankProgress(row({ image_meta: null }));
    expect(p).toMatchObject({ hasImagePrompt: false, carouselTotal: 0, carouselDone: 0, started: false });
  });

  it('un prompt de imagen ya cuenta como empezado', () => {
    const p = copyBankProgress(row({ image_meta: { imagePrompt: 'editorial photo of...' } }));
    expect(p.hasImagePrompt).toBe(true);
    expect(p.started).toBe(true);
  });

  it('un prompt en blanco no cuenta', () => {
    const p = copyBankProgress(row({ image_meta: { imagePrompt: '   ' } }));
    expect(p.hasImagePrompt).toBe(false);
    expect(p.started).toBe(false);
  });

  it('cuenta los slides del carrusel que ya tienen imagen', () => {
    const slot = (i: number, imageUrl?: string) => ({
      id: `s${i}`,
      index: i,
      role: 'tension' as const,
      slideCopy: { headline: `H${i}` },
      imageIntent: '',
      prompt: 'p',
      brandElements: [],
      status: 'idle' as const,
      imageUrl,
    });

    const p = copyBankProgress(
      row({
        image_meta: {
          carousel: {
            presetSlug: 'tension-shift-risk-solution-cta',
            visualAnchor: '',
            groupId: 'g',
            imageType: 'foto',
            createdAt: new Date().toISOString(),
            slots: [slot(0, 'https://x/0.png'), slot(1, 'https://x/1.png'), slot(2), slot(3), slot(4)],
          },
        },
      }),
    );

    expect(p.carouselTotal).toBe(5);
    expect(p.carouselDone).toBe(2);
    // Un carrusel a medias sigue siendo trabajo empezado.
    expect(p.started).toBe(true);
  });
});

describe('matchesCopyBankTab', () => {
  const proposal = row({ status: 'proposed' });
  const fresh = row({ status: 'seed' });
  const started = row({ status: 'approved', image_meta: { imagePrompt: 'algo' } });
  const published = row({ status: 'approved', used_at: new Date().toISOString() });

  it('las propuestas del agente solo viven en su pestaña', () => {
    expect(matchesCopyBankTab(proposal, 'proposed')).toBe(true);
    expect(matchesCopyBankTab(proposal, 'bank')).toBe(false);
    expect(matchesCopyBankTab(proposal, 'working')).toBe(false);
    expect(matchesCopyBankTab(proposal, 'used')).toBe(false);
  });

  it('el banco son los aprobados sin usar', () => {
    expect(matchesCopyBankTab(fresh, 'bank')).toBe(true);
    expect(matchesCopyBankTab(published, 'bank')).toBe(false);
  });

  it('un copy en proceso NO se sale del banco', () => {
    // La regla que pidió el usuario: marcar algo como en proceso no puede
    // hacerlo desaparecer de la biblioteca que estás hojeando.
    expect(matchesCopyBankTab(started, 'working')).toBe(true);
    expect(matchesCopyBankTab(started, 'bank')).toBe(true);
  });

  it('sin prompt ni carrusel no está en proceso', () => {
    expect(matchesCopyBankTab(fresh, 'working')).toBe(false);
  });

  it('los usados salen del banco y de en proceso', () => {
    expect(matchesCopyBankTab(published, 'used')).toBe(true);
    expect(matchesCopyBankTab(published, 'working')).toBe(false);
  });
});
