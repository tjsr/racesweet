export const validatePositiveNumbers = (...inputs: string[]): void => {
  inputs.forEach((input) => {
    const number = parseInt(input);
    if (isNaN(number) || number <= 0) {
      throw new Error(`Invalid value: ${input}`);
    }
  });
};
