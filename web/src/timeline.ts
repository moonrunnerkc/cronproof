/**
 * The hazard timeline: a horizontal wall-clock strip that shows the
 * gap or fold with the intended firing marked inside it. This is the
 * shareable artifact, so it is a pure function returning an SVG string,
 * styled through CSS classes (so it themes for light and dark) and
 * self-contained (no external fonts or images). It renders in a
 * terminal-free test as easily as in a browser tab.
 */

import { fieldsFromWallMillis } from '../../src/tz/civil-date';
import type { Hazard } from '../../src/hazard/index';

const WIDTH = 760;
const HEIGHT = 150;
const PAD_X = 24;
const TRACK_Y = 66;
const TRACK_H = 30;
const MINUTE = 60_000;

function hhmm(wallMillis: number): string {
  const f = fieldsFromWallMillis(wallMillis);
  return `${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')}`;
}

function utcHhmm(instant: number): string {
  return `${new Date(instant).toISOString().slice(11, 16)}Z`;
}

function offsetLabel(seconds: number): string {
  const sign = seconds < 0 ? '-' : '+';
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Band {
  start: number;
  end: number;
  cls: string;
  label: string;
}

interface Marker {
  wall: number;
  label: string;
  cls: string;
}

function scaler(lo: number, hi: number): (wall: number) => number {
  const span = hi - lo || 1;
  return (wall) => PAD_X + ((wall - lo) / span) * (WIDTH - 2 * PAD_X);
}

function bandSvg(x: (w: number) => number, band: Band): string {
  const x0 = x(band.start);
  const x1 = x(band.end);
  const mid = (x0 + x1) / 2;
  return (
    `<rect class="${band.cls}" x="${x0.toFixed(1)}" y="${TRACK_Y}" ` +
    `width="${Math.max(1, x1 - x0).toFixed(1)}" height="${TRACK_H}" rx="3"/>` +
    `<text class="tl-band-label" x="${mid.toFixed(1)}" y="${TRACK_Y - 8}" text-anchor="middle">${esc(band.label)}</text>`
  );
}

function markerSvg(x: (w: number) => number, marker: Marker): string {
  const mx = x(marker.wall);
  const top = TRACK_Y - 2;
  const bottom = TRACK_Y + TRACK_H + 2;
  return (
    `<line class="tl-firing-line ${marker.cls}" x1="${mx.toFixed(1)}" y1="${top}" x2="${mx.toFixed(1)}" y2="${bottom}"/>` +
    `<path class="tl-firing-pin ${marker.cls}" d="M ${(mx - 6).toFixed(1)} ${bottom + 2} L ${(mx + 6).toFixed(1)} ${bottom + 2} L ${mx.toFixed(1)} ${(bottom + 12).toFixed(1)} Z"/>` +
    `<text class="tl-firing-label" x="${mx.toFixed(1)}" y="${bottom + 30}" text-anchor="middle">${esc(marker.label)}</text>`
  );
}

function frame(lo: number, hi: number, bands: Band[], markers: Marker[], left: string, right: string, caption: string): string {
  const x = scaler(lo, hi);
  const parts: string[] = [];
  parts.push(`<rect class="tl-track" x="${PAD_X}" y="${TRACK_Y}" width="${WIDTH - 2 * PAD_X}" height="${TRACK_H}" rx="3"/>`);
  for (const band of bands) {
    parts.push(bandSvg(x, band));
  }
  for (const marker of markers) {
    parts.push(markerSvg(x, marker));
  }
  parts.push(`<text class="tl-axis" x="${PAD_X}" y="${TRACK_Y + TRACK_H + 20}" text-anchor="start">${esc(left)}</text>`);
  parts.push(`<text class="tl-axis" x="${WIDTH - PAD_X}" y="${TRACK_Y + TRACK_H + 20}" text-anchor="end">${esc(right)}</text>`);
  parts.push(`<text class="tl-caption" x="${WIDTH / 2}" y="20" text-anchor="middle">${esc(caption)}</text>`);
  return (
    `<svg class="tl" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" ` +
    `aria-label="${esc(caption)}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`
  );
}

function skippedSvg(hazard: Hazard): string {
  if (hazard.detail.kind !== 'SKIPPED') {
    return '';
  }
  const { gapStartWallMillis: gs, gapEndWallMillis: ge, gapDurationMillis } = hazard.detail.skipped;
  const pad = Math.max(gapDurationMillis, 30 * MINUTE);
  const intended = wallOf(hazard);
  const lo = Math.min(gs, intended) - pad;
  const hi = Math.max(ge, intended) + pad;
  const bands: Band[] = [
    { start: gs, end: ge, cls: 'tl-gap', label: `gap ${gapDurationMillis / MINUTE}m: never happens` },
  ];
  const markers: Marker[] = [
    { wall: intended, label: `${hhmm(intended)} intended, SKIPPED`, cls: 'tl-firing-skip' },
  ];
  const t = hazard.causingTransition;
  const left = t === null ? `${hhmm(lo)}` : offsetLabel(t.offsetBeforeSeconds);
  const right = t === null ? `${hhmm(hi)}` : offsetLabel(t.offsetAfterSeconds);
  return frame(lo, hi, bands, markers, left, right, `Spring forward: ${hhmm(gs)} to ${hhmm(ge)} is skipped`);
}

function doubledSvg(hazard: Hazard): string {
  if (hazard.detail.kind !== 'DOUBLED' || hazard.causingTransition === null) {
    return '';
  }
  const t = hazard.causingTransition;
  const foldStart = t.instant + t.offsetAfterSeconds * 1000;
  const foldEnd = t.instant + t.offsetBeforeSeconds * 1000;
  const pad = Math.max(hazard.detail.doubled.foldDurationMillis, 30 * MINUTE);
  const intended = wallOf(hazard);
  const lo = Math.min(foldStart, intended) - pad;
  const hi = Math.max(foldEnd, intended) + pad;
  const bands: Band[] = [
    { start: foldStart, end: foldEnd, cls: 'tl-fold', label: `fold ${hazard.detail.doubled.foldDurationMillis / MINUTE}m: happens twice` },
  ];
  const [earlier, later] = hazard.instants;
  const runs = earlier !== undefined && later !== undefined ? `${utcHhmm(earlier)} and ${utcHhmm(later)}` : 'twice';
  const markers: Marker[] = [
    { wall: intended, label: `${hhmm(intended)} intended, runs ${runs}`, cls: 'tl-firing-double' },
  ];
  return frame(lo, hi, bands, markers, offsetLabel(t.offsetBeforeSeconds), offsetLabel(t.offsetAfterSeconds), `Fall back: ${hhmm(foldStart)} to ${hhmm(foldEnd)} repeats`);
}

function wallOf(hazard: Hazard): number {
  const f = hazard.intendedLocal;
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
}

function plainSvg(hazard: Hazard): string {
  const intended = wallOf(hazard);
  const pad = 6 * 60 * MINUTE;
  const label =
    hazard.kind === 'INTERVAL_DRIFT'
      ? 'interval drifts across the transition'
      : hazard.kind === 'COUNT_ANOMALY'
        ? 'a calendar day is structurally anomalous'
        : 'region governed by the POSIX footer, a prediction';
  return frame(
    intended - pad,
    intended + pad,
    [],
    [{ wall: intended, label: `${hhmm(intended)} intended`, cls: 'tl-firing-plain' }],
    hazard.kind,
    hazard.zone,
    label,
  );
}

/** Renders one hazard as a self-contained SVG timeline strip. */
export function renderTimeline(hazard: Hazard): string {
  switch (hazard.kind) {
    case 'SKIPPED':
      return skippedSvg(hazard);
    case 'DOUBLED':
      return doubledSvg(hazard);
    default:
      return plainSvg(hazard);
  }
}
