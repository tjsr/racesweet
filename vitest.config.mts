import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { failOnStderrReporter } from './src/testing/failOnStderrReporter';

const reactTransitionGroupContextPath = path.resolve('node_modules/react-transition-group/cjs/TransitionGroupContext.js');

export default defineConfig({
	resolve: {
		alias: {
			'react-transition-group/TransitionGroupContext': reactTransitionGroupContextPath,
		},
	},
	plugins: [
		{
			name: 'resolve-react-transition-group-context',
			resolveId: (source) => {
				return source === 'react-transition-group/TransitionGroupContext'
					? reactTransitionGroupContextPath
					: null;
			},
		},
	],
	ssr: {
		noExternal: ['@mui/material', 'react-transition-group'],
	},
	test: {
		// Setup
		setupFiles: ['./vitest.chdir.mts'],
		sequence: {
			setupFiles: 'list',
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

