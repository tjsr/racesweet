import { DEFAULT_RACESWEET_SERVER_PORT, RACESWEET_SERVER_PORT_ENV, getRaceSweetServerPort } from './serverPort.js';
import { describe, expect, it } from 'vitest';

describe('getRaceSweetServerPort', () => {
  it('defaults to the RaceSweet server port', () => {
    expect(getRaceSweetServerPort({})).toBe(DEFAULT_RACESWEET_SERVER_PORT);
  });

  it('uses RACESWEET_SERVER_PORT when configured', () => {
    expect(getRaceSweetServerPort({ [RACESWEET_SERVER_PORT_ENV]: '4567' })).toBe(4567);
  });

  it('rejects invalid configured ports', () => {
    expect(() => getRaceSweetServerPort({ [RACESWEET_SERVER_PORT_ENV]: 'not-a-port' })).toThrow(
      'RACESWEET_SERVER_PORT must be a TCP port number between 1 and 65535.'
    );
    expect(() => getRaceSweetServerPort({ [RACESWEET_SERVER_PORT_ENV]: '70000' })).toThrow(
      'RACESWEET_SERVER_PORT must be a TCP port number between 1 and 65535.'
    );
  });
});
