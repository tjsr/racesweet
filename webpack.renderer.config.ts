import webpack, { type Configuration } from 'webpack';
import { plugins } from './webpack.plugins.ts';
import { rules } from './webpack.rules.ts';

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

export const rendererConfig: Configuration = {
  devtool: 'source-map',
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new webpack.DefinePlugin({
      RACESWEET_BUILD_TIMESTAMP: JSON.stringify(new Date().toISOString()),
    }),
  ],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
    extensionAlias: {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    }
  },
};
