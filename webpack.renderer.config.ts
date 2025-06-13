import type { Configuration } from 'webpack';
import { plugins } from './webpack.plugins.ts';
import { rules } from './webpack.rules.ts';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
    extensionAlias: {
      '.js': ['.js', '.ts'],
      '.jsx': ['.jsx', '.tsx'],
    }
  },
};
