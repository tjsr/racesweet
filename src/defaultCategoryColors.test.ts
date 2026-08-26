import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_COLORS } from './defaultCategoryColors.js';

describe('DEFAULT_CATEGORY_COLORS', () => {
  it('contains all unique RGB colours through the 32-intensity layer', () => {
    expect(DEFAULT_CATEGORY_COLORS).toHaveLength(39);
    expect(new Set<number>(DEFAULT_CATEGORY_COLORS)).toHaveLength(39);
    expect(DEFAULT_CATEGORY_COLORS.slice(0, 17)).toEqual([
      0x00ff0000,
      0x0000ff00,
      0x000000ff,
      0x00ffff00,
      0x00ff00ff,
      0x0000ffff,
      0x00800000,
      0x00008000,
      0x00000080,
      0x00808000,
      0x00800080,
      0x00008080,
      0x00ff8000,
      0x00ff0080,
      0x0000ff80,
      0x000080ff,
      0x008000ff,
    ]);
    expect(DEFAULT_CATEGORY_COLORS.slice(-11)).toEqual([
      0x00200000,
      0x00002000,
      0x00000020,
      0x00202000,
      0x00200020,
      0x00002020,
      0x00402000,
      0x00400020,
      0x00004020,
      0x00002040,
      0x00200040,
    ]);
  });
});
