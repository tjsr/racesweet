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
  files: ["src/**/*.ts"],
  languageOptions: {
    globals:{
      es2021: true,
      node: true,
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
