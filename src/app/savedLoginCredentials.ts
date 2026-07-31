import type { LoginRequest } from "../model/serverApi.js";

const SAVED_LOGIN_CREDENTIALS_KEY: string = "racesweet.saved-login-credentials";

const isLoginRequest = (value: unknown): value is LoginRequest =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as LoginRequest).password === "string" &&
  typeof (value as LoginRequest).username === "string";

const isNativePersistenceAvailable = (): boolean =>
  typeof window !== "undefined" &&
  window.api?.savedLoginCredentialsMode === "native";

export const loadSavedLoginCredentials = async (): Promise<
  LoginRequest | undefined
> => {
  if (isNativePersistenceAvailable()) {
    return window.api.loadSavedLoginCredentials();
  }
  try {
    const serializedCredentials: string | null =
      globalThis.localStorage.getItem(SAVED_LOGIN_CREDENTIALS_KEY);
    if (!serializedCredentials) {
      return undefined;
    }
    const credentials: unknown = JSON.parse(serializedCredentials);
    return isLoginRequest(credentials) ? credentials : undefined;
  } catch {
    return undefined;
  }
};

export const saveLoginCredentials = async (
  credentials: LoginRequest,
): Promise<void> => {
  if (isNativePersistenceAvailable()) {
    return window.api.saveLoginCredentials(credentials);
  }
  globalThis.localStorage.setItem(
    SAVED_LOGIN_CREDENTIALS_KEY,
    JSON.stringify(credentials),
  );
};

export const clearSavedLoginCredentials = async (): Promise<void> => {
  if (isNativePersistenceAvailable()) {
    return window.api.clearSavedLoginCredentials();
  }
  globalThis.localStorage.removeItem(SAVED_LOGIN_CREDENTIALS_KEY);
};
