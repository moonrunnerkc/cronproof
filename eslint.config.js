import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { cronproofPlugin } from './tools/eslint/index.js';

/*
 * ESLint flat config files are consumed by ESLint itself, which
 * requires a default export. This file and the tool config files
 * below carry the only allowed default exports in the repo; the
 * exemption is scoped explicitly in the overrides block.
 */

const repoRules = {
  'max-lines': [
    'error',
    { max: 300, skipBlankLines: false, skipComments: false },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  'cronproof/no-default-export': 'error',
  'cronproof/kebab-case-filename': 'error',
  'cronproof/no-em-dash': 'error',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test/differential/**',
      'tests/scan/fixture/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    plugins: {
      cronproof: cronproofPlugin,
    },
    rules: repoRules,
  },
  {
    files: ['eslint.config.js', '*.config.ts', '*.config.js'],
    rules: {
      'cronproof/no-default-export': 'off',
    },
  },
);
