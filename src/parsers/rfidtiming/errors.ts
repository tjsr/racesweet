
export class InvalidRfidTimingFormatError extends Error {
  constructor(reason: string, line: string) {
    super(`Invalid RFID timing format - ${reason}: ${line}`);
    this.name = 'InvalidRfidTimingFormatError';
  }
}
