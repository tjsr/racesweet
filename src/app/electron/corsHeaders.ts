export const isApicalApiUrl = (url: string): boolean =>
  url.includes('apicalracetiming.com.au') || url.includes('apical-race-timing');

export const injectCorsHeaders = (
  responseHeaders: Record<string, string[]>
): Record<string, string[]> => ({
  ...responseHeaders,
  'Access-Control-Allow-Headers': ['Authorization, Content-Type, Accept'],
  'Access-Control-Allow-Methods': ['GET, POST, OPTIONS'],
  'Access-Control-Allow-Origin': ['*'],
});
