import { createDecipheriv, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IracingAgentConfig } from './iracingAgent.js';
import type { IracingTimingLine } from '../utils/iracingRelay.js';

type IracingAgentProperties = Record<string, string>;

const propertyOrEnvironment = (
  properties: IracingAgentProperties,
  environment: NodeJS.ProcessEnv,
  propertyName: string,
  environmentName: string,
): string | undefined => environment[environmentName] || properties[propertyName];

const decryptPassword = (
  properties: IracingAgentProperties,
  environment: NodeJS.ProcessEnv,
): string => {
  const encrypted: string | undefined = propertyOrEnvironment(properties, environment, 'passwordEncrypted', 'RACESWEET_PASSWORD_ENCRYPTED');
  const baseUrl: string | undefined = propertyOrEnvironment(properties, environment, 'url', 'RACESWEET_URL');
  const sourceId: string | undefined = propertyOrEnvironment(properties, environment, 'sourceId', 'RACESWEET_SOURCE_ID');
  const sessionId: string | undefined = propertyOrEnvironment(properties, environment, 'sessionId', 'RACESWEET_SESSION_ID');
  const username: string | undefined = propertyOrEnvironment(properties, environment, 'username', 'RACESWEET_USERNAME');
  if (!encrypted || !baseUrl || !sourceId || !sessionId || !username) {
    return '';
  }
  const [version, ivText, tagText, cipherText]: string[] = encrypted.split(':');
  if (version !== 'v1' || !ivText || !tagText || !cipherText) {
    return '';
  }
  const key: Buffer = createHash('sha256').update(`${baseUrl}\0${sourceId}\0${sessionId}\0${username}`).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(cipherText, 'base64url')), decipher.final()]).toString('utf8');
};

const requiredValue = (name: string, value: string | undefined): string => {
  if (value) {
    return value;
  }
  throw new Error(`Missing ${name}. Set it in racesweet.properties or the environment.`);
};

export const createIracingAgentConfig = (
  properties: IracingAgentProperties,
  environment: NodeJS.ProcessEnv,
): IracingAgentConfig => {
  const configuredPassword: string = environment.RACESWEET_PASSWORD || decryptPassword(properties, environment);
  return {
    baseUrl: requiredValue('RACESWEET_URL', propertyOrEnvironment(properties, environment, 'url', 'RACESWEET_URL')),
    password: requiredValue('RACESWEET_PASSWORD', configuredPassword),
    pollIntervalMs: Number(environment.RACESWEET_POLL_INTERVAL_MS || properties.pollIntervalMs || 16),
    sessionId: requiredValue('RACESWEET_SESSION_ID', propertyOrEnvironment(properties, environment, 'sessionId', 'RACESWEET_SESSION_ID')),
    sourceId: requiredValue('RACESWEET_SOURCE_ID', propertyOrEnvironment(properties, environment, 'sourceId', 'RACESWEET_SOURCE_ID')),
    timingLines: JSON.parse(environment.RACESWEET_TIMING_LINES || properties.timingLines || '[{"id":"finish","kind":"finish","lapDistancePercent":0}]') as IracingTimingLine[],
    username: requiredValue('RACESWEET_USERNAME', propertyOrEnvironment(properties, environment, 'username', 'RACESWEET_USERNAME')),
  };
};

export const loadIracingAgentConfig = (
  propertiesPath: string,
  environment: NodeJS.ProcessEnv,
): IracingAgentConfig => {
  const properties: IracingAgentProperties = (() => {
    try {
      return Object.fromEntries(readFileSync(propertiesPath, 'utf8')
        .split(/\r?\n/gu)
        .filter((line: string): boolean => line.trim().length > 0 && !line.trim().startsWith('#'))
        .map((line: string): [string, string] => {
          const separator: number = line.indexOf('=');
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
        }));
    } catch {
      return {};
    }
  })();
  return createIracingAgentConfig(properties, environment);
};
