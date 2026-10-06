import { describe, expect, it } from 'vitest';
import { DESIGN_FORMAT_GROUPS, DESIGN_FORMAT_OPTIONS, designFormatOption } from './formats';

describe('design format dropdown', () => {
  it('offers one option per distinct canvas, grouped for the dropdown', () => {
    const sizes = DESIGN_FORMAT_OPTIONS.map(option => `${option.canvas.width}x${option.canvas.height}:${option.id}`);
    expect(new Set(DESIGN_FORMAT_OPTIONS.map(option => option.id)).size).toBe(DESIGN_FORMAT_OPTIONS.length);
    expect(sizes).toContain('1200x627:linkedin_landscape');
    expect(DESIGN_FORMAT_OPTIONS.some(option => option.id === 'facebook_landscape')).toBe(false);
    for (const option of DESIGN_FORMAT_OPTIONS) expect(DESIGN_FORMAT_GROUPS[option.group]).toBeTruthy();
  });
  it('includes both LinkedIn covers with their real canvases as compositions', () => {
    expect(designFormatOption('linkedin_personal_cover')).toMatchObject({ canvas: { width: 1584, height: 396 }, mode: 'compose_assets' });
    expect(designFormatOption('linkedin_page_cover')).toMatchObject({ canvas: { width: 1512, height: 256 }, mode: 'compose_assets' });
    expect(designFormatOption('instagram_story')).toMatchObject({ canvas: { width: 1080, height: 1920 }, mode: 'single_image' });
  });
});
