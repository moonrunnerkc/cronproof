import { kebabCaseFilename } from './rules/kebab-case-filename.js';
import { noDefaultExport } from './rules/no-default-export.js';
import { noEmDash } from './rules/no-em-dash.js';
import { noModuleLoadSideEffects } from './rules/no-module-load-side-effects.js';

/**
 * Local ESLint plugin enforcing this repo's CLAUDE.md code standards
 * that have no built-in ESLint equivalent.
 */
export const cronproofPlugin = {
  meta: {
    name: 'cronproof',
    version: '0.1.0',
  },
  rules: {
    'no-default-export': noDefaultExport,
    'kebab-case-filename': kebabCaseFilename,
    'no-em-dash': noEmDash,
    'no-module-load-side-effects': noModuleLoadSideEffects,
  },
};
