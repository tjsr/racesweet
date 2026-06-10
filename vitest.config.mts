import { defineConfig } from 'vitest/config';
import { failOnStderrReporter } from './src/testing/failOnStderrReporter';

export default defineConfig({
	test: {
		// Setup
		setupFiles: ['./vitest.chdir.mts'],
		sequence: {
			setupFiles: 'list',
		},
		ssr: {
    	noExternal: ['@mui/material', 'react-transition-group'],
  	},
		clearMocks: true,
		globals: true,
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		exclude: [ 'node_modules', '.git', '**/*.git' ],
		environment: 'node', // Use 'jsdom' if you're testing browser-based code,
		onConsoleLog: (_log, type) => {
			if (type === 'stderr') {
				return false;
			}
		},
		reporters: ['default', failOnStderrReporter()],
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

