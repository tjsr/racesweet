import tjsrEslintConfig from '@tjsr/eslint-config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
{
  ignores: ['dist'],
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
});
