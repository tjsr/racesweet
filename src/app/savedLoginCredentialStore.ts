import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { safeStorage } from "electron";
import type { LoginRequest } from "../model/serverApi.js";

const SAVED_LOGIN_CREDENTIALS_FILENAME: string = "saved-login-credentials.bin";

const isLoginRequest = (value: unknown): value is LoginRequest =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as LoginRequest).password === "string" &&
  typeof (value as LoginRequest).username === "string";

const credentialFilePath = (userDataPath: string): string =>
  path.join(userDataPath, SAVED_LOGIN_CREDENTIALS_FILENAME);

export const loadNativeSavedLoginCredentials = async (
  userDataPath: string,
): Promise<LoginRequest | undefined> => {
  try {
    const encryptedCredentials: Buffer = await readFile(
      credentialFilePath(userDataPath),
    );
    const serializedCredentials: string =
      safeStorage.decryptString(encryptedCredentials);
    const credentials: unknown = JSON.parse(serializedCredentials);
    return isLoginRequest(credentials) ? credentials : undefined;
  } catch {
    return undefined;
  }
};

export const saveNativeLoginCredentials = async (
  userDataPath: string,
  credentials: LoginRequest,
): Promise<void> => {
  const encryptedCredentials: Buffer = safeStorage.encryptString(
    JSON.stringify(credentials),
  );
  await writeFile(credentialFilePath(userDataPath), encryptedCredentials);
};

export const clearNativeSavedLoginCredentials = async (
  userDataPath: string,
): Promise<void> => {
  try {
    await unlink(credentialFilePath(userDataPath));
  } catch (error: unknown) {
    const nodeError: NodeJS.ErrnoException = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") {
      throw error;
    }
  }
};
