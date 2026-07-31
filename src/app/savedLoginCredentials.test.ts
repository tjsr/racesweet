// @vitest-environment jsdom

import {
  clearSavedLoginCredentials,
  loadSavedLoginCredentials,
  saveLoginCredentials,
} from "./savedLoginCredentials.js";

describe("saved login credentials", () => {
  beforeEach((): void => {
    localStorage.clear();
  });

  it("loads credentials saved for a future sign-in", async () => {
    await saveLoginCredentials({
      password: "correct horse battery staple",
      username: "admin",
    });

    await expect(loadSavedLoginCredentials()).resolves.toEqual({
      password: "correct horse battery staple",
      username: "admin",
    });
  });

  it("does not load malformed saved values", async () => {
    localStorage.setItem("racesweet.saved-login-credentials", "{invalid");

    await expect(loadSavedLoginCredentials()).resolves.toBeUndefined();
  });

  it("clears saved credentials", async () => {
    await saveLoginCredentials({
      password: "correct horse battery staple",
      username: "admin",
    });

    await clearSavedLoginCredentials();

    await expect(loadSavedLoginCredentials()).resolves.toBeUndefined();
  });
});
