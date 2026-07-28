import { defineConfig } from 'tsup';

// The CJS build of the library warns that import.meta is empty under cjs
// (src/tz/zoneinfo-source.ts uses import.meta.url, which resolves in the ESM
// build and the tsx/CLI path). esbuild prints that warning with a level badge
// that reads differently on CI than locally, which made the captured build
// output nondeterministic in EVIDENCE.md. Silence just that one warning.
function silenceImportMeta(options: { logOverride?: Record<string, string> }): void {
  options.logOverride = { ...options.logOverride, 'empty-import-meta': 'silent' };
}

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    platform: 'node',
    target: 'node22',
    esbuildOptions: silenceImportMeta,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    clean: false,
    platform: 'node',
    target: 'node22',
    esbuildOptions: silenceImportMeta,
  },
]);
