/**
 * Markdown output: a title, one section per block, and the receipt as
 * a table. Suitable for pasting into a pull request comment or a bug
 * report.
 */

import { receiptPairs } from './receipt';
import type { Receipt, ResultModel, Section } from './types';

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function mdTable(columns: string[], rows: string[][]): string[] {
  return [
    `| ${columns.map(escapeCell).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ];
}

function mdSection(section: Section): string[] {
  const out = [`## ${section.heading}`, ''];
  if (section.kind === 'text') {
    out.push(...section.lines);
  } else if (section.kind === 'keyval') {
    out.push(...section.pairs.map(([key, value]) => `- **${key}**: ${value}`));
  } else {
    out.push(...mdTable(section.columns, section.rows));
  }
  out.push('');
  return out;
}

/** Renders a result model and receipt as Markdown. */
export function formatMarkdown(model: ResultModel, receipt: Receipt): string {
  const lines = [`# ${model.title}`, ''];
  for (const section of model.sections) {
    lines.push(...mdSection(section));
  }
  lines.push('## receipt', '', ...mdTable(['field', 'value'], receiptPairs(receipt)));
  return `${lines.join('\n')}\n`;
}
