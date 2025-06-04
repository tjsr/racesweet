import { chipNumberInSeries, getPlateNumberFromChipCode } from "./participant.ts";

describe('getPlateNumberFromChipCode', () => {
  it('Should return the correct plate number for a given chip code', () => {
    const chipCode = 200060;
    const plateNumber = getPlateNumberFromChipCode(chipCode);
    expect(plateNumber).toEqual('60');
  });
});

describe('chipNumberInSeries', () => {
  it('Should return the correct plate number for a given chip code', () => {
    expect(chipNumberInSeries(200000, 200060)).toEqual(60);
  });
});
