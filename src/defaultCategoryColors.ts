/**
 * Default category colours packed as `0x00RRGGBB` values.
 *
 * The palette starts with the supplied high-contrast colours, then adds each
 * unique lower-intensity permutation in the same order through the complete
 * 32-intensity layer.
 */
export const DEFAULT_CATEGORY_COLORS: readonly number[] = [
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
  0x00400000,
  0x00004000,
  0x00000040,
  0x00404000,
  0x00400040,
  0x00004040,
  0x00804000,
  0x00800040,
  0x00008040,
  0x00004080,
  0x00400080,
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
];

export const packedRgbToCssColor = (color: number): string => `#${(color & 0x00ffffff).toString(16).padStart(6, '0')}`;
