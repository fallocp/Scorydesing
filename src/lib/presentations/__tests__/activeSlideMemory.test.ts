import { describe, expect, it } from 'vitest';
import { rememberActiveSlide, rememberDesignPopup, rememberedDesignPopup, rememberedSlideIndex } from '../activeSlideMemory';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
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

  it('a remount while «Diseñar diapositiva» is open reopens it on the same slide; closing it forgets it', () => {
    const store = storage();
    rememberActiveSlide('business', 'deck', 'slide-5', store);
    rememberDesignPopup('business', 'deck', true, store);
    // Remount: the page state is gone, the tab memory is not.
    expect(rememberedDesignPopup('business', 'deck', store)).toBe(true);
    expect(rememberedSlideIndex(deck, 'business', 'deck', store)).toBe(4);
    expect(rememberedDesignPopup('business', 'other-deck', store)).toBe(false);
    rememberDesignPopup('business', 'deck', false, store);
    expect(rememberedDesignPopup('business', 'deck', store)).toBe(false);
    expect(rememberedDesignPopup('business', 'deck', { getItem: () => { throw Error('blocked'); } })).toBe(false);
  });
});
