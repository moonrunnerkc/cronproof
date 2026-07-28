/**
 * Pure HTML rendering of a verdict: the single-backend banner, the
 * hazard list (each hazard paired with its timeline strip), and the
 * empty state. Everything returns a string so the same rendering is
 * unit-testable without a DOM and injected once in the browser.
 */

import { hazardToView } from '../../src/analyze/index';
import type { Hazard } from '../../src/hazard/index';
import { renderTimeline } from './timeline';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The banner stating single-backend mode. The browser has only the
 * Intl (ICU) backend, so it loses the dual-backend cross-check and the
 * ZONE_UNSTABLE footer-extrapolation label the CLI computes from the
 * compiled TZif table. The banner says so plainly.
 */
export function renderBanner(tzdbVersion: string): string {
  const version = tzdbVersion === '' ? 'the browser ICU build' : `ICU tzdb ${esc(tzdbVersion)}`;
  return (
    `<div class="banner" role="note">` +
    `<strong>Single-backend mode.</strong> Offsets come from your browser's Intl engine (${version}) only. ` +
    `There is no second backend to cross-check against and no compiled zone table to read, so this page cannot ` +
    `flag ZONE_UNSTABLE (a firing past the last recorded transition, governed by the POSIX footer). ` +
    `For a cross-checked verdict with that label, run the cronproof CLI.` +
    `</div>`
  );
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function severityRank(severity: string): number {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function hazardCard(hazard: Hazard): string {
  const view = hazardToView(hazard);
  const instants = view.instantsUtc.length === 0 ? '(none)' : view.instantsUtc.join(', ');
  return (
    `<article class="hazard sev-${esc(view.severity)}">` +
    `<header class="hazard-head">` +
    `<span class="sev-badge sev-${esc(view.severity)}">${esc(view.severity)}</span>` +
    `<span class="hazard-kind">${esc(view.kind)}</span>` +
    `<span class="hazard-local">${esc(view.localIso)}</span>` +
    `<code class="hazard-id">${esc(view.id)}</code>` +
    `</header>` +
    `<p class="hazard-msg">${esc(view.message)}</p>` +
    `<div class="hazard-timeline">${renderTimeline(hazard)}</div>` +
    `<p class="hazard-instants">resolved UTC: ${esc(instants)}</p>` +
    `</article>`
  );
}

/** Renders the hazard list, most severe first, or a clean-window note. */
export function renderHazards(hazards: Hazard[]): string {
  if (hazards.length === 0) {
    return `<p class="clean">No timezone hazards in this window. Every intended firing has a single, unambiguous instant.</p>`;
  }
  const ordered = [...hazards].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  return ordered.map(hazardCard).join('');
}

/** Renders a one-line count summary above the hazard list. */
export function renderSummary(hazards: Hazard[]): string {
  const counts = new Map<string, number>();
  for (const hazard of hazards) {
    counts.set(hazard.kind, (counts.get(hazard.kind) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return `<span class="count-clean">0 hazards</span>`;
  }
  const parts = [...counts.entries()].map(([kind, n]) => `${n} ${esc(kind)}`);
  return `<span class="count-hazard">${hazards.length} hazard${hazards.length === 1 ? '' : 's'}</span>: ${parts.join(', ')}`;
}
