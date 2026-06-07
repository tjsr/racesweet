import { formatStderrWrite, passThroughCallback } from './stderrGuard';

describe('stderrGuard', () => {
  it('formats stderr write chunks consistently', () => {
    expect(formatStderrWrite('plain text')).toBe('plain text');
    expect(formatStderrWrite(Buffer.from('buffer text'))).toBe('buffer text');
    expect(formatStderrWrite(new Uint8Array(Buffer.from('uint text')))).toBe('uint text');
  });

  it('calls stream write callbacks when stderr is intercepted', () => {
    const callback = vi.fn();

    passThroughCallback(['utf8', callback]);

    expect(callback).toHaveBeenCalledOnce();
  });
});
