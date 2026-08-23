import { describe, expect, it } from 'vitest';
import { getCategoryColor, getCategoryPaletteColor } from './categoryColors.js';

describe('getCategoryColor', () => {
  it('returns a stable colour for a category key and no colour for an unassigned category', () => {
    expect(getCategoryColor('category-premier')).toBe(getCategoryColor('category-premier'));
    expect(getCategoryColor('category-premier')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getCategoryColor(undefined)).toBeUndefined();
    expect(getCategoryPaletteColor(0)).toBe(getCategoryPaletteColor(6));
  });
});
