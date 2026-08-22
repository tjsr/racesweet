import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIracingAgentConfig } from './iracingAgentConfig.js';

const createEncryptedPassword = (password: string, url: string, sourceId: string, sessionId: string, username: string): string => {
  const key: Buffer = createHash('sha256').update(`${url}\0${sourceId}\0${sessionId}\0${username}`).digest();
  const iv: Buffer = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const cipherText: Buffer = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${cipherText.toString('base64url')}`;
};

describe('createIracingAgentConfig', () => {
  it('uses the properties username instead of the Windows USERNAME environment variable when decrypting the password', () => {
    const url: string = 'http://127.0.0.1:8080';
    const sourceId: string = 'iracing-agent';
    const sessionId: string = 'active';
    const username: string = 'admin';
    const password: string = 'adminadminadmin';
    const properties: Record<string, string> = {
      passwordEncrypted: createEncryptedPassword(password, url, sourceId, sessionId, username),
      sessionId,
      sourceId,
      url,
      username,
    };

    const config = createIracingAgentConfig(properties, { USERNAME: 'WindowsUser' });

    expect(config.password).toBe(password);
    expect(config.username).toBe(username);
  });

  it('explains how to recover when a configuration field no longer matches the encrypted password', () => {
    const properties: Record<string, string> = {
      passwordEncrypted: createEncryptedPassword('adminadminadmin', 'http://127.0.0.1:3000', 'iracing-agent', 'active', 'admin'),
      sessionId: 'active',
      sourceId: 'iracing-agent',
      url: 'http://127.0.0.1:3001',
      username: 'admin',
    };

    expect(() => createIracingAgentConfig(properties, {})).toThrow(
      'Unable to decrypt passwordEncrypted. Its encryption key is derived from url, sourceId, sessionId, and username. '
      + 'Set RACESWEET_PASSWORD for this launch, or rebuild the agent package after changing any of those values.',
    );
  });

  it('uses a launch password when the configured endpoint has changed', () => {
    const properties: Record<string, string> = {
      passwordEncrypted: createEncryptedPassword('adminadminadmin', 'http://127.0.0.1:3000', 'iracing-agent', 'active', 'admin'),
      sessionId: 'active',
      sourceId: 'iracing-agent',
      url: 'http://127.0.0.1:3001',
      username: 'admin',
    };

    const config = createIracingAgentConfig(properties, { RACESWEET_PASSWORD: 'debug-password' });

    expect(config.password).toBe('debug-password');
  });
});
