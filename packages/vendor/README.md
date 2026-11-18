# Dependency compatibility forks

These runtime sources retain their upstream licences. Archive versions, URLs,
SHA-1 checksums and SHA-512 integrity values are recorded in `provenance.json`.
Retrieve those archives to review the original sources and documentation.
Provenance describes source origin; compatibility tests exercise behavior.

The forks remove deprecated dependency APIs while preserving packaging features:

- `asset-relocator`: uses Glob 12's promise API for shared-library discovery,
  current MagicString, and the maintained J Ridgewell source-map codec.
- `electron-installer-common`: uses Glob 12's promise API for application
  metadata discovery and installer output discovery.
- `temp`: uses Node filesystem creation/removal APIs, preserving recursive
  cleanup, retry handling, permissions, and callback/promise/synchronous APIs.

Upstream development/release scripts and their development dependencies are
omitted. RaceSweet owns the replacement compatibility tests. Upstream runtime
source and licence notices remain; upstream README/changelog files are available
in the recorded archives. The minimum runtime matches RaceSweet's engine floor.

The separate `native-domexception` package exports Node's native constructor for
CommonJS consumers. It replaces the deprecated shim with the complete platform
API rather than an imitation. SockJS uses the CommonJS-compatible UUID 11 API;
the iRacing native binding uses Node-Gyp 12 for its supported Node runtimes.

Forge's pre-make hook explicitly prepares Squirrel's bundled host-architecture
7-Zip files. Installer generation therefore does not depend on an npm install
hook running. Tests cover x64 and arm64 host selection and temporary-file cleanup.

Track removal of these forks when upstream adopts maintained dependencies in
[issue 30](https://github.com/tjsr/racesweet/issues/30). CI detection and future
remediation PR automation are tracked in
[issue 31](https://github.com/tjsr/racesweet/issues/31).
