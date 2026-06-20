import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
}));

import {
  mapToBaseBrand,
  mapToStrategicLayer,
  mapToPreferences,
} from '../useCreateInitialProfile';
import type { OnboardingCollectedData } from '@/components/onboarding/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fullData: OnboardingCollectedData = {
  brand_name: 'Acme Corp',
  website_url: 'https://acme.com',
  social_profiles: ['https://linkedin.com/company/acme'],
  uploaded_assets: ['https://storage.example.com/logo.png'],
  visual_analysis: {
    dominant_colors: ['#1A1A2E', '#16213E', '#0F3460'],
    aesthetic: 'corporate-premium',
    composition_patterns: ['centered-card', 'hero-image'],
    typography_style: 'sans-serif bold',
    detected_dont: ['neon colors', 'comic fonts'],
  },
  communication_analysis: {
    tone: 'profesional, cercano',
    topics: ['finanzas', 'inversiones', 'mercados'],
    audience_signals: ['profesionales 30-50', 'inversionistas'],
    positioning: 'Plataforma líder en inversiones accesibles',
  },
  design_likes: ['fondos oscuros', 'tipografía bold', 'gradientes sutiles'],
  design_dislikes: ['colores pastel', 'glow effects', 'comic sans'],
  corrections: [
    {
      field: 'visual_analysis',
      original_value: { aesthetic: 'playful' },
      corrected_value: { aesthetic: 'corporate-premium' },
      phase: 'visual_analysis',
    },
  ],
};

const emptyData: OnboardingCollectedData = {};

// ─── mapToBaseBrand ──────────────────────────────────────────────────────────

describe('mapToBaseBrand', () => {
  it('maps full visual_analysis to base_brand layer', () => {
    const result = mapToBaseBrand(fullData);

    expect(result.brand_name).toBe('Acme Corp');
    expect(result.logo_url).toBe('https://storage.example.com/logo.png');
    expect(result.colors).toEqual(['#1A1A2E', '#16213E', '#0F3460']);
    expect(result.aesthetic).toBe('corporate-premium');
    expect(result.typography_style).toBe('sans-serif bold');
    expect(result.composition_patterns).toEqual(['centered-card', 'hero-image']);
    expect(result.detected_dont).toEqual(['neon colors', 'comic fonts']);
  });

  it('handles empty data gracefully', () => {
    const result = mapToBaseBrand(emptyData);

    expect(result.brand_name).toBe('');
    expect(result.logo_url).toBeNull();
    expect(result.colors).toEqual([]);
    expect(result.aesthetic).toBe('');
    expect(result.typography_style).toBe('');
    expect(result.composition_patterns).toEqual([]);
    expect(result.detected_dont).toEqual([]);
  });

  it('uses first uploaded asset as logo_url', () => {
    const data: OnboardingCollectedData = {
      uploaded_assets: ['https://storage.example.com/first.png', 'https://storage.example.com/second.png'],
    };
    const result = mapToBaseBrand(data);
    expect(result.logo_url).toBe('https://storage.example.com/first.png');
  });
});

// ─── mapToStrategicLayer ─────────────────────────────────────────────────────

describe('mapToStrategicLayer', () => {
  it('maps full communication_analysis to strategic_layer', () => {
    const result = mapToStrategicLayer(fullData);

    expect(result.tone).toBe('profesional, cercano');
    expect(result.topics).toEqual(['finanzas', 'inversiones', 'mercados']);
    expect(result.audience_signals).toEqual(['profesionales 30-50', 'inversionistas']);
    expect(result.positioning).toBe('Plataforma líder en inversiones accesibles');
  });

  it('handles empty data gracefully', () => {
    const result = mapToStrategicLayer(emptyData);

    expect(result.tone).toBe('');
    expect(result.topics).toEqual([]);
    expect(result.audience_signals).toEqual([]);
    expect(result.positioning).toBe('');
  });

  it('falls back to tone_description when communication_analysis.tone is missing', () => {
    const data: OnboardingCollectedData = {
      tone_description: 'informal y divertido',
      communication_analysis: {
        tone: '',
        topics: ['tech'],
        audience_signals: [],
        positioning: '',
      },
    };
    // When communication_analysis.tone is empty string, it's falsy so falls back
    const result = mapToStrategicLayer(data);
    expect(result.tone).toBe('informal y divertido');
  });

  it('prefers communication_analysis.tone over tone_description', () => {
    const data: OnboardingCollectedData = {
      tone_description: 'informal',
      communication_analysis: {
        tone: 'profesional',
        topics: [],
        audience_signals: [],
        positioning: '',
      },
    };
    const result = mapToStrategicLayer(data);
    expect(result.tone).toBe('profesional');
  });
});

// ─── mapToPreferences ────────────────────────────────────────────────────────

describe('mapToPreferences', () => {
  it('maps design_likes to increase and design_dislikes to decrease', () => {
    const result = mapToPreferences(fullData);

    expect(result.increase).toEqual(['fondos oscuros', 'tipografía bold', 'gradientes sutiles']);
    expect(result.decrease).toEqual(['colores pastel', 'glow effects', 'comic sans']);
  });

  it('handles empty data gracefully', () => {
    const result = mapToPreferences(emptyData);

    expect(result.increase).toEqual([]);
    expect(result.decrease).toEqual([]);
  });

  it('handles only likes without dislikes', () => {
    const data: OnboardingCollectedData = {
      design_likes: ['minimalismo'],
    };
    const result = mapToPreferences(data);
    expect(result.increase).toEqual(['minimalismo']);
    expect(result.decrease).toEqual([]);
  });
});
