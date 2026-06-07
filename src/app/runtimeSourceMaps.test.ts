import { enableRuntimeSourceMaps } from './runtimeSourceMaps.ts';

describe('enableRuntimeSourceMaps', () => {
  it('enables native source-map stack remapping', () => {
    const enableSourceMaps = vi.fn();

    enableRuntimeSourceMaps(enableSourceMaps);

    expect(enableSourceMaps).toHaveBeenCalledWith(true);
  });
});
