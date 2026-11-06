import { describe, expect, it } from "vitest";

import { createTimingSpeechAdapter } from "./manualTimingSpeech.js";

describe("manual timing speech adapter", (): void => {
  it("reports unsupported recognition without preventing text entry", async (): Promise<void> => {
    const adapter = createTimingSpeechAdapter({});
    expect(adapter.available).toBe(false);
    await expect(adapter.listen()).rejects.toThrow(/keyboard or keypad/);
    adapter.stop();
  });
  it("returns only final speech and reports denied microphone permission", async (): Promise<void> => {
    let denied: boolean = false;
    class Recognition {
      public continuous: boolean = false;
      public interimResults: boolean = false;
      public onerror: ((event: { error: string }) => void) | null = null;
      public onresult:
        | ((event: {
            results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
          }) => void)
        | null = null;
      public onend: (() => void) | null = null;
      public start = (): void => {
        if (denied) this.onerror?.({ error: "not-allowed" });
        else
          this.onresult?.({
            results: [
              { isFinal: false, 0: { transcript: "partial" } },
              { isFinal: true, 0: { transcript: "one two three" } },
            ],
          });
      };
      public stop = (): void => undefined;
    }
    const adapter = createTimingSpeechAdapter({
      SpeechRecognition: Recognition,
    });
    await expect(adapter.listen()).resolves.toBe("one two three");
    denied = true;
    await expect(adapter.listen()).rejects.toThrow(/not-allowed/);
    adapter.stop();
  });
});
