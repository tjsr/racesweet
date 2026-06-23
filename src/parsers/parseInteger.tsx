export const parseInteger = (value: string): number | undefined => {
  if (value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('Age and team-size fields must be whole numbers or blank.');
  }

  return parsed;
};
