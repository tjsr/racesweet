import { allowedDownloadSites, isAllowedDownloadSite } from './allowedDownloadSites.js';

describe('allowedDownloadSites', () => {
  it('keeps Apical in the central download allow-list', () => {
    expect(allowedDownloadSites).toContain('https://apicalracetiming.com.au');
    expect(allowedDownloadSites).toContain('https://*.apicalracetiming.com.au');
  });

  it('matches exact allowed origins', () => {
    expect(isAllowedDownloadSite('https://apicalracetiming.com.au/Download/DownloadExcel?fileGuid=abc')).toBe(true);
  });

  it('matches wildcard subdomains without matching unrelated suffixes', () => {
    expect(isAllowedDownloadSite('https://files.apicalracetiming.com.au/download')).toBe(true);
    expect(isAllowedDownloadSite('https://apicalracetiming.com.au.evil.example/download')).toBe(false);
  });

  it('requires the configured scheme', () => {
    expect(isAllowedDownloadSite('http://apicalracetiming.com.au/download')).toBe(false);
  });
});
