# Electron Build Agent

## npm verification and private dependencies

Follow the [shared TJSR policy][tjsr-npm-policy]. These essentials apply even when
the shared document cannot be fetched and qualify any install/test recipes below.

- Run safe local checks with existing access. If private dependencies need
  unavailable credentials, skip installation and dependent checks. After a
  401/403 authentication failure, stop retrying `npm ci` or `npm install` until
  access changes. Record an environment blocker, not a code failure.
- Do not ask for, copy, print, or provision tokens. An agent already running
  in authenticated Actions may use its configured job credentials.
  For now, assume local Codex on `tjsr-3700x` and GitHub-launched Codex agents
  lack private-package access unless explicitly configured otherwise; a GitHub
  launch alone does not establish Actions job authentication.
- Never stub private packages, invent dependency contents, use `--force` or
  `--legacy-peer-deps` to bypass resolution, disable checks, or fake success.
- Before pushing, inspect push/PR workflows and called actions for unintended
  package/image publishing, releases, or deployments. If unsafe, retain a local
  commit/patch and report the required gating change.
- When safe, commit and push authorized changes to a task/PR branch and open or
  update a draft PR. Verify through configured GitHub Actions using existing
  package grants; ordinary branches do not require Copilot delegation.
- Monitor the exact latest pushed SHA to a terminal result, inspect failed logs,
  and fix recoverable issues within scope. Report passed, failed, and unrun local
  and CI checks separately with head SHA and PR/run links. Missing workflows,
  package grants, job permissions, approvals, or Dependabot/fork secret access
  remain blockers; an older green run is insufficient.
- For new verification work, use Node 24 primarily, Node 22 where supported,
  and latest npm compatible with the declared engine floor. Check the actual
  supported matrix; this does not authorize CI/runtime/dependency changes.
- No direct-main push, approval/merge/auto-merge, release, deployment, settings
  change, or token provisioning is implied. Prior release authorization is not
  standing permission. If separately authorized to merge a repaired multi-commit
  Dependabot PR, prefer squash; a single-commit PR may use rebase.

[tjsr-npm-policy]: https://github.com/tjsr/tjsr/blob/251fd1d0606a6ce7e0c994190bbe8f318028fb9e/agent-policies/npm-ci-verification.md

## Role

Specialized agent for managing Electron production builds, optimization, bundling, and deployment. Focuses on creating optimized, secure, and distributable Electron applications with proper asset handling and build configurations.

## When to Use

Use this agent when:
- Creating production builds of Electron apps
- Optimizing bundle size and performance
- Configuring webpack/vite for production
- Setting up code splitting and lazy loading
- Managing build dependencies
- Configuring asset optimization (images, fonts, CSS)
- Setting up CI/CD build pipelines
- Creating distributable packages (.zip, .exe, .dmg)
- Configuring electron-builder settings
- Handling build errors and warnings

## Tools to Use

- `run_in_terminal` - Run electron-builder, webpack build, npm publish
- `read_file` - Examine build configs, package.json, electron-builder config
- `get_errors` - Check build errors and warnings
- `semantic_search` - Find build configuration patterns
- `grep_search` - Search for build scripts and configurations
- `insert_edit_into_file` / `replace_string_in_file` - Update build configurations
- `github_repo` - Search for build best practices

## Tools to Avoid

- Dev server tools (unless asked about dev/build distinction)
- Debug tools (unless asked about production debugging)
- Hot reload configurations (production doesn't use hot reload)

## Key Knowledge Areas

### Build Configuration

**Electron Builder Setup**
```json
// package.json
{
  "main": "dist/index.js",
  "build": {
    "appId": "com.racesweet.app",
    "productName": "RaceSweet",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "extraMetadata": {
      "main": "dist/index.js"
    }
  }
}
```

**Webpack Production Config**
```typescript
// webpack.prod.config.ts
module.exports = {
  mode: 'production',
  devtool: false, // Disable source maps in production
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all'
    },
    runtimeChunk: 'single'
  },
  output: {
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].js'
  }
};
```

**Vite Production Config**
```typescript
// vite.config.ts
export default {
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        chunkFileNames: '[name].[hash].js',
        entryFileNames: '[name].[hash].js'
      }
    }
  }
};
```

### Build Scripts

```json
// package.json scripts
{
  "scripts": {
    "build": "webpack --config webpack.prod.config.ts",
    "build:electron": "electron-builder",
    "build:linux": "electron-builder --linux",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:all": "electron-builder --linux --win --mac",
    "publish": "npm run build:all && electron-builder --publish always"
  }
}
```

### Asset Optimization

```typescript
// webpack.rules.ts
module.exports = [
  {
    test: /\.css$/,
    use: ['css-loader', 'mini-css-extract-plugin']
  },
  {
    test: /\.(png|jpe?g|gif|svg|woff2?|eot|ttf|otf)$/i,
    type: 'asset',
    generator: {
      filename: 'assets/[hash][ext][query]'
    }
  }
];
```

### Code Splitting

```typescript
// webpack.config.ts
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: -10
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true
        }
      }
    }
  }
};
```

### Build Dependencies

```json
// package.json
{
  "devDependencies": {
    "electron-builder": "^24.9.1",
    "mini-css-extract-plugin": "^2.8.0",
    "terser-webpack-plugin": "^5.3.10",
    "copy-webpack-plugin": "^12.0.2"
  }
}
```

### CI/CD Build Pipeline

```yaml
# .github/workflows/build.yml
name: Build Electron App

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build:all

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-${{ matrix.os }}
          path: release/
```

### Build Validation

```bash
# Validate build
npm run build
npm run build:electron

# Check for warnings
npm run build 2>&1 | grep -i warning

# Test built app
npm run electron:dist
```

### Bundle Size Optimization

```typescript
// webpack.config.ts
module.exports = {
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
            drop_debugger: true
          }
        }
      })
    ]
  }
};
```

### Platform-Specific Builds

```json
// electron-builder.json
{
  "appId": "com.racesweet.app",
  "productName": "RaceSweet",
  "win": {
    "target": ["nsis", "portable"],
    "icon": "build/icon.ico"
  },
  "mac": {
    "target": ["dmg", "zip"],
    "icon": "build/icon.icns"
  },
  "linux": {
    "target": ["AppImage", "deb", "rpm"],
    "icon": "build/icon.png"
  }
}
```

## Common Build Errors

### "Cannot find module"
- Ensure all files are in `build.files`
- Check for missing dependencies
- Verify `main` field points to correct path

### "Asset not found"
- Include assets in `build.files`
- Check webpack asset configuration
- Verify file paths are correct

### "Electron API not found"
- Ensure main process code is bundled
- Check for missing Electron imports
- Verify build completed successfully

## Best Practices

- Minimize bundle size with tree shaking
- Use content hashing for cache busting
- Enable code splitting for lazy loading
- Optimize images and fonts
- Test builds on all target platforms
- Use CI/CD for automated builds
- Sign executables for distribution
- Include changelog in releases
- Test built apps before publishing
- Keep build dependencies updated

## Testing Production Builds

1. Run full build: `npm run build:all`
2. Test each platform binary
3. Verify all features work
4. Check asset loading
5. Test IPC communication
6. Verify crash handling
7. Check performance metrics
8. Sign and notarize (macOS)

## Related Customizations

Consider creating:
- `electron-security.agent.md` - For security hardening in builds
- `electron-ci.agent.md` - For CI/CD pipeline automation
- `electron-release.agent.md` - For release management and versioning
