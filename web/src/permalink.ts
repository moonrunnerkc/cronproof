/**
 * Permalink encoding. The full input state is serialized into the URL
 * hash so a specific hazard is linkable and survives a reload with no
 * backend. This is the thing crontab.guru cannot do for timezones: the
 * zone and window are part of the shared link, not just the expression.
 */

import { defaultState, isDialect, type PlaygroundState } from './state';

/** Serializes state into a URL hash fragment (without the leading #). */
export function encodeState(state: PlaygroundState): string {
  const params = new URLSearchParams();
  params.set('expr', state.expression);
  params.set('dialect', state.dialect);
  params.set('tz', state.zone);
  params.set('from', state.from);
  params.set('to', state.to);
  if (state.idempotent) {
    params.set('idem', '1');
  }
  return params.toString();
}

/**
 * Reads state from a URL hash fragment, filling any missing or invalid
 * field from the default state. A bad dialect falls back rather than
 * throwing, so a hand-edited link still loads a usable playground.
 */
export function decodeState(hash: string): PlaygroundState {
  const base = defaultState();
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  if (cleaned === '') {
    return base;
  }
  const params = new URLSearchParams(cleaned);
  const dialectRaw = params.get('dialect');
  return {
    expression: params.get('expr') ?? base.expression,
    dialect: dialectRaw !== null && isDialect(dialectRaw) ? dialectRaw : base.dialect,
    zone: params.get('tz') ?? base.zone,
    from: params.get('from') ?? base.from,
    to: params.get('to') ?? base.to,
    idempotent: params.get('idem') === '1',
  };
}
