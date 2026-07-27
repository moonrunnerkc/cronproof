/**
 * Expansion of the @-macros supported by Vixie-style cron and by
 * robfig/cron (the k8s parser). Each macro expands to a standard
 * five-field expression; @reboot has no wall-clock schedule and is
 * signalled separately. Dialects that do not support macros (Quartz,
 * AWS EventBridge, GitHub Actions, systemd) never call this.
 */

/** Outcome of resolving a macro token. */
export type MacroResolution =
  | { kind: 'expanded'; fields: string }
  | { kind: 'reboot' }
  | { kind: 'unknown' };

const MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

/**
 * Resolves a leading @-macro token. Returns the five-field expansion
 * for a known scheduling macro, a reboot marker for @reboot, or
 * unknown for anything else so the caller can report it with the
 * token's offset.
 */
export function resolveMacro(token: string): MacroResolution {
  const key = token.toLowerCase();
  if (key === '@reboot') {
    return { kind: 'reboot' };
  }
  const fields = MACROS[key];
  return fields === undefined ? { kind: 'unknown' } : { kind: 'expanded', fields };
}
