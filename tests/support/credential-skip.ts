/**
 * The sanctioned way for a test to skip because it needs credentials or
 * network the hermetic job does not provide. It prints a machine-readable
 * marker with a human reason. The credential-skip guard counts these
 * markers and fails if the count drifts from the number recorded in
 * DECISIONS.md, so a test cannot quietly start requiring a secret.
 */

/** Marker prefix the guard counts. Kept in one place so both agree. */
export const CREDENTIAL_SKIP_MARKER = 'CREDENTIAL-SKIP:';

/**
 * Records that a test skipped for lack of a credential or network access,
 * printing the reason. Call this and return early from the test body.
 */
export function credentialSkip(reason: string): void {
  process.stdout.write(`${CREDENTIAL_SKIP_MARKER} ${reason}\n`);
}
