export class RaceSweetException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RaceSweetException';
  }
}
