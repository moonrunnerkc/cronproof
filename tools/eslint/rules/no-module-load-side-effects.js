/**
 * ESLint rule: ban credential, network, and subprocess work at module
 * scope. A module must be importable in a fresh, unauthenticated,
 * offline process without running anything. Config resolution is a
 * function call made by a caller, not a side effect of import.
 *
 * Reported at module scope (outside every function body):
 * - a network or subprocess primitive call (fetch, spawnSync, exec, ...)
 * - a call to an in-file function that itself does such work (the exact
 *   shape of the phase 12 bug: `const AUTH = token()`)
 * - top-level await (blocks module load on I/O)
 * - a throw (a module must not fail to import; make access a typed error)
 * - a process.env read (resolve config lazily, in a function)
 * - a `new` of anything but a pure built-in (no client construction)
 */

const NETWORK_SUBPROCESS = new Set([
  'fetch',
  'spawn',
  'spawnSync',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'fork',
]);

const PURE_NEW = new Set([
  'Set', 'Map', 'WeakSet', 'WeakMap', 'RegExp', 'Date', 'Array', 'Error',
  'TypeError', 'RangeError', 'URL', 'URLSearchParams', 'TextEncoder',
  'TextDecoder', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
  'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array',
  'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array',
  'BigUint64Array',
]);

function isPrimitiveCallee(callee) {
  if (callee.type === 'Identifier') {
    return NETWORK_SUBPROCESS.has(callee.name);
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return NETWORK_SUBPROCESS.has(callee.property.name);
  }
  return false;
}

function isProcessEnv(node) {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

function moduleFnName(node) {
  if (node.type === 'FunctionDeclaration' && node.id !== null) {
    return node.id.name;
  }
  if (node.parent.type === 'VariableDeclarator' && node.parent.id.type === 'Identifier') {
    return node.parent.id.name;
  }
  return null;
}

/** The rule object. */
export const noModuleLoadSideEffects = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban credential, network, and subprocess work at module load.',
    },
    schema: [],
    messages: {
      primitive: 'No network or subprocess call at module load: "{{name}}". Do this inside a function.',
      impureCall: 'Calling "{{name}}" at module load runs credential, network, or subprocess work. Call it lazily inside a function.',
      topLevelAwait: 'No top-level await: it blocks module load on I/O. Await inside a function.',
      topLevelThrow: 'No throw at module load: a module must import cleanly. Resolve config in a function and make missing config a typed error.',
      envRead: 'No process.env read at module load. Resolve configuration lazily inside a function.',
      clientNew: 'No client or object construction at module load: "new {{name}}". Construct it lazily inside a function.',
    },
  },
  create(context) {
    const functionStack = [];
    const impureFns = new Set();
    const moduleFnByName = new Map();
    const moduleCalls = [];

    function atModuleScope() {
      return functionStack.length === 0;
    }

    function markEnclosingImpure() {
      for (const fn of functionStack) {
        impureFns.add(fn);
      }
    }

    function onFunctionEnter(node) {
      if (functionStack.length === 0) {
        const name = moduleFnName(node);
        if (name !== null) {
          moduleFnByName.set(name, node);
        }
      }
      functionStack.push(node);
    }

    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      'FunctionDeclaration:exit': () => functionStack.pop(),
      'FunctionExpression:exit': () => functionStack.pop(),
      'ArrowFunctionExpression:exit': () => functionStack.pop(),

      CallExpression(node) {
        if (isPrimitiveCallee(node.callee)) {
          if (atModuleScope()) {
            const name = node.callee.type === 'Identifier' ? node.callee.name : node.callee.property.name;
            context.report({ node, messageId: 'primitive', data: { name } });
          } else {
            markEnclosingImpure();
          }
          return;
        }
        if (atModuleScope() && node.callee.type === 'Identifier') {
          moduleCalls.push({ node, name: node.callee.name });
        }
      },

      AwaitExpression(node) {
        if (atModuleScope()) {
          context.report({ node, messageId: 'topLevelAwait' });
        } else {
          markEnclosingImpure();
        }
      },

      ThrowStatement(node) {
        if (atModuleScope()) {
          context.report({ node, messageId: 'topLevelThrow' });
        } else {
          markEnclosingImpure();
        }
      },

      MemberExpression(node) {
        if (isProcessEnv(node)) {
          if (atModuleScope()) {
            context.report({ node, messageId: 'envRead' });
          } else {
            markEnclosingImpure();
          }
        }
      },

      NewExpression(node) {
        if (!atModuleScope()) {
          return;
        }
        const name = node.callee.type === 'Identifier' ? node.callee.name : null;
        if (name === null || !PURE_NEW.has(name)) {
          context.report({ node, messageId: 'clientNew', data: { name: name ?? 'expression' } });
        }
      },

      'Program:exit'() {
        for (const call of moduleCalls) {
          const fn = moduleFnByName.get(call.name);
          if (fn !== undefined && impureFns.has(fn)) {
            context.report({ node: call.node, messageId: 'impureCall', data: { name: call.name } });
          }
        }
      },
    };
  },
};
