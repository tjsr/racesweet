# Test requirements

## Vitest usage

Tests should never include imports from vitest - we should expect them to be defined as a global lib in our tsconfig. If you need to import vitest functions, add them to the global setup in vitest.config.mts.

## Additional requirements for tests

Stop tests sharing app persistence paths:

* Persistence tests should use unique fake paths per test or mocked window.api, and clean window.api afterward.
* App integration tests should never read/write real src/generated/* unless explicitly testing persistence.

Make each jsdom test own its globals:

* Set window.api, window.versions, fetch, matchMedia, etc. in beforeEach.
* Delete or restore them in afterEach.
