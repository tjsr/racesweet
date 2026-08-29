import {
  DEFAULT_CATEGORY_COLORS,
  packedRgbToCssColor,
} from "./defaultCategoryColors.js";

const CATEGORY_COLORS: readonly string[] =
  DEFAULT_CATEGORY_COLORS.map(packedRgbToCssColor);

const getCategoryColorIndex = (categoryKey: string): number => {
  return (
    Array.from(categoryKey).reduce<number>(
      (hash: number, character: string): number =>
        (hash * 31 + character.charCodeAt(0)) >>> 0,
      0,
    ) % CATEGORY_COLORS.length
  );
};

export const getCategoryColor = (
  categoryKey: string | undefined,
): string | undefined => {
  if (!categoryKey) {
    return undefined;
  }

  return CATEGORY_COLORS[getCategoryColorIndex(categoryKey)];
};

export const getCategoryPaletteColor = (index: number): string =>
  CATEGORY_COLORS[index % CATEGORY_COLORS.length]!;
