/**
 * Shared helpers for the backfilled acceptance suites. These tests
 * assert the written acceptance criterion for each phase against the
 * real APIs and committed artifacts, offline and deterministically
 * (the vendored 2025b zoneinfo, historical dates stable across tzdb
 * releases), so they run the same in CI as locally.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTzifBackend, vendoredZoneinfoRoot, type TzifBackend } from '../../src/tz/index';
import type { LocalFiring } from '../../src/cron/index';
import type { DateArg } from '../../src/cli/types';
import type { ParsedArgs } from '../../src/cli/args';

const found = vendoredZoneinfoRoot();
if (found === null) {
  throw new Error('vendored zoneinfo not found; run the phase 2 vendoring step');
}

/** The vendored zoneinfo root. */
export const ROOT: string = found;

/** A shared TZif backend on the vendored data. */
export const backend: TzifBackend = createTzifBackend({ zoneinfoRoot: ROOT });

/** The repository root. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Midnight wall-clock fields for a civil date. */
export function midnight(year: number, month: number, day = 1): LocalFiring {
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

/** A CLI date argument from year, month, day. */
export function dateArg(year: number, month: number, day = 1): DateArg {
  const text = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { text, fields: midnight(year, month, day) };
}

/** Builds a ParsedArgs with sensible defaults, overridden by `over`. */
export function makeArgs(over: Partial<ParsedArgs>): ParsedArgs {
  return {
    command: 'check',
    format: 'json',
    positional: null,
    zone: null,
    from: null,
    to: null,
    at: null,
    dialect: 'vixie',
    failOn: 'high',
    idempotent: false,
    zoneinfoRoot: ROOT,
    hazardWindow: null,
    baseline: null,
    out: null,
    tzdbCheck: null,
    ...over,
  };
}
