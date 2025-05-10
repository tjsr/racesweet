import { asSafeNumber } from './utils.js';

describe('asSafeNumber', () => {
  it('should return 0 when the value is undefined', () => {
    expect(asSafeNumber(undefined)).toBe(0);
  });

  it('should return the number itself when the value is a number', () => {
    expect(asSafeNumber(42)).toBe(42);
    expect(asSafeNumber(0)).toBe(0);
    expect(asSafeNumber(-10)).toBe(-10);
  });

  it('should parse a valid numeric string and return the number', () => {
    expect(asSafeNumber('123')).toBe(123);
    expect(asSafeNumber('-456')).toBe(-456);
    expect(asSafeNumber('0')).toBe(0);
  });

  it('should return 0 for an invalid numeric string', () => {
    expect(asSafeNumber('abc')).toBe(0);
    expect(asSafeNumber('123abc')).toBe(0);
    expect(asSafeNumber('')).toBe(0);
  });
});
