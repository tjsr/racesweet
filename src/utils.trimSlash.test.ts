import { trimSlash } from './utils.js';

describe('trimSlash', () => {
  it('should remove a trailing slash', () => {
    expect(trimSlash('https://example.com/')).toBe('https://example.com');
    expect(trimSlash('/events/2026/')).toBe('/events/2026');
    expect(trimSlash('event/')).toBe('event');
  });

  it('should leave strings without a trailing slash unchanged', () => {
    expect(trimSlash('https://example.com')).toBe('https://example.com');
    expect(trimSlash('/events/2026')).toBe('/events/2026');
    expect(trimSlash('event')).toBe('event');
  });

  it('should remove only one trailing slash', () => {
    expect(trimSlash('https://example.com//')).toBe('https://example.com/');
    expect(trimSlash('event//')).toBe('event/');
  });

  it('should preserve leading and internal slashes', () => {
    expect(trimSlash('/')).toBe('');
    expect(trimSlash('/event')).toBe('/event');
    expect(trimSlash('/event/session/one/')).toBe('/event/session/one');
  });

  it('should leave an empty string unchanged', () => {
    expect(trimSlash('')).toBe('');
  });
});
