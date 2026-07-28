import { describe, expect, test } from 'vitest';
import { createIntlBackend } from '../../src/tz/index';
import { decodeState, encodeState } from '../../web/src/permalink';
import { defaultState, type PlaygroundState } from '../../web/src/state';
import { nextTransitionWindow } from '../../web/src/next-transition';

describe('the permalink round-trips the full input state', () => {
  test('decoding an encoded state reproduces every field', () => {
    const state: PlaygroundState = {
      expression: '*/15 2 * * 1-5',
      dialect: 'debian',
      zone: 'Australia/Lord_Howe',
      from: '2024-04-06',
      to: '2024-04-08',
      idempotent: true,
    };
    expect(decodeState(`#${encodeState(state)}`)).toEqual(state);
  });

  test('a spaces-and-slashes expression survives encoding intact', () => {
    const state: PlaygroundState = { ...defaultState(), expression: '0 0 */2 * *', zone: 'Pacific/Chatham' };
    const round = decodeState(`#${encodeState(state)}`);
    expect(round.expression).toBe('0 0 */2 * *');
    expect(round.zone).toBe('Pacific/Chatham');
  });

  test('an empty hash yields the default state, and a bad dialect falls back rather than throwing', () => {
    expect(decodeState('')).toEqual(defaultState());
    expect(decodeState('#expr=0+0+*+*+*&dialect=nonsense').dialect).toBe(defaultState().dialect);
  });

  test('the idempotent flag is absent from the link when false and present when true', () => {
    expect(encodeState({ ...defaultState(), idempotent: false })).not.toContain('idem');
    expect(encodeState({ ...defaultState(), idempotent: true })).toContain('idem=1');
  });
});

describe('check my next transition brackets the upcoming change', () => {
  const intl = createIntlBackend();

  test('for a DST zone it returns the next transition and a window that contains it', () => {
    // A fixed reference instant so the test is deterministic: 2024-06-01.
    const now = Date.UTC(2024, 5, 1);
    const window = nextTransitionWindow(intl, 'America/New_York', now);
    expect(window).not.toBeNull();
    if (window === null) {
      return;
    }
    expect(window.transition.instant).toBeGreaterThan(now);
    // New York's next fall-back after June 2024 is 2024-11-03.
    expect(new Date(window.transition.instant).toISOString().slice(0, 10)).toBe('2024-11-03');
    expect(window.from.day).toBe(2);
    expect(window.to.day).toBe(5);
  });

  test('for a zone whose DST was abolished it returns null within the horizon', () => {
    const now = Date.UTC(2024, 0, 1);
    expect(nextTransitionWindow(intl, 'Asia/Tehran', now)).toBeNull();
  });
});
