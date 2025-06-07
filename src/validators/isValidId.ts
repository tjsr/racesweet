import { isInt } from './isInt.ts';
import { validate } from 'uuid';

export const isValidId = (id: string | number): boolean => {
  if (typeof id === 'number') {
    return Number.isInteger(id) && id > 0;
  }
  if (typeof id === 'string') {
    return validate(id) || isInt(id);
  }
  return false;
};
