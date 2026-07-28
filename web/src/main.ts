/**
 * The playground entry point: wires the form to the pure analysis and
 * rendering functions, keeps the permalink in sync with the inputs, and
 * offers the "check my next transition" shortcut. All heavy lifting is
 * in the pure modules; this file only touches the DOM.
 */

import { createIntlBackend } from '../../src/tz/intl-backend';
import { DIALECTS, defaultState, isDialect, type PlaygroundState } from './state';
import { decodeState, encodeState } from './permalink';
import { runAnalysis } from './run';
import { renderBanner, renderHazards, renderSummary } from './render';
import { renderMatrix } from './matrix';
import { nextTransitionWindow } from './next-transition';

const backend = createIntlBackend();

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`missing element #${id}`);
  }
  return el as T;
}

function readForm(): PlaygroundState {
  return {
    expression: byId<HTMLInputElement>('expr').value,
    dialect: (() => {
      const value = byId<HTMLSelectElement>('dialect').value;
      return isDialect(value) ? value : defaultState().dialect;
    })(),
    zone: byId<HTMLInputElement>('tz').value.trim(),
    from: byId<HTMLInputElement>('from').value.trim(),
    to: byId<HTMLInputElement>('to').value.trim(),
    idempotent: byId<HTMLInputElement>('idem').checked,
  };
}

function writeForm(state: PlaygroundState): void {
  byId<HTMLInputElement>('expr').value = state.expression;
  byId<HTMLSelectElement>('dialect').value = state.dialect;
  byId<HTMLInputElement>('tz').value = state.zone;
  byId<HTMLInputElement>('from').value = state.from;
  byId<HTMLInputElement>('to').value = state.to;
  byId<HTMLInputElement>('idem').checked = state.idempotent;
}

function populateDialects(): void {
  const select = byId<HTMLSelectElement>('dialect');
  select.innerHTML = DIALECTS.map((d) => `<option value="${d}">${d}</option>`).join('');
}

function updatePermalink(state: PlaygroundState): void {
  const hash = `#${encodeState(state)}`;
  history.replaceState(null, '', hash);
  byId<HTMLInputElement>('permalink').value = location.href;
}

function analyzeAndRender(state: PlaygroundState): void {
  const summary = byId('summary');
  const errorBox = byId('error');
  const hazardsBox = byId('hazards');
  const matrixBox = byId('matrix');

  const result = runAnalysis(state, backend);
  if (!result.ok) {
    errorBox.textContent = result.error;
    errorBox.hidden = false;
    summary.innerHTML = '';
    hazardsBox.innerHTML = '';
    matrixBox.innerHTML = '';
    return;
  }
  errorBox.hidden = true;
  errorBox.textContent = '';
  summary.innerHTML = renderSummary(result.hazards);
  hazardsBox.innerHTML = renderHazards(result.hazards);
  matrixBox.innerHTML = renderMatrix(result.verdict.differential);
}

function refresh(): void {
  const state = readForm();
  updatePermalink(state);
  analyzeAndRender(state);
}

function checkMyNextTransition(): void {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const state = readForm();
  const window = nextTransitionWindow(backend, zone, Date.now());
  const note = byId('next-note');
  if (window === null) {
    note.textContent = `${zone} has no upcoming transition in the next three years (DST may be abolished there).`;
    note.hidden = false;
    return;
  }
  const iso = new Date(window.transition.instant).toISOString().slice(0, 16).replace('T', ' ');
  note.textContent = `${zone}: next transition at ${iso}Z (${window.transition.deltaSeconds / 60}m shift).`;
  note.hidden = false;
  const fmt = (f: { year: number; month: number; day: number }): string =>
    `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
  writeForm({ ...state, zone, from: fmt(window.from), to: fmt(window.to) });
  refresh();
}

async function copyPermalink(): Promise<void> {
  const value = byId<HTMLInputElement>('permalink').value;
  try {
    await navigator.clipboard.writeText(value);
    byId('copy-btn').textContent = 'copied';
    setTimeout(() => {
      byId('copy-btn').textContent = 'copy link';
    }, 1200);
  } catch {
    byId<HTMLInputElement>('permalink').select();
  }
}

function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is a progressive enhancement; ignore failures.
    });
  }
}

function init(): void {
  populateDialects();
  const initial = decodeState(location.hash);
  writeForm(initial);
  byId('banner').innerHTML = renderBanner('');

  for (const id of ['expr', 'tz', 'from', 'to']) {
    byId<HTMLInputElement>(id).addEventListener('input', refresh);
  }
  byId<HTMLSelectElement>('dialect').addEventListener('change', refresh);
  byId<HTMLInputElement>('idem').addEventListener('change', refresh);
  byId('next-btn').addEventListener('click', checkMyNextTransition);
  byId('copy-btn').addEventListener('click', () => {
    void copyPermalink();
  });
  window.addEventListener('hashchange', () => {
    writeForm(decodeState(location.hash));
    refresh();
  });

  refresh();
  registerServiceWorker();
}

init();
