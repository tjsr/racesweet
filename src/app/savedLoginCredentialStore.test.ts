import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { safeStorage } from "electron";
import {
  clearNativeSavedLoginCredentials,
  loadNativeSavedLoginCredentials,
  saveNativeLoginCredentials,
} from "./savedLoginCredentialStore.js";

vi.mock("electron", () => ({
  safeStorage: {
    decryptString: vi.fn((encrypted: Buffer): string =>
      Buffer.from(encrypted.toString("utf8"), "base64").toString("utf8"),
    ),
    encryptString: vi.fn((value: string): Buffer =>
      Buffer.from(Buffer.from(value).toString("base64")),
    ),
  },
}));

describe("native saved login credential store", () => {
  let userDataPath: string;

  beforeEach(async (): Promise<void> => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), "racesweet-login-"));
  });

  afterEach(async (): Promise<void> => {
    await rm(userDataPath, { force: true, recursive: true });
  });

  it("persists encrypted credentials for a later application launch", async () => {
    await saveNativeLoginCredentials(userDataPath, {
      password: "correct horse battery staple",
      username: "admin",
    });

    const persisted: Buffer = await readFile(
      path.join(userDataPath, "saved-login-credentials.bin"),
    );
    expect(persisted.toString("utf8")).not.toContain(
      "correct horse battery staple",
    );
    await expect(
      loadNativeSavedLoginCredentials(userDataPath),
    ).resolves.toEqual({
      password: "correct horse battery staple",
      username: "admin",
    });
    expect(safeStorage.encryptString).toHaveBeenCalledOnce();
  });

  it("removes stored credentials", async () => {
    await saveNativeLoginCredentials(userDataPath, {
      password: "correct horse battery staple",
      username: "admin",
    });

    await clearNativeSavedLoginCredentials(userDataPath);

    await expect(
      loadNativeSavedLoginCredentials(userDataPath),
    ).resolves.toBeUndefined();
  });
});
