let sequence = 1;

export const getSequenceNumber = (): number => {
  const current = sequence;
  sequence++;
  return current;
};
