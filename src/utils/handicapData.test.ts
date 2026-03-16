import { scaleEventScore } from "./handicapData.js";

describe('scaleEventScore', () => {
  test('should scale score when leader is slower than top ranked all-time', () => {
    const highestRatio = 0.1000;
    const lowestRatio = 0.9000;
    const currentScore = 0.2000;

    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.26, 2);
  });

  test('Should expand score when leader is fastest overall', () => {
    const highestRatio = 0.0000;
    const lowestRatio = 0.6666;
    const currentScore = 0.3333;
    
    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.2222, 4);
  });

  test('Should remain fastest within range', () => {
    const highestRatio = 0.100;
    const lowestRatio = 0.750;
    const currentScore = 0.000;

    const scaledScore = scaleEventScore(currentScore, highestRatio, lowestRatio);
    expect(scaledScore).toBeCloseTo(0.1, 2);
  });
});
