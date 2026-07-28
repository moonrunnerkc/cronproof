/**
 * The policy disagreement matrix as an HTML table. Each row is a
 * decision point (a firing a zone made nonexistent or ambiguous); each
 * column is a modeled scheduler; each cell says what that scheduler
 * does with the firing. This is the portability view: two schedulers
 * that treat the same gap differently are a bug waiting to happen when
 * a job is moved between them.
 */

import type { VerdictDifferential } from '../../src/analyze/index';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const OUTCOME_LABEL: Record<string, string> = {
  FIRES_ONCE_AT: 'fires once',
  FIRES_TWICE_AT: 'fires twice',
  DOES_NOT_FIRE: 'skips',
  FIRES_AT_CATCHUP: 'catch-up',
  UNDEFINED: 'undefined',
};

function cellText(kind: string, instants: string[]): string {
  const label = OUTCOME_LABEL[kind] ?? kind;
  const times = instants.map((iso) => `${iso.slice(11, 16)}Z`).join(', ');
  return times === '' ? label : `${label} (${times})`;
}

function cellClass(kind: string): string {
  if (kind === 'DOES_NOT_FIRE') {
    return 'mx-skip';
  }
  if (kind === 'FIRES_TWICE_AT') {
    return 'mx-double';
  }
  if (kind === 'UNDEFINED') {
    return 'mx-undef';
  }
  return 'mx-fire';
}

/** Renders the differential as a summary line plus a scheduler table. */
export function renderMatrix(diff: VerdictDifferential): string {
  const verdict =
    diff.verdict === 'total-agreement'
      ? '<span class="mx-agree">total agreement: safe to port</span>'
      : '<span class="mx-differ">schedulers disagree: not safe to port</span>';
  const differing = diff.pairs
    .filter((pair) => pair.relation === 'differ')
    .map((pair) => `${esc(pair.a)} vs ${esc(pair.b)}`);
  const summary =
    `<p class="mx-summary">${verdict}` +
    (differing.length === 0 ? '' : ` &mdash; ${differing.join('; ')}`) +
    `</p>`;

  if (diff.decisionPoints.length === 0) {
    return `${summary}<p class="mx-none">No decision points: every intended firing has a unique instant, so no scheduler has to choose.</p>`;
  }

  const head = diff.columns
    .map(
      (column) =>
        `<th><span class="mx-policy">${esc(column.policyId)}</span>` +
        `<span class="mx-verif mx-${column.verification.toLowerCase()}">${column.verification}</span></th>`,
    )
    .join('');

  const rows = diff.decisionPoints
    .map((point, index) => {
      const label = `${String(point.intendedLocal.hour).padStart(2, '0')}:${String(point.intendedLocal.minute).padStart(2, '0')} ${point.resolutionKind}`;
      const cells = diff.columns
        .map((column) => {
          const outcome = column.outcomes[index];
          if (outcome === undefined) {
            return '<td class="mx-undef">&middot;</td>';
          }
          return `<td class="${cellClass(outcome.kind)}">${esc(cellText(outcome.kind, outcome.instants))}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
    })
    .join('');

  return (
    `${summary}<div class="mx-scroll"><table class="mx"><thead><tr>` +
    `<th scope="col">decision point</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  );
}
