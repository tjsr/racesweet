export const allowedDownloadSites = [
  'https://apicalracetiming.com.au',
  'https://*.apicalracetiming.com.au',
  'https://*.apical-race-timing.example.com',
];

export const isAllowedDownloadSite = (
  requestUrl: string,
  allowedSites: string[] = allowedDownloadSites
): boolean => {
  let parsedRequestUrl: URL;
  try {
    parsedRequestUrl = new URL(requestUrl);
  } catch (_error: unknown) {
    return false;
  }

  return allowedSites.some((site) => {
    let parsedSite: URL;
    try {
      parsedSite = new URL(site.replace('*.', 'wildcard-placeholder.'));
    } catch (_error: unknown) {
      return false;
    }

    if (parsedRequestUrl.protocol !== parsedSite.protocol) {
      return false;
    }

    const siteHost = parsedSite.hostname.replace(/^wildcard-placeholder\./, '');
    if (site.includes('*.')) {
      return parsedRequestUrl.hostname.endsWith(`.${siteHost}`);
    }

    return parsedRequestUrl.hostname === siteHost;
  });
};
