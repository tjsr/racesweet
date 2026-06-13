import { RaceSweetDataException } from './raceSweetDataException.js';

export class ApicalDataException extends RaceSweetDataException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApicalDataException';
  }
}
