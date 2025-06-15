import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Setup
    setupFiles: ["./vitest.chdir.mts", /* anything */],
		globals: true,
		include: ['src/**/*.test.ts'],
		exclude: [ 'node_modules', '.git', '**/*.git' ],
		environment: 'node', // Use 'jsdom' if you're testing browser-based code,
		// threads: false, // Disable threads for debugging
  }
}
);

