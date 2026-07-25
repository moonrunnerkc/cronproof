/**
 * ESLint rule that bans default exports, including re-exported and
 * aliased forms such as `export { foo as default }`.
 */
export const noDefaultExport = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban default exports; this repo uses named exports only.',
    },
    schema: [],
    messages: {
      noDefaultExport:
        'Default exports are banned in this repo. Use a named export.',
    },
  },
  create(context) {
    return {
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'noDefaultExport' });
      },
      ExportSpecifier(node) {
        const exportedName =
          node.exported.type === 'Identifier'
            ? node.exported.name
            : node.exported.value;
        if (exportedName === 'default') {
          context.report({ node, messageId: 'noDefaultExport' });
        }
      },
    };
  },
};
