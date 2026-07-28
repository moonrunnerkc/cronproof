/**
 * Canonical hashing for the receipt. Hashes are taken over a
 * key-sorted serialization so they do not depend on object
 * construction order, which keeps the input and result hashes stable
 * across refactors and across two runs on the same inputs.
 */

import { createHash } from 'node:crypto';

/** Serializes a value with object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** SHA-256 of a string, as "sha256:" plus 32 hex characters. */
export function shortHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 32)}`;
}

/** Hashes a value canonically. */
export function hashValue(value: unknown): string {
  return shortHash(stableStringify(value));
}
