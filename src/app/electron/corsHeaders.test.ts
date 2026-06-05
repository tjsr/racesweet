import { describe, expect, it } from 'vitest';
import { injectCorsHeaders, isApicalApiUrl } from './corsHeaders.js';

describe('isApicalApiUrl', () => {
  it('matches apicalracetiming.com.au URLs', () => {
    expect(isApicalApiUrl('https://apicalracetiming.com.au/raceresult/event/getall')).toBe(true);
  });

  it('matches apicalracetiming.com.au auth URL', () => {
    expect(isApicalApiUrl('https://apicalracetiming.com.au/')).toBe(true);
  });

  it('matches apical-race-timing URLs', () => {
    expect(isApicalApiUrl('https://api.apical-race-timing.example.com/raceresult/event/getall')).toBe(true);
  });

  it('does not match unrelated URLs', () => {
    expect(isApicalApiUrl('https://example.com/api/data')).toBe(false);
  });

  it('does not match localhost', () => {
    expect(isApicalApiUrl('http://localhost:3001/api')).toBe(false);
  });
});

describe('injectCorsHeaders', () => {
  it('adds Access-Control-Allow-Origin wildcard to empty headers', () => {
    const result = injectCorsHeaders({});
    expect(result['Access-Control-Allow-Origin']).toEqual(['*']);
  });

  it('adds Access-Control-Allow-Methods header', () => {
    const result = injectCorsHeaders({});
    expect(result['Access-Control-Allow-Methods']).toEqual(['GET, POST, OPTIONS']);
  });

  it('adds Access-Control-Allow-Headers for auth and content-type', () => {
    const result = injectCorsHeaders({});
    expect(result['Access-Control-Allow-Headers']).toEqual(['Authorization, Content-Type, Accept']);
  });

  it('preserves existing response headers', () => {
    const existing = { 'Content-Type': ['application/json'], 'X-Custom': ['value'] };
    const result = injectCorsHeaders(existing);
    expect(result['Content-Type']).toEqual(['application/json']);
    expect(result['X-Custom']).toEqual(['value']);
  });

  it('overwrites any existing CORS headers', () => {
    const existing = { 'Access-Control-Allow-Origin': ['https://old-origin.com'] };
    const result = injectCorsHeaders(existing);
    expect(result['Access-Control-Allow-Origin']).toEqual(['*']);
  });
});
