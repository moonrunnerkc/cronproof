import { describe, expect, test } from 'vitest';
import { parse } from '../../src/cron/index';
import { classifyHazards, type Hazard } from '../../src/hazard/index';
import { buildVerdict } from '../../src/analyze/index';
import { createIntlBackend } from '../../src/tz/index';
import { renderTimeline } from '../../web/src/timeline';
import { renderMatrix } from '../../web/src/matrix';
import { renderHazards } from '../../web/src/render';

const intl = createIntlBackend();
const from = { year: 2024, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
const to = { year: 2025, month: 1, day: 1, hour: 0, minute: 0, second: 0 };

function hazardsFor(expr: string, zone: string): Hazard[] {
  const parsed = parse(expr, 'vixie');
  if (!parsed.ok) {
    throw new Error('parse failed');
  }
  return classifyHazards(parsed.ast, intl, { expression: expr, dialect: 'vixie', zone, from, to });
}

function only(hazards: Hazard[], kind: Hazard['kind']): Hazard {
  const found = hazards.find((h) => h.kind === kind);
  if (found === undefined) {
    throw new Error(`no ${kind} hazard produced`);
  }
  return found;
}

describe('the timeline strip marks the intended firing inside the gap or fold', () => {
  test('a spring-forward SKIPPED renders an SVG with a gap band and the intended time marked skipped', () => {
    const svg = renderTimeline(only(hazardsFor('30 2 * * *', 'America/New_York'), 'SKIPPED'));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('class="tl-gap"');
    expect(svg).toContain('gap 60m: never happens');
    expect(svg).toContain('02:30 intended, SKIPPED');
    expect(svg).toContain('Spring forward');
  });

  test('a fall-back DOUBLED renders a fold band and both resolved UTC instants', () => {
    const svg = renderTimeline(only(hazardsFor('30 1 * * *', 'America/New_York'), 'DOUBLED'));
    expect(svg).toContain('class="tl-fold"');
    expect(svg).toContain('fold 60m: happens twice');
    expect(svg).toContain('runs 05:30Z and 06:30Z');
  });

  test('the SVG carries an accessible label so a screenshot is described', () => {
    const svg = renderTimeline(only(hazardsFor('30 2 * * *', 'America/New_York'), 'SKIPPED'));
    expect(svg).toContain('role="img"');
    expect(svg).toMatch(/aria-label="[^"]+"/);
  });
});

describe('the hazard list pairs each hazard with its timeline', () => {
  test('a window with a skip and a double renders both cards, each containing an SVG', () => {
    const hazards = [
      ...hazardsFor('30 2 * * *', 'America/New_York'),
      ...hazardsFor('30 1 * * *', 'America/New_York'),
    ];
    const html = renderHazards(hazards);
    expect((html.match(/<svg/g) ?? []).length).toBe(2);
    expect(html).toContain('SKIPPED');
    expect(html).toContain('DOUBLED');
    expect(html).toContain('hz_');
  });

  test('a clean window says so instead of rendering an empty list', () => {
    const html = renderHazards(hazardsFor('30 2 * * *', 'UTC'));
    expect(html).toContain('No timezone hazards');
    expect(html).not.toContain('<svg');
  });
});

describe('the disagreement matrix shows what each scheduler does per decision point', () => {
  test('a spring-forward interval schedule renders a table with a row per decision point and a cell per policy', () => {
    const parsed = parse('*/15 * * * *', 'vixie');
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const verdict = buildVerdict(parsed.ast, intl, {
      expression: '*/15 * * * *',
      dialect: 'vixie',
      zone: 'America/New_York',
      from,
      to,
    });
    const html = renderMatrix(verdict.differential);
    expect(html).toContain('<table class="mx">');
    for (const column of verdict.differential.columns) {
      expect(html).toContain(column.policyId);
    }
    expect(html).toMatch(/nonexistent|ambiguous/);
  });

  test('a clean schedule reports no decision points rather than an empty table', () => {
    const parsed = parse('0 12 * * *', 'vixie');
    if (!parsed.ok) {
      throw new Error('parse failed');
    }
    const verdict = buildVerdict(parsed.ast, intl, {
      expression: '0 12 * * *',
      dialect: 'vixie',
      zone: 'America/New_York',
      from,
      to,
    });
    const html = renderMatrix(verdict.differential);
    expect(html).toContain('No decision points');
    expect(html).not.toContain('<table');
  });
});
