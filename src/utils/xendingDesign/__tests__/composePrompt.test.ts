import { describe, it, expect } from 'vitest';
import {
  composePromptContext,
  composePromptText,
  type ComposePromptParams,
} from '../composePrompt';
import type { StrategicConfig } from '@/schemas/campaign/commercialBranch.schema';

const baseStrategicConfig: StrategicConfig = {
  objetivo: 'Posicionar Xending como la opción más rápida para pagos internacionales',
  insight: 'Las empresas pierden oportunidades por la lentitud bancaria',
  dolor: 'Esperar 3-5 días hábiles para que llegue un pago internacional',
  promesa: 'Tu pago llega el mismo día',
  audiencia: 'CFOs y tesoreros de empresas importadoras/exportadoras',
  angulos: ['Urgencia Operativa', 'Comparativa'],
  claims_permitidos: ['Pagos mismo día', 'Sin comisiones ocultas'],
  claims_prohibidos: ['Garantizado', 'Sin riesgo'],
  ctas: ['Cotiza ahora', 'Habla con un asesor'],
  footers: ['Sujeto a disponibilidad'],
  guia_visual: 'Colores vibrantes, tipografía bold, iconos de velocidad',
};

const baseBrandIdentity = {
  name: 'Xending',
  logo_url: 'https://example.com/logo.png',
  primary_color: '#FF7A4A',
  secondary_color: '#2ED4C7',
  accent_color: '#0F1419',
};

const baseParams: ComposePromptParams = {
  masterPrompt: 'Eres un experto en marketing fintech para Xending.',
  strategicConfig: baseStrategicConfig,
  channel: 'Instagram Ads',
  brandIdentity: baseBrandIdentity,
  complianceRules: {
    forbidden_terms: ['Garantizado'],
    required_qualifiers: [],
    max_values: {},
  },
  brandDisclaimer: 'Xending es una empresa regulada. Consulta términos y condiciones.',
};

describe('composePromptContext', () => {
  it('returns base fields without optional dimensions', () => {
    const result = composePromptContext(baseParams);

    expect(result.masterPrompt).toBe(baseParams.masterPrompt);
    expect(result.strategicConfig).toBe(baseStrategicConfig);
    expect(result.channel).toBe('Instagram Ads');
    expect(result.brandDisclaimer).toBe(baseParams.brandDisclaimer);
    expect(result.brandIdentity).toEqual(baseBrandIdentity);
    expect(result.verticalKeywords).toBeUndefined();
    expect(result.verticalVisualContext).toBeUndefined();
    expect(result.momentTriggerType).toBeUndefined();
    expect(result.momentDescription).toBeUndefined();
    expect(result.angle).toBeUndefined();
  });

  it('includes vertical keywords and visual context when provided', () => {
    const result = composePromptContext({
      ...baseParams,
      vertical: {
        keywords: ['aguacate', 'michoacán', 'exportación'],
        visual_context: 'Campos verdes de aguacate, cajas de empaque',
      },
    });

    expect(result.verticalKeywords).toEqual(['aguacate', 'michoacán', 'exportación']);
    expect(result.verticalVisualContext).toBe('Campos verdes de aguacate, cajas de empaque');
  });

  it('omits verticalKeywords when keywords array is empty', () => {
    const result = composePromptContext({
      ...baseParams,
      vertical: { keywords: [] },
    });

    expect(result.verticalKeywords).toBeUndefined();
    expect(result.verticalVisualContext).toBeUndefined();
  });

  it('includes moment trigger type and description when provided', () => {
    const result = composePromptContext({
      ...baseParams,
      moment: {
        trigger_type: 'fed',
        description: 'La Fed sube tasas 25 puntos base',
      },
    });

    expect(result.momentTriggerType).toBe('fed');
    expect(result.momentDescription).toBe('La Fed sube tasas 25 puntos base');
  });

  it('includes moment trigger type without description', () => {
    const result = composePromptContext({
      ...baseParams,
      moment: { trigger_type: 'banxico' },
    });

    expect(result.momentTriggerType).toBe('banxico');
    expect(result.momentDescription).toBeUndefined();
  });

  it('includes angle when provided', () => {
    const result = composePromptContext({
      ...baseParams,
      angle: 'Urgencia Operativa',
    });

    expect(result.angle).toBe('Urgencia Operativa');
  });

  it('composes all dimensions together', () => {
    const result = composePromptContext({
      ...baseParams,
      vertical: {
        keywords: ['mango', 'tropical'],
        visual_context: 'Frutas tropicales vibrantes',
      },
      moment: {
        trigger_type: 'usdmxn',
        description: 'USD/MXN rompe barrera de 18',
      },
      angle: 'Dato Duro',
    });

    expect(result.masterPrompt).toBe(baseParams.masterPrompt);
    expect(result.strategicConfig).toBe(baseStrategicConfig);
    expect(result.verticalKeywords).toEqual(['mango', 'tropical']);
    expect(result.verticalVisualContext).toBe('Frutas tropicales vibrantes');
    expect(result.momentTriggerType).toBe('usdmxn');
    expect(result.momentDescription).toBe('USD/MXN rompe barrera de 18');
    expect(result.channel).toBe('Instagram Ads');
    expect(result.angle).toBe('Dato Duro');
    expect(result.brandDisclaimer).toBe(baseParams.brandDisclaimer);
    expect(result.brandIdentity.name).toBe('Xending');
  });
});

describe('composePromptText', () => {
  it('includes master prompt in output', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).toContain(baseParams.masterPrompt);
  });

  it('includes strategic config fields', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).toContain(baseStrategicConfig.objetivo);
    expect(text).toContain(baseStrategicConfig.audiencia);
    expect(text).toContain(baseStrategicConfig.insight);
    expect(text).toContain(baseStrategicConfig.dolor);
    expect(text).toContain(baseStrategicConfig.promesa);
    expect(text).toContain('Pagos mismo día');
    expect(text).toContain('Sin riesgo');
    expect(text).toContain('Cotiza ahora');
    expect(text).toContain(baseStrategicConfig.guia_visual);
  });

  it('includes channel in output', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).toContain('Instagram Ads');
  });

  it('includes brand disclaimer in output', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).toContain(baseParams.brandDisclaimer);
  });

  it('includes brand name in output', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).toContain('Xending');
  });

  it('includes vertical keywords when present', () => {
    const context = composePromptContext({
      ...baseParams,
      vertical: {
        keywords: ['aguacate', 'michoacán'],
        visual_context: 'Campos verdes',
      },
    });
    const text = composePromptText(context);

    expect(text).toContain('aguacate');
    expect(text).toContain('michoacán');
    expect(text).toContain('Campos verdes');
  });

  it('omits vertical section when no vertical provided', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).not.toContain('Contexto Vertical');
  });

  it('includes moment trigger type and description when present', () => {
    const context = composePromptContext({
      ...baseParams,
      moment: {
        trigger_type: 'fed',
        description: 'Fed sube tasas',
      },
    });
    const text = composePromptText(context);

    expect(text).toContain('fed');
    expect(text).toContain('Fed sube tasas');
    expect(text).toContain('Momento de Mercado');
  });

  it('omits moment section when no moment provided', () => {
    const context = composePromptContext(baseParams);
    const text = composePromptText(context);

    expect(text).not.toContain('Momento de Mercado');
  });

  it('includes angle when present', () => {
    const context = composePromptContext({
      ...baseParams,
      angle: 'Comparativa',
    });
    const text = composePromptText(context);

    expect(text).toContain('Comparativa');
  });
});
