import { describe, expect, it } from 'vitest';
import { buildScopedRepairFeedback, correctionIsWorse, isMissingResourceIssue, isOrientationChange, namedReferences, readDesignFromExistingFlags,
  referenceNotUsedNotice, requestChecklist } from '../designFromExisting';

describe('diseñar sobre lo que ya existe', () => {
  it('reads the master switch and per-piece switches; off keeps the current behavior', () => {
    expect(readDesignFromExistingFlags({})).toBeUndefined();
    const flags = readDesignFromExistingFlags({ VITE_DESAING_DESIGN_FROM_EXISTING: 'true', VITE_DESAING_DESIGN_FROM_EXISTING_CANDADO_ESTILO: 'false' });
    expect(flags).toMatchObject({ escala: true, ficha_estricta: true, candado_estilo: false, prompt_base: true });
  });
  it('sends orientation or internal arrangement changes to a rewrite, not a patch', () => {
    expect(isOrientationChange('tarjetas horizontales, números 01-04 turquesa y barco más grande')).toBe(true);
    expect(isOrientationChange('pon el ícono a la izquierda y el texto a la derecha')).toBe(true);
    expect(isOrientationChange('cambia el título a «Beneficios»')).toBe(false);
    expect(isOrientationChange('agrega 3 tarjetas')).toBe(false);
  });
  it('turns the request into a checklist for the review', () => {
    expect(requestChecklist("Diapositiva 'beneficios': tarjetas horizontales, números 01-04 turquesa y barco más grande"))
      .toEqual(['tarjetas horizontales', 'números 01-04 turquesa', 'barco más grande']);
    expect(requestChecklist('sí')).toEqual([]);
  });
  it('only counts a reference as used when the message names it, and announces the unused one', () => {
    const references = [{ id: 'reference:a', name: 'Folleto azul.png' }, { id: 'reference:b', name: 'Imagen pegada' }];
    expect(namedReferences('aplica el estilo de la segunda imagen', references)).toEqual(['reference:b']);
    expect(namedReferences('usa los colores del folleto azul', references)).toEqual(['reference:a']);
    expect(namedReferences('cambia el título a «Hola»', references)).toEqual([]);
    expect(namedReferences('aplica el estilo de la referencia', [references[0]])).toEqual(['reference:a']);
    expect(referenceNotUsedNotice(['Folleto azul.png'])).toBe('No uso la referencia «Folleto azul.png» en este ajuste; dime si la quieres.');
  });
  it('limits «Corregir composición» to the detected problems and keeps the original request', () => {
    const feedback = buildScopedRepairFeedback(['El barco tapa la tarjeta 3.'], 'tarjetas horizontales');
    expect(feedback).toContain('Corrige SOLO los problemas detectados'); expect(feedback).toContain('- El barco tapa la tarjeta 3.');
    expect(feedback).toContain('PEDIDO ORIGINAL QUE SE CONSERVA (datos): tarjetas horizontales'); expect(feedback).toContain('candado de estilo');
    expect(feedback).not.toContain('Reorganiza el flujo');
  });
  it('discards a correction that leaves more problems or damages text', () => {
    expect(correctionIsWorse(['El barco tapa la tarjeta 3.'], [])).toBe(false);
    expect(correctionIsWorse(['Falta margen.'], ['El título queda recortado.'])).toBe(true);
    expect(correctionIsWorse(['Falta margen.'], ['Falta margen.', 'Contraste bajo.'])).toBe(true);
  });
  it('recognizes review issues about missing visual resources', () => {
    expect(isMissingResourceIssue('Faltan los íconos de las tarjetas 2 y 3.')).toBe(true);
    expect(isMissingResourceIssue('No se pudo cargar una imagen del diseño.')).toBe(true);
    expect(isMissingResourceIssue('El título queda recortado.')).toBe(false);
  });
});
