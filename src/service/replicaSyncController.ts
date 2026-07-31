import { ReplicaSyncService } from './replicaSyncService.js';

export class ReplicaSyncController {
  private readonly intervalMs: number;
  private readonly syncService: ReplicaSyncService;
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(syncService: ReplicaSyncService, intervalMs: number = 5000) {
    this.syncService = syncService;
    this.intervalMs = intervalMs;
  }

  public async start(): Promise<void> {
    await this.syncService.initialize();
    await this.syncNow();
    this.timer = setInterval((): void => { void this.syncNow(); }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public async syncNow(): Promise<void> {
    try {
      await this.syncService.sync();
    } catch {
      // ReplicaSyncService records the failure in SyncStore; the next interval retries it.
    }
  }
}
