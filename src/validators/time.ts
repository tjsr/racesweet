export const validateTimeString = (input: string | undefined): boolean => {
  if (!input || input.trim() == '') {
    return false;
  }

  const timeValidator: RegExp = /^(2[0-3]|[01][0-9]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(Z|\+(\d{2}:\d{2}))?$/;
  return input.match(timeValidator) !== null;
};
