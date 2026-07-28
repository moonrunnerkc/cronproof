/**
 * Builds the web playground into a static bundle under web/dist. The
 * page runs the Intl backend only, but the shared classifier statically
 * imports the TZif reader (the one node-dependent module), so the
 * browser build stubs node builtins. That path is never reached at
 * runtime: single-backend mode passes no zoneinfo root, so the reader
 * short-circuits before touching the filesystem. If it were ever
 * called, the stub throws a clear error rather than failing silently.
 */

import { build, type Plugin } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(REPO_ROOT, 'web');
const DIST = path.join(WEB, 'dist');

const STUB = `
const trap = () => { throw new Error('node builtin unavailable in the cronproof browser build'); };
const proxy = new Proxy(trap, { get: () => proxy });
export default proxy;
export const existsSync = trap;
export const readFileSync = trap;
export const readdirSync = trap;
export const statSync = trap;
export const writeFileSync = trap;
export const readFile = trap;
export const fileURLToPath = trap;
export const createHash = trap;
`;

/** Redirects every node: import to an inert stub, since the browser path never calls it. */
const stubNodeBuiltins: Plugin = {
  name: 'stub-node-builtins',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: 'node-stub' }));
    pluginBuild.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({ contents: STUB, loader: 'js' }));
  },
};

const STATIC_FILES = ['index.html', 'styles.css', 'sw.js'];

function formatBytes(bytes: number): string {
  return `${bytes} B (${(bytes / 1024).toFixed(1)} KiB)`;
}

async function main(): Promise<void> {
  mkdirSync(DIST, { recursive: true });
  await build({
    entryPoints: [path.join(WEB, 'src', 'main.ts')],
    outfile: path.join(DIST, 'app.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    plugins: [stubNodeBuiltins],
  });

  for (const file of STATIC_FILES) {
    copyFileSync(path.join(WEB, file), path.join(DIST, file));
  }

  const appJs = readFileSync(path.join(DIST, 'app.js'));
  const gzipped = gzipSync(appJs).length;
  let total = 0;
  const rows: string[] = [];
  for (const file of ['app.js', ...STATIC_FILES]) {
    const size = statSync(path.join(DIST, file)).size;
    total += size;
    rows.push(`  ${file.padEnd(12)} ${formatBytes(size)}`);
  }

  process.stdout.write('cronproof web bundle built to web/dist\n');
  process.stdout.write(`${rows.join('\n')}\n`);
  process.stdout.write(`  ${'app.js gzip'.padEnd(12)} ${formatBytes(gzipped)}\n`);
  process.stdout.write(`  ${'total'.padEnd(12)} ${formatBytes(total)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`web build failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
