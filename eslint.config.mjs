import tjsrEslintConfig from '@tjsr/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
{
  ignores: ['.webpack', 'dist'],
},
{
  extends: [
    ...tjsrEslintConfig,
  ],
  files: ["src/**/*.ts:", "src/**/*.tsx"],
  languageOptions: {
    globals:{
      es2021: true,
      node: true,
    },
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: "module"
    },
  },
},
{
  files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  languageOptions: {
    globals: {
      beforeAll: 'readonly',
      beforeEach: 'readonly',
      afterAll: 'readonly',
      afterEach: 'readonly',
      describe: 'readonly',
      expect: 'readonly',
      it: 'readonly',
      test: 'readonly',
      vi: 'readonly',
    },
  },
});
