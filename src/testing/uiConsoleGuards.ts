import { afterEach, beforeEach, expect, vi } from 'vitest';

type UiConsoleGuardOptions = {
  allowErrorPatterns?: RegExp[];
  allowWarnPatterns?: RegExp[];
};

const formatCall = (args: unknown[]): string => args.map((arg) => {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}).join(' ');

const getUnexpectedCalls = (calls: unknown[][], allowedPatterns: RegExp[]): string[] => calls
  .map((callArgs) => formatCall(callArgs))
  .filter((callText) => !allowedPatterns.some((pattern) => pattern.test(callText)));

export const useUiConsoleGuards = (options: UiConsoleGuardOptions = {}): void => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  const allowedWarnPatterns = options.allowWarnPatterns || [];
  const allowedErrorPatterns = options.allowErrorPatterns || [];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    const warnCalls = consoleWarnSpy.mock.calls as unknown[][];
    const errorCalls = consoleErrorSpy.mock.calls as unknown[][];
    const unexpectedWarnCalls = getUnexpectedCalls(warnCalls, allowedWarnPatterns);
    const unexpectedErrorCalls = getUnexpectedCalls(errorCalls, allowedErrorPatterns);

    expect(unexpectedWarnCalls).toEqual([]);
    expect(unexpectedErrorCalls).toEqual([]);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });
};
