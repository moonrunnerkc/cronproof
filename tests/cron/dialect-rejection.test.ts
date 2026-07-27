import { describe, expect, test } from 'vitest';
import { validate } from '../../src/cron/index';
import { REJECTION_CASES } from '../../src/cron/rejection-table';
import type { DialectId } from '../../src/cron/index';

describe('dialect acceptance and rejection', () => {
  test.each(REJECTION_CASES)(
    '$dialect $accepted for "$expression": $note',
    ({ expression, dialect, accepted, reasonIncludes }) => {
      const errors = validate(expression, dialect);
      if (accepted) {
        expect(errors).toEqual([]);
        return;
      }
      expect(errors.length).toBeGreaterThan(0);
      const first = errors[0];
      expect(first).toBeDefined();
      expect(first?.offset).toBeGreaterThanOrEqual(0);
      if (reasonIncludes !== undefined) {
        expect(first?.reason).toContain(reasonIncludes);
      }
    },
  );

  test('every dialect rejects at least one expression that another dialect accepts', () => {
    const dialects: DialectId[] = [
      'vixie',
      'debian',
      'quartz',
      'k8s',
      'systemd',
      'github-actions',
      'aws-eventbridge',
    ];
    for (const dialect of dialects) {
      const rejectsSomething = REJECTION_CASES.some(
        (c) => c.dialect === dialect && !c.accepted && validate(c.expression, dialect).length > 0,
      );
      const acceptedElsewhere = (expr: string): boolean =>
        dialects.some((other) => other !== dialect && validate(expr, other).length === 0);
      const rejectedHereAcceptedThere = REJECTION_CASES.some(
        (c) =>
          c.dialect === dialect &&
          !c.accepted &&
          validate(c.expression, dialect).length > 0 &&
          acceptedElsewhere(c.expression),
      );
      expect(rejectsSomething, `${dialect} should reject at least one case`).toBe(true);
      expect(
        rejectedHereAcceptedThere,
        `${dialect} should reject an expression another dialect accepts`,
      ).toBe(true);
    }
  });
});
