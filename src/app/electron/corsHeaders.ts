import { isAllowedDownloadSite } from '../allowedDownloadSites.js';

export const isAllowedCorsDownloadUrl = isAllowedDownloadSite;

export const injectCorsHeaders = (
  responseHeaders: Record<string, string[]>
): Record<string, string[]> => ({
  ...responseHeaders,
  'Access-Control-Allow-Headers': ['Authorization, Content-Type, Accept, X-Requested-With'],
  'Access-Control-Allow-Methods': ['GET, POST, OPTIONS'],
  'Access-Control-Allow-Origin': ['*'],
});
