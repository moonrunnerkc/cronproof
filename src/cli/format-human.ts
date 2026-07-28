/**
 * Human output: aligned tables and key/value blocks. Color is applied
 * only when writing to a TTY, so piped or redirected output stays
 * plain text.
 */

import { receiptPairs } from './receipt';
import type { Receipt, ResultModel, Section } from './types';

const ESC = String.fromCharCode(27);
const COLORS: Record<string, string> = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
};

function paint(text: string, color: string, tty: boolean): string {
  if (!tty) {
    return text;
  }
  return `${COLORS[color] ?? ''}${text}${COLORS.reset}`;
}

function renderTable(columns: string[], rows: string[][], tty: boolean): string[] {
  const widths = columns.map((col, i) => Math.max(col.length, ...rows.map((row) => (row[i] ?? '').length)));
  const line = (cells: string[]): string => cells.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd();
  const out = [paint(line(columns), 'bold', tty), line(widths.map((w) => '-'.repeat(w)))];
  for (const row of rows) {
    out.push(line(row));
  }
  return out;
}

function renderKeyval(pairs: [string, string][]): string[] {
  const width = Math.max(0, ...pairs.map(([key]) => key.length));
  return pairs.map(([key, value]) => `${key.padEnd(width)}  ${value}`);
}

function renderSection(section: Section, tty: boolean): string[] {
  const heading = paint(section.heading, 'bold', tty);
  if (section.kind === 'text') {
    return [heading, ...section.lines.map((l) => `  ${l}`), ''];
  }
  if (section.kind === 'keyval') {
    return [heading, ...renderKeyval(section.pairs).map((l) => `  ${l}`), ''];
  }
  return [heading, ...renderTable(section.columns, section.rows, tty).map((l) => `  ${l}`), ''];
}

/** Renders a result model and receipt as a human report. */
export function formatHuman(model: ResultModel, receipt: Receipt, tty: boolean): string {
  const lines: string[] = [paint(model.title, 'bold', tty), ''];
  for (const section of model.sections) {
    lines.push(...renderSection(section, tty));
  }
  lines.push(paint('receipt', 'bold', tty), ...renderKeyval(receiptPairs(receipt)).map((l) => `  ${l}`));
  return `${lines.join('\n')}\n`;
}
