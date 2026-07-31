import { describe, expect, it, vi } from 'vitest';
import { ReplicaSyncController } from './replicaSyncController.js';

describe('ReplicaSyncController', () => {
  it('initializes and reconciles immediately, without failing startup when the host is unavailable', async () => {
    const service = { initialize: vi.fn(async (): Promise<void> => undefined), sync: vi.fn(async (): Promise<void> => { throw new Error('offline'); }) };
    const controller = new ReplicaSyncController(service as never, 60000);

    await expect(controller.start()).resolves.toBeUndefined();
    expect(service.initialize).toHaveBeenCalledOnce();
    expect(service.sync).toHaveBeenCalledOnce();
    controller.stop();
  });
});
