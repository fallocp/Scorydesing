/**
 * Unit tests for mergePreferenceArrays utility.
 *
 * Tests deduplication, case-insensitive matching, and cap enforcement.
 */
import { describe, it, expect } from "vitest";
import { mergePreferenceArrays } from "../lib/mergePreferences";

describe("mergePreferenceArrays", () => {
  it("merges new items into existing array", () => {
    const existing = ["fondos claros", "tipografía bold"];
    const newItems = ["colores vibrantes"];
    const result = mergePreferenceArrays(existing, newItems);

    expect(result).toEqual(["fondos claros", "tipografía bold", "colores vibrantes"]);
  });

  it("deduplicates case-insensitively", () => {
    const existing = ["Fondos Claros", "tipografía bold"];
    const newItems = ["fondos claros", "nuevo item"];
    const result = mergePreferenceArrays(existing, newItems);

    expect(result).toEqual(["Fondos Claros", "tipografía bold", "nuevo item"]);
  });

  it("deduplicates with trimmed whitespace", () => {
    const existing = ["fondos claros"];
    const newItems = ["  fondos claros  "];
    const result = mergePreferenceArrays(existing, newItems);

    expect(result).toEqual(["fondos claros"]);
  });

  it("caps at maxItems (default 20)", () => {
    const existing = Array.from({ length: 18 }, (_, i) => `item-${i}`);
    const newItems = ["new-1", "new-2", "new-3"];
    const result = mergePreferenceArrays(existing, newItems);

    expect(result).toHaveLength(20);
    // Should keep the most recent items (sliced from end)
    expect(result[result.length - 1]).toBe("new-3");
  });

  it("respects custom maxItems parameter", () => {
    const existing = ["a", "b", "c"];
    const newItems = ["d", "e"];
    const result = mergePreferenceArrays(existing, newItems, 3);

    // Keeps last 3: c, d, e
    expect(result).toHaveLength(3);
    expect(result).toEqual(["c", "d", "e"]);
  });

  it("handles empty existing array", () => {
    const result = mergePreferenceArrays([], ["new item"]);
    expect(result).toEqual(["new item"]);
  });

  it("handles empty new items array", () => {
    const existing = ["existing item"];
    const result = mergePreferenceArrays(existing, []);
    expect(result).toEqual(["existing item"]);
  });

  it("handles both arrays empty", () => {
    const result = mergePreferenceArrays([], []);
    expect(result).toEqual([]);
  });

  it("does not add duplicate items from newItems array itself", () => {
    const existing: string[] = [];
    const newItems = ["item A", "item A", "item B"];
    const result = mergePreferenceArrays(existing, newItems);

    expect(result).toEqual(["item A", "item B"]);
  });
});
