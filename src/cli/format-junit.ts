/**
 * JUnit XML output. Each hazard is a failing test case so a CI system
 * that consumes JUnit surfaces hazards as test failures; a clean run
 * emits a single passing case. The receipt rides in the standard
 * <properties> block.
 */

import { receiptPairs } from './receipt';
import type { HazardView, Receipt, ResultModel } from './types';

function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function caseFor(hazard: HazardView): string {
  const name = `${hazard.kind} ${hazard.localIso}`;
  const detail = `${hazard.message}; instants ${hazard.instantsUtc.join(', ') || '(none)'}; id ${hazard.id}`;
  return (
    `    <testcase name="${attr(name)}" classname="cronproof.${attr(hazard.zone)}" time="0">\n` +
    `      <failure message="${attr(hazard.message)}" type="${attr(hazard.kind)}">${text(detail)}</failure>\n` +
    `    </testcase>`
  );
}

/** Renders a result model and receipt as a JUnit XML report. */
export function formatJunit(model: ResultModel, receipt: Receipt): string {
  const failures = model.hazards.length;
  const cases =
    failures === 0
      ? [`    <testcase name="no hazards" classname="cronproof.${attr(model.command)}" time="0"/>`]
      : model.hazards.map(caseFor);
  const tests = cases.length;
  const properties = receiptPairs(receipt)
    .map(([key, value]) => `      <property name="${attr(key)}" value="${attr(value)}"/>`)
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<testsuites name="cronproof" tests="${tests}" failures="${failures}" errors="0">\n` +
    `  <testsuite name="${attr(model.title)}" tests="${tests}" failures="${failures}" errors="0" time="0">\n` +
    `    <properties>\n${properties}\n    </properties>\n` +
    `${cases.join('\n')}\n` +
    '  </testsuite>\n' +
    '</testsuites>\n'
  );
}
