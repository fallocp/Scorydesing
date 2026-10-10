import { describe, expect, it } from 'vitest';
import { rememberActiveSlide, rememberedSlideIndex } from '../activeSlideMemory';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
const deck = Array.from({ length: 11 }, (_, index) => ({ id: `slide-${index + 1}` }));

describe('active slide memory across a remount of the presentations page', () => {
  it('reopens the same project on the slide being worked on, not on slide 1', () => {
    const store = storage();
    rememberActiveSlide('business', 'deck', 'slide-3', store);
    expect(rememberedSlideIndex(deck, 'business', 'deck', store)).toBe(2);
  });

  it('keeps projects and businesses apart and falls back to the first slide when the slide is gone', () => {
    const store = storage();
    rememberActiveSlide('business', 'deck', 'slide-3', store);
    expect(rememberedSlideIndex(deck, 'business', 'other-deck', store)).toBe(0);
    expect(rememberedSlideIndex(deck, 'other-business', 'deck', store)).toBe(0);
    expect(rememberedSlideIndex(deck.filter(slide => slide.id !== 'slide-3'), 'business', 'deck', store)).toBe(0);
    expect(rememberedSlideIndex(deck, 'business', 'deck', { getItem: () => { throw Error('blocked'); } })).toBe(0);
  });
});
