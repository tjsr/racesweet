import { RaceSweetException } from './raceSweetException.js';

export class RaceSweetDataException extends RaceSweetException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RaceSweetDataException';
  }
}
