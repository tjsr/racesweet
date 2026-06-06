import { allowedFetchUrls, buildContentSecurityPolicy, injectContentSecurityPolicyHeader } from './contentSecurityPolicy.js';
import { describe, expect, it } from 'vitest';

describe('buildContentSecurityPolicy', () => {
  it('allows fetches to Apical by default', () => {
    const policy = buildContentSecurityPolicy();

    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain('https://apicalracetiming.com.au');
    expect(policy).toContain('https://*.apicalracetiming.com.au');
  });

  it('includes URLs added to the configurable fetch allow-list', () => {
    const policy = buildContentSecurityPolicy([...allowedFetchUrls, 'https://api.example.com']);

    expect(policy).toContain('https://api.example.com');
  });

  it('injects the configured policy into document response headers', () => {
    const result = injectContentSecurityPolicyHeader({ 'Content-Type': ['text/html'] }, "default-src 'self'");

    expect(result['Content-Security-Policy']).toEqual(["default-src 'self'"]);
    expect(result['Content-Type']).toEqual(['text/html']);
  });
});
