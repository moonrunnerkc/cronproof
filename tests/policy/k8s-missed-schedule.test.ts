import { describe, expect, test } from 'vitest';
import { DEFAULT_K8S_MISSED_LIMIT, k8sTooManyMissedTimes } from '../../src/policy/index';

// The 100 threshold and the strict `>` comparison are taken from the
// Kubernetes controller source, verified this session at a pinned tag:
// kubernetes/kubernetes v1.31.0 pkg/controller/cronjob/utils.go line 172,
// `case numberOfMissedSchedules > 100: missedSchedules = manyMissed`, which
// drives the TooManyMissedTimes warning event at line 220. The same 100
// threshold appears in the older v1 controller (v1.20.0 utils.go line 147),
// so the number has not moved between the two implementations.

describe('the k8s missed-schedule limit matches the controller source', () => {
  test('the limit constant is 100, as in kubernetes v1.31.0 utils.go line 172', () => {
    expect(DEFAULT_K8S_MISSED_LIMIT).toBe(100);
  });

  test('exactly 100 missed schedules is not too many, but 101 is (strict > 100 boundary)', () => {
    expect(k8sTooManyMissedTimes(99)).toBe(false);
    expect(k8sTooManyMissedTimes(100)).toBe(false);
    expect(k8sTooManyMissedTimes(101)).toBe(true);
  });

  test('zero missed schedules is never too many', () => {
    expect(k8sTooManyMissedTimes(0)).toBe(false);
  });
});
