
export const inferTransponderFromRaceNumber = (raceNumber: string, txRange: number): number => {
  const raceNoInt = parseInt(raceNumber, 10);
  if (isNaN(raceNoInt)) {
    throw new Error(`Race plate ${raceNumber} can not be automaitcally converted to transponder number.`);
  }
  return txRange + raceNoInt;
};
