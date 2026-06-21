import { isGuid } from './utils.js';

describe('isGuid', () => {
  it('should accept valid GUID strings', () => {
    const validGuids = [
      '00000000-0000-1000-8000-000000000000',
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-22d3-9456-426614174000',
      '123e4567-e89b-32d3-a456-426614174000',
      '123e4567-e89b-42d3-b456-426614174000',
      '123e4567-e89b-52d3-8456-426614174000',
      '123E4567-E89B-12D3-A456-426614174000',
    ];

    validGuids.forEach((value) => {
      expect(isGuid(value)).toBe(true);
    });
  });

  it('should reject invalid GUID strings', () => {
    const invalidGuids = [
      '',
      ' ',
      '123e4567-e89b-12d3-a456-42661417400',
      '123e4567-e89b-12d3-a456-4266141740000',
      '123e4567e89b12d3a456426614174000',
      '123e4567-e89b-12d3-a456',
      '123e4567-e89b-12d3-a456-426614174000-extra',
      '123e4567-e89b-02d3-a456-426614174000',
      '123e4567-e89b-62d3-a456-426614174000',
      '123e4567-e89b-12d3-7456-426614174000',
      '123e4567-e89b-12d3-c456-426614174000',
      'g23e4567-e89b-12d3-a456-426614174000',
      '{123e4567-e89b-12d3-a456-426614174000}',
      ' 123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174000 ',
    ];

    invalidGuids.forEach((value) => {
      expect(isGuid(value)).toBe(false);
    });
  });

  it('should reject invalid runtime input values', () => {
    const invalidValues = [
      undefined,
      null,
      123,
      true,
      {},
      [],
    ];

    invalidValues.forEach((value) => {
      expect(isGuid(value as string)).toBe(false);
    });
  });
});
