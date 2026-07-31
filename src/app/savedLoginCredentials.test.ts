// @vitest-environment jsdom

import {
  clearSavedLoginCredentials,
  loadSavedLoginCredentials,
  saveLoginCredentials,
} from './savedLoginCredentials.js';

describe('saved login credentials', () => {
  beforeEach((): void => {
    localStorage.clear();
  });

  it('loads credentials saved for a future sign-in', () => {
    saveLoginCredentials({ password: 'correct horse battery staple', username: 'admin' });

    expect(loadSavedLoginCredentials()).toEqual({
      password: 'correct horse battery staple',
      username: 'admin',
    });
  });

  it('does not load malformed saved values', () => {
    localStorage.setItem('racesweet.saved-login-credentials', '{invalid');

    expect(loadSavedLoginCredentials()).toBeUndefined();
  });

  it('clears saved credentials', () => {
    saveLoginCredentials({ password: 'correct horse battery staple', username: 'admin' });

    clearSavedLoginCredentials();

    expect(loadSavedLoginCredentials()).toBeUndefined();
  });
});
