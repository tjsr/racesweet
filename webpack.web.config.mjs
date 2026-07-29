import path from 'node:path';
import { createRequire } from 'node:module';
import webpack from 'webpack';

const require = createRequire(import.meta.url);
const resolveModule = (moduleName) => require.resolve(moduleName);
const childProcessShimPath = path.resolve('src', 'app', 'web', 'childProcessShim.ts');
const fileSystemShimPath = path.resolve('src', 'app', 'web', 'fileSystemShim.ts');

const config = {
  devtool: 'source-map',
  entry: './src/app/renderer.ts',
  mode: 'production',
  module: {
    rules: [
      {
        exclude: /(node_modules|\.webpack)/u,
        test: /\.tsx?$/u,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/u,
        use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
      },
      {
        test: /\.svg$/u,
        type: 'asset/resource',
      },
    ],
  },
  output: {
    clean: true,
    filename: 'app.[contenthash].js',
    path: path.resolve('dist', 'web'),
    publicPath: '/',
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(/^node:assert\/strict$/u, resolveModule('assert')),
    new webpack.NormalModuleReplacementPlugin(/^node:child_process$/u, childProcessShimPath),
    new webpack.NormalModuleReplacementPlugin(/^node:fs(?:\/promises)?$/u, fileSystemShimPath),
    new webpack.NormalModuleReplacementPlugin(/^node:os$/u, resolveModule('os-browserify/browser')),
    new webpack.NormalModuleReplacementPlugin(/^node:path$/u, resolveModule('path-browserify')),
    new webpack.NormalModuleReplacementPlugin(/^node:util$/u, resolveModule('util')),
    new webpack.NormalModuleReplacementPlugin(/^node:zlib$/u, resolveModule('browserify-zlib')),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: resolveModule('process/browser.js'),
    }),
    new webpack.DefinePlugin({
      RACESWEET_BUILD_TIMESTAMP: JSON.stringify(new Date().toISOString()),
    }),
  ],
  resolve: {
    alias: {
      electron: path.resolve('src', 'app', 'web', 'electronShim.ts'),
      'process/browser': resolveModule('process/browser.js'),
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
    extensionAlias: {
      '.js': ['.js', '.ts', '.tsx'],
      '.jsx': ['.jsx', '.tsx'],
    },
    fallback: {
      assert: 'assert',
      buffer: 'buffer',
      child_process: false,
      fs: false,
      os: 'os-browserify/browser',
      path: 'path-browserify',
      process: resolveModule('process/browser.js'),
      stream: resolveModule('stream-browserify'),
      util: 'util',
      zlib: 'browserify-zlib',
    },
  },
  target: 'web',
};

export default config;
