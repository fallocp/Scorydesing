/**
 * Invariantes del catálogo de estructuras.
 *
 * Existen porque los presets son datos y los datos se editan sin correr la app: un
 * rol sin brief o una marca montada en tres slides no truena nada, solo produce un
 * carrusel mal armado que se descubre después de gastar cinco generaciones.
 */

import { describe, expect, it } from 'vitest';

import {
  brandElementsForSlide,
  CAROUSEL_PRESETS,
  CAROUSEL_ROLE_BRIEFS,
  CAROUSEL_ROLE_LABELS,
  CAROUSEL_ROLE_LAYOUT_HINT,
  getCarouselPreset,
} from '../design-studio';

describe('catálogo de presets', () => {
  it('cada rol usado tiene etiqueta, brief y layout sugerido', () => {
    for (const preset of CAROUSEL_PRESETS) {
      for (const role of preset.roles) {
        expect(CAROUSEL_ROLE_LABELS[role], `label de ${role}`).toBeTruthy();
        expect(CAROUSEL_ROLE_BRIEFS[role], `brief de ${role}`).toBeTruthy();
        expect(CAROUSEL_ROLE_LAYOUT_HINT[role], `layout de ${role}`).toBeTruthy();
      }
    }
  });

  it('cada preset trae sus propias reglas de lectura', () => {
    // Sin esto el agente cae al fallback del arco encadenado y la estructura nueva
    // sale escrita como el arco viejo, que es el problema que vinieron a resolver.
    for (const preset of CAROUSEL_PRESETS) {
      expect(preset.narrativeRules.trim().length, preset.slug).toBeGreaterThan(0);
    }
  });

  it('la marca se monta en un solo slide por preset', () => {
    for (const preset of CAROUSEL_PRESETS) {
      const carriers = preset.roles
        .map((_, i) => brandElementsForSlide(preset, i))
        .filter((els) => els.length > 0);

      expect(carriers.length, `${preset.slug} monta marca en ${carriers.length} slides`)
        .toBeLessThanOrEqual(1);
    }
  });

  it('con roles repetidos, el logo va en el primero de su tipo', () => {
    // El checklist son tres slides 'signal' y la cronología tres 'moment'.
    // Direccionar por rol se los ponía a los tres.
    const checklist = getCarouselPreset('checklist-3-senales');
    expect(checklist.roles.filter((r) => r === 'signal')).toHaveLength(3);

    const timeline = getCarouselPreset('cronologia-operacion');
    expect(brandElementsForSlide(timeline, 0)).toContain('logo');
    expect(brandElementsForSlide(timeline, 1)).toEqual([]);
    expect(brandElementsForSlide(timeline, 2)).toEqual([]);
  });

  it('los slugs no se repiten', () => {
    const slugs = CAROUSEL_PRESETS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('un slug desconocido cae al primer preset en vez de reventar', () => {
    expect(getCarouselPreset('no-existe')).toBe(CAROUSEL_PRESETS[0]);
  });
});
