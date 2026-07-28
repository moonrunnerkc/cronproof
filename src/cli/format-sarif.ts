/**
 * SARIF 2.1.0 output. Hazards become code-scanning results: the
 * hazard severity maps to a SARIF level and the stable hazard id is
 * the rule id, so a specific hazard can be suppressed by id through
 * the standard SARIF/GitHub suppression mechanism. Phase 8 adds the
 * physical file and line; here each result carries a logical location
 * naming the zone and expression.
 */

import type { Severity } from '../hazard/index';
import { SARIF_SCHEMA_URI } from './sarif-schema-uri';
import type { HazardView, Receipt, ResultModel } from './types';

function levelFor(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'critical' || severity === 'high') {
    return 'error';
  }
  if (severity === 'medium') {
    return 'warning';
  }
  return 'note';
}

function ruleFor(hazard: HazardView): Record<string, unknown> {
  return {
    id: hazard.id,
    name: hazard.kind,
    shortDescription: { text: `${hazard.kind}: ${hazard.message}` },
    defaultConfiguration: { level: levelFor(hazard.severity) },
  };
}

function resultFor(hazard: HazardView): Record<string, unknown> {
  return {
    ruleId: hazard.id,
    level: levelFor(hazard.severity),
    message: { text: `${hazard.kind} at ${hazard.localIso} (${hazard.zone}): ${hazard.message}` },
    locations: [
      {
        logicalLocations: [{ name: hazard.zone, fullyQualifiedName: `${hazard.zone} ${hazard.expression}` }],
      },
    ],
    properties: {
      severity: hazard.severity,
      kind: hazard.kind,
      localIso: hazard.localIso,
      instantsUtc: hazard.instantsUtc,
    },
  };
}

/** Renders a result model and receipt as a SARIF 2.1.0 log. */
export function formatSarif(model: ResultModel, receipt: Receipt): string {
  const byId = new Map<string, HazardView>();
  for (const hazard of model.hazards) {
    byId.set(hazard.id, hazard);
  }
  const log = {
    $schema: SARIF_SCHEMA_URI,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'cronproof',
            version: receipt.toolVersion,
            informationUri: 'https://github.com/cronproof/cronproof',
            rules: [...byId.values()].map(ruleFor),
          },
        },
        results: model.hazards.map(resultFor),
        properties: { receipt },
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
