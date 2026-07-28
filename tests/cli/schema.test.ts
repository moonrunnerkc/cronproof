import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2019 from 'ajv';
import addFormats from 'ajv-formats';
import { XMLParser } from 'fast-xml-parser';
import { describe, expect, test } from 'vitest';
import { BERLIN_FALLBACK, invoke } from './helper';

const here = path.dirname(fileURLToPath(import.meta.url));
const sarifSchema = JSON.parse(readFileSync(path.join(here, 'schemas', 'sarif-2.1.0.json'), 'utf8'));
const junitSchema = JSON.parse(readFileSync(path.join(here, 'schemas', 'junit.schema.json'), 'utf8'));

function makeAjv(): Ajv2019 {
  const ajv = new Ajv2019({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

describe('output validates against real schemas, not by inspection', () => {
  test('SARIF output validates against the official SARIF 2.1.0 schema', () => {
    const { stdout, exit } = invoke([...BERLIN_FALLBACK, '--format', 'sarif']);
    expect(exit).toBe(1);
    const log: unknown = JSON.parse(stdout);
    const validate = makeAjv().compile(sarifSchema);
    const valid = validate(log);
    expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
    expect(valid).toBe(true);
  });

  test('SARIF uses the hazard id as the rule id and maps critical severity to error', () => {
    const { stdout } = invoke([...BERLIN_FALLBACK, '--format', 'sarif']);
    const log = JSON.parse(stdout) as {
      runs: { tool: { driver: { rules: { id: string }[] } }; results: { ruleId: string; level: string }[] }[];
    };
    const result = log.runs[0]?.results[0];
    expect(result?.ruleId).toMatch(/^hz_/);
    expect(result?.level).toBe('error');
    expect(log.runs[0]?.tool.driver.rules.map((r) => r.id)).toContain(result?.ruleId);
  });

  test('JUnit output validates against a JUnit schema', () => {
    const { stdout } = invoke([...BERLIN_FALLBACK, '--format', 'junit']);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      isArray: (name) => ['testsuite', 'testcase', 'property'].includes(name),
    });
    const parsed: unknown = parser.parse(stdout);
    const validate = makeAjv().compile(junitSchema);
    const valid = validate(parsed);
    expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
    expect(valid).toBe(true);
  });

  test('a clean run still produces schema-valid SARIF and JUnit', () => {
    const clean = ['check', '0 4 * * *', '--tz', 'Europe/Berlin', '--from', '2023-01-01', '--to', '2024-01-01'];
    const sarif = invoke([...clean, '--format', 'sarif']);
    expect(sarif.exit).toBe(0);
    const sarifValidate = makeAjv().compile(sarifSchema);
    expect(sarifValidate(JSON.parse(sarif.stdout))).toBe(true);

    const junit = invoke([...clean, '--format', 'junit']);
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', isArray: (name) => ['testsuite', 'testcase', 'property'].includes(name) });
    const junitValidate = makeAjv().compile(junitSchema);
    expect(junitValidate(parser.parse(junit.stdout))).toBe(true);
  });
});
