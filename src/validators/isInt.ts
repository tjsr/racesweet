export const isInt = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return /^\d+$/.test(value);
  }
  return Number.isInteger(value);
};
