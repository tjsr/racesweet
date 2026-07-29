const unavailable = async (): Promise<never> => {
  throw new Error('Electron APIs are unavailable in a web browser.');
};

export const session = {
  defaultSession: {
    cookies: {
      get: unavailable,
    },
    fetch: unavailable,
  },
};
