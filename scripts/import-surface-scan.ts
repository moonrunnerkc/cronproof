/**
 * Import-surface scanner. It installs network guards, then imports every
 * library module under src/ and research/src/ (the two self-executing
 * entrypoints excluded) in this one process. If any import throws, or
 * any import opens a network connection, the offending module is
 * reported and the process exits nonzero.
 *
 * Run it with a scrubbed environment: no credential variables and a PATH
 * that does not contain `gh`, so a module that shells out for a token at
 * import time fails loudly instead of silently succeeding on a
 * developer's authenticated machine. This is the check that would have
 * caught the phase 12 collector bug the moment it landed.
 */

import net from 'node:net';
import tls from 'node:tls';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Guards must be installed before any target module is imported. Patching
// net.Socket.prototype.connect and tls.connect blocks all outbound TCP,
// including undici (global fetch) and https, at the socket layer.
net.Socket.prototype.connect = function blockedConnect(): never {
  throw new Error('network connect during import');
};
const blockedTls = (): never => {
  throw new Error('tls connect during import');
};
(tls as unknown as { connect: () => never }).connect = blockedTls;
(globalThis as unknown as { fetch: () => never }).fetch = (): never => {
  throw new Error('fetch during import');
};

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRYPOINTS = new Set([
  path.join(REPO_ROOT, 'src', 'cli.ts'),
  path.join(REPO_ROOT, 'research', 'src', 'pipeline.ts'),
]);

function listModules(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listModules(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !ENTRYPOINTS.has(full)) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const modules = [
    ...listModules(path.join(REPO_ROOT, 'src')),
    ...listModules(path.join(REPO_ROOT, 'research', 'src')),
  ].sort();

  const failures: { file: string; message: string }[] = [];
  for (const file of modules) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      failures.push({
        file: path.relative(REPO_ROOT, file),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(`import-surface: imported ${modules.length} modules, ${failures.length} failed\n`);
  for (const failure of failures) {
    process.stdout.write(`  FAIL ${failure.file}: ${failure.message}\n`);
  }
  return failures.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`import-surface scanner crashed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
