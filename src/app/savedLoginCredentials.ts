import type { LoginRequest } from '../model/serverApi.js';

const SAVED_LOGIN_CREDENTIALS_KEY: string = 'racesweet.saved-login-credentials';

const isLoginRequest = (value: unknown): value is LoginRequest =>
  typeof value === 'object' && value !== null &&
  typeof (value as LoginRequest).password === 'string' &&
  typeof (value as LoginRequest).username === 'string';

export const loadSavedLoginCredentials = (): LoginRequest | undefined => {
  try {
    const serializedCredentials: string | null = globalThis.localStorage.getItem(
      SAVED_LOGIN_CREDENTIALS_KEY,
    );
    if (!serializedCredentials) {
      return undefined;
    }
    const credentials: unknown = JSON.parse(serializedCredentials);
    return isLoginRequest(credentials) ? credentials : undefined;
  } catch {
    return undefined;
  }
};

export const saveLoginCredentials = (credentials: LoginRequest): void => {
  globalThis.localStorage.setItem(SAVED_LOGIN_CREDENTIALS_KEY, JSON.stringify(credentials));
};

export const clearSavedLoginCredentials = (): void => {
  globalThis.localStorage.removeItem(SAVED_LOGIN_CREDENTIALS_KEY);
};
