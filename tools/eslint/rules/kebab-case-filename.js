import path from 'node:path';

const KEBAB_CASE_FILENAME =
  /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.[a-z]+$/;

/**
 * ESLint rule that requires every linted file to have a kebab-case
 * filename. Dot-separated suffixes such as `.test.ts` and `.config.ts`
 * are allowed; uppercase letters and underscores are not.
 */
export const kebabCaseFilename = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require kebab-case filenames.',
    },
    schema: [],
    messages: {
      notKebabCase:
        'Filename "{{basename}}" is not kebab-case. Use lowercase words separated by hyphens.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const basename = path.basename(context.filename);
        if (!KEBAB_CASE_FILENAME.test(basename)) {
          context.report({
            node,
            messageId: 'notKebabCase',
            data: { basename },
          });
        }
      },
    };
  },
};
