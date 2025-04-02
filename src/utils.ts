export const safeIntOption = (...values: string[]): number | undefined => {
  for (const value of values) {
    if (value !== undefined) {
      const intValue: number = parseInt(value, 10);
      if (!isNaN(intValue)) {
        return intValue;
      }
    }
  }
  return undefined;
};

