const EM_DASH = String.fromCharCode(0x2014);

/**
 * ESLint rule that bans the em dash character anywhere in a source
 * file, including comments and string literals, per this repo's
 * writing standard.
 */
export const noEmDash = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban em dash characters anywhere in source files.',
    },
    schema: [],
    messages: {
      noEmDash: 'Em dash characters are banned anywhere in this repo.',
    },
  },
  create(context) {
    return {
      Program() {
        const sourceCode = context.sourceCode;
        const text = sourceCode.text;
        let index = text.indexOf(EM_DASH);
        while (index !== -1) {
          context.report({
            loc: {
              start: sourceCode.getLocFromIndex(index),
              end: sourceCode.getLocFromIndex(index + 1),
            },
            messageId: 'noEmDash',
          });
          index = text.indexOf(EM_DASH, index + 1);
        }
      },
    };
  },
};
