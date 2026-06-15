import { RaceSweetDataException } from "./raceSweetDataException";

export class HandicapDataException extends RaceSweetDataException {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'HandicapDataException';
  }
}
