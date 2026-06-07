import { afterEach, beforeEach, expect, vi } from 'vitest';

export const formatStderrWrite = (chunk: unknown): string => {
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString('utf8');
  }
  return String(chunk);
};

export const passThroughCallback = (args: unknown[]): void => {
  const callback = args.findLast((arg) => typeof arg === 'function');
  if (typeof callback === 'function') {
    callback();
  }
};

export const useStderrGuard = (): void => {
  let stderrOutput: string[];

  beforeEach(() => {
    stderrOutput = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown, ...args: unknown[]) => {
      stderrOutput.push(formatStderrWrite(chunk));
      passThroughCallback(args);
      return true;
    });
  });

  afterEach(() => {
    expect(stderrOutput.join('')).toBe('');
  });
};
