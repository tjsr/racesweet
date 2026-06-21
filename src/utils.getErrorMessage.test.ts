import { getErrorMessage } from './utils.js';

describe('getErrorMessage', () => {
  it('should return the message from an Error object', () => {
    expect(getErrorMessage(new Error('Something went wrong'))).toBe('Something went wrong');
  });

  it('should return an empty string when an Error has no message', () => {
    expect(getErrorMessage(new Error())).toBe('');
  });

  it('should return the message from an Error object with a cause', () => {
    const error = new Error('Unable to load event data', {
      cause: new Error('Network request failed'),
    });

    expect(getErrorMessage(error)).toBe('Unable to load event data');
  });

  it('should return an empty string when an Error has only a cause', () => {
    const error = new Error('', {
      cause: new Error('Network request failed'),
    });

    expect(getErrorMessage(error)).toBe('');
  });

  it('should stringify non-Error values', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure');
    expect(getErrorMessage(404)).toBe('404');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});
