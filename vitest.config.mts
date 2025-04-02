import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Setup
    setupFiles: ["./vitest.chdir.mts", /* anything */],
		globals: true,
		include: ['src/**/*.test.ts'],
  }
}
);

