import { generateDisplayToken, hashDisplayToken, validateDisplayLayout, type DisplayComponent } from './displayScreen.js';

const title: DisplayComponent = {
  height: 2, id: 'title', settings: { showSession: true }, type: 'event-title',
  width: 12, x: 0, y: 0, zIndex: 0,
};

describe('display screen layout and tokens', () => {
  it('validates grid bounds, overlaps, and typed settings', () => {
    expect(() => validateDisplayLayout([title], false)).not.toThrow();
    expect(() => validateDisplayLayout([], false)).toThrow(/1 to 100/);
    expect(() => validateDisplayLayout([{ ...title, x: 1 }])).toThrow(/12-column/);
    expect(() => validateDisplayLayout([title, { ...title, id: 'other' }])).toThrow(/overlap/);
    expect(() => validateDisplayLayout([title, { ...title, id: 'layer', layered: true }])).not.toThrow();
    expect(() => validateDisplayLayout([{ ...title, type: 'text-panel', settings: { text: '<script>hello</script>' } }])).toThrow(/Invalid settings/);
    expect(() => validateDisplayLayout([{
      ...title, type: 'sponsor-image', settings: { alt: 'Sponsor', mediaDataUrl: 'https://evil.example/image.png' },
    }])).toThrow(/Invalid settings/);
  });

  it('creates high entropy opaque tokens and stable hashes', async () => {
    const first: string = generateDisplayToken();
    const second: string = generateDisplayToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(first).not.toBe(second);
    expect(await hashDisplayToken(first)).toMatch(/^[a-f0-9]{64}$/u);
    expect(await hashDisplayToken(first)).toBe(await hashDisplayToken(first));
    expect(await hashDisplayToken(first)).not.toBe(await hashDisplayToken(second));
  });
});
