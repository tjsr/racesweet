import type { Configuration } from 'webpack';
import { plugins } from './webpack.plugins.ts';
import { rules } from './webpack.rules.ts';

export const mainConfig: Configuration = {
  mode: 'development',
  devtool: 'source-map',
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/app/index.ts',
  // entry: './index.mjs',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    extensionAlias: {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    },
  },
};
