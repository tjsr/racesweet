const CATEGORY_COLORS: readonly string[] = [
  '#0057b8',
  '#b00020',
  '#217a34',
  '#7a4cc2',
  '#a65f00',
  '#007a78',
];

const getCategoryColorIndex = (categoryKey: string): number => {
  return Array.from(categoryKey).reduce<number>((hash: number, character: string): number => (
    (hash * 31 + character.charCodeAt(0)) >>> 0
  ), 0) % CATEGORY_COLORS.length;
};

export const getCategoryColor = (categoryKey: string | undefined): string | undefined => {
  if (!categoryKey) {
    return undefined;
  }

  return CATEGORY_COLORS[getCategoryColorIndex(categoryKey)];
};

export const getCategoryPaletteColor = (index: number): string => (
  CATEGORY_COLORS[index % CATEGORY_COLORS.length]!
);
