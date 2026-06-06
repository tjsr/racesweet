import { beforeAll, describe, expect, it } from 'vitest';

import path from 'node:path';
import { readFile } from 'node:fs/promises';

describe('HTML template (src/app/index.html)', () => {
  let html: string;

  beforeAll(async () => {
    html = await readFile(path.join(process.cwd(), 'src', 'app', 'index.html'), 'utf-8');
  });

  it('has a valid DOCTYPE declaration', () => {
    expect(html).toMatch(/<!DOCTYPE html>/i);
  });

  it('has <html>, <head>, and <body> elements', () => {
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
  });

  it('contains an element with id="app" for React mounting', () => {
    expect(html).toContain('id="app"');
  });

  it('does not contain stale script references to ./build/ paths that would 404', () => {
    expect(html).not.toContain('./build/');
  });

  it('does not define a static CSP that would override the configured policy header', () => {
    expect(html).not.toContain('Content-Security-Policy');
  });
});
