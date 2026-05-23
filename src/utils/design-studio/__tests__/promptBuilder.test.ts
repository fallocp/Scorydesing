import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from '../promptBuilder';
import type { VisualSelections, BrandPalette } from '@/types/design-studio';

describe('buildGenerationPrompt', () => {
  const fullBrandPalette: BrandPalette = {
    primary_color: '#0F1419',
    secondary_color: '#2ED4C7',
    accent_color: '#FF7A4A',
    fonts: {
      display: 'Montserrat',
      body: 'Inter',
    },
    logo_url: 'https://example.com/logo.png',
  };

  const fullSelections: VisualSelections = {
    background: 'dark-navy',
    visualStyle: 'glassmorphism',
    contentType: 'stat',
    heroElement: 'big-number',
    platform: 'instagram-post',
    contentMode: 'free',
    commercialBranchSlug: null,
    customIdea: null,
    pieceCopy: null,
    pieceImagePrompt: null,
  };

  it('includes all non-null selections in the prompt', () => {
    const prompt = buildGenerationPrompt(fullSelections, fullBrandPalette);

    expect(prompt).toContain('dark-navy');
    expect(prompt).toContain('glassmorphism');
    expect(prompt).toContain('stat');
    expect(prompt).toContain('big-number');
    expect(prompt).toContain('Instagram Post');
  });

  it('includes all brand identity elements', () => {
    const prompt = buildGenerationPrompt(fullSelections, fullBrandPalette);

    expect(prompt).toContain('#0F1419');
    expect(prompt).toContain('#2ED4C7');
    expect(prompt).toContain('#FF7A4A');
    expect(prompt).toContain('Montserrat');
    expect(prompt).toContain('Inter');
    expect(prompt).toContain('https://example.com/logo.png');
  });

  it('omits null selections from the prompt', () => {
    const partialSelections: VisualSelections = {
      background: null,
      visualStyle: 'minimalist',
      contentType: null,
      heroElement: null,
      platform: 'banner',
      contentMode: 'free',
      commercialBranchSlug: null,
      customIdea: null,
      pieceCopy: null,
      pieceImagePrompt: null,
    };

    const prompt = buildGenerationPrompt(partialSelections, fullBrandPalette);

    expect(prompt).toContain('minimalist');
    expect(prompt).toContain('Banner');
    expect(prompt).not.toContain('Background style: null');
    expect(prompt).not.toContain('Content type: null');
    expect(prompt).not.toContain('Hero element: null');
  });

  it('handles brand palette without optional font fields', () => {
    const minimalPalette: BrandPalette = {
      primary_color: '#111111',
      secondary_color: '#222222',
      accent_color: '#333333',
      fonts: {},
      logo_url: 'https://example.com/minimal-logo.svg',
    };

    const prompt = buildGenerationPrompt(fullSelections, minimalPalette);

    expect(prompt).toContain('#111111');
    expect(prompt).toContain('#222222');
    expect(prompt).toContain('#333333');
    expect(prompt).toContain('https://example.com/minimal-logo.svg');
    expect(prompt).not.toContain('Display font');
    expect(prompt).not.toContain('Body font');
  });

  it('includes generation instructions section', () => {
    const prompt = buildGenerationPrompt(fullSelections, fullBrandPalette);

    expect(prompt).toContain('## Instructions');
    expect(prompt).toContain('brand colors');
    expect(prompt).toContain('negative space');
    expect(prompt).toContain('platform dimensions');
  });

  it('includes Design Specifications section header when selections exist', () => {
    const prompt = buildGenerationPrompt(fullSelections, fullBrandPalette);

    expect(prompt).toContain('## Design Specifications');
  });

  it('includes Brand Identity section header', () => {
    const prompt = buildGenerationPrompt(fullSelections, fullBrandPalette);

    expect(prompt).toContain('## Brand Identity');
  });

  it('handles only platform selected (minimum valid state)', () => {
    const minimalSelections: VisualSelections = {
      background: null,
      visualStyle: null,
      contentType: null,
      heroElement: null,
      platform: 'linkedin-post',
      contentMode: 'free',
      commercialBranchSlug: null,
      customIdea: null,
      pieceCopy: null,
      pieceImagePrompt: null,
    };

    const prompt = buildGenerationPrompt(minimalSelections, fullBrandPalette);

    expect(prompt).toContain('LinkedIn Post');
    expect(prompt).toContain('#0F1419');
    expect(prompt).toContain('## Brand Identity');
  });
});
