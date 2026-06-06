export const allowedFetchUrls = [
  'https://apicalracetiming.com.au',
  'https://*.apicalracetiming.com.au',
];

export const buildContentSecurityPolicy = (connectSources: string[] = allowedFetchUrls): string => {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${connectSources.join(' ')}`,
  ];

  return directives.join('; ');
};

export const injectContentSecurityPolicyHeader = (
  responseHeaders: Record<string, string[]>,
  policy: string = buildContentSecurityPolicy()
): Record<string, string[]> => ({
  ...responseHeaders,
  'Content-Security-Policy': [policy],
});
