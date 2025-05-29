
export class IllegalTimeRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalTimeRecordError';
  }
}
