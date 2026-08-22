import path from 'node:path';
import { createIracingAgentApi } from './iracingAgentApiClient.js';
import { loadIracingAgentConfig } from './iracingAgentConfig.js';
import { runIracingAgent } from './iracingAgent.js';

const defaultPropertiesPath: string = path.resolve(path.dirname(process.argv[1] || ''), '..', '..', 'racesweet.properties');
const propertiesPath: string = process.env.RACESWEET_PROPERTIES_PATH || defaultPropertiesPath;
const config = loadIracingAgentConfig(propertiesPath, process.env);

const controller: AbortController = new AbortController();
process.once('SIGINT', (): void => controller.abort());
process.once('SIGTERM', (): void => controller.abort());

void runIracingAgent(config, createIracingAgentApi(config.baseUrl), undefined, controller.signal)
  .catch((error: unknown): void => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
