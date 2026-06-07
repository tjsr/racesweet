import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Setup
		setupFiles: ['./vitest.chdir.mts'],
		clearMocks: true,
		globals: true,
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		exclude: [ 'node_modules', '.git', '**/*.git' ],
		environment: 'node', // Use 'jsdom' if you're testing browser-based code,
		threads: false, // Disable threads for debugging
		restoreMocks: true,
		unstubGlobals: true,
		coverage: {
			provider: 'istanbul',
			reporter: ['text', 'lcov'],
			include: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
			exclude: ['src/**/*.test.{ts,tsx}', 'src/**/index.{ts,tsx}'],
		},
  }
}
);

