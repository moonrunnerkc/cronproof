/**
 * File-to-scanner routing. Decides which scanners apply to a file from
 * its path and a cheap content sniff, so a YAML file that is a GitHub
 * workflow is not also run through the Kubernetes scanner and vice
 * versa. A file can legitimately match more than one scanner; the
 * orchestrator dedupes identical findings afterward.
 */

import { scanCelery } from './scanners/celery';
import { scanGithubActions } from './scanners/github-actions';
import { scanJsCallsites } from './scanners/js-callsites';
import { scanK8s } from './scanners/k8s';
import { scanNetlify, scanRender, scanVercel, scanWrangler } from './scanners/serverless';
import { scanSpring } from './scanners/spring';
import { scanSystemdTimer } from './scanners/systemd';
import { scanSystemCrontab, scanUserCrontab } from './scanners/crontab';
import { scanTerraform } from './scanners/terraform';
import type { ScanFile, Scanner } from './types';

const TERRAFORM_MARKER = /google_cloud_scheduler_job|aws_cloudwatch_event_rule|aws_scheduler_schedule/;

function basename(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

function parentName(path: string): string {
  const parts = path.split('/');
  return parts.length >= 2 ? (parts[parts.length - 2] ?? '') : '';
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

const JS_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);

function crontabScanner(file: ScanFile, name: string): Scanner | null {
  if (parentName(file.path) === 'etc' || file.path.includes('/cron.d/')) {
    return scanSystemCrontab;
  }
  if (name === 'crontab' || extension(name) === '.crontab' || extension(name) === '.cron') {
    return scanUserCrontab;
  }
  return null;
}

/**
 * Selects the scanners that apply to a file.
 * @param file The file to route.
 * @returns The scanners to run against it, possibly empty.
 */
export function scannersFor(file: ScanFile): Scanner[] {
  const name = basename(file.path).toLowerCase();
  const ext = extension(name);
  const scanners: Scanner[] = [];

  const crontab = crontabScanner(file, name);
  if (crontab !== null) {
    scanners.push(crontab);
  }
  if (ext === '.timer') {
    scanners.push(scanSystemdTimer);
  }
  if (name === 'wrangler.toml') {
    scanners.push(scanWrangler);
  }
  if (name === 'vercel.json') {
    scanners.push(scanVercel);
  }
  if (name === 'render.yaml' || name === 'render.yml') {
    scanners.push(scanRender);
  }
  if (name === 'netlify.toml') {
    scanners.push(scanNetlify);
  }
  if (ext === '.tf' && TERRAFORM_MARKER.test(file.text)) {
    scanners.push(scanTerraform);
  }
  if (ext === '.yml' || ext === '.yaml') {
    if (file.path.includes('.github/workflows/')) {
      scanners.push(scanGithubActions);
    }
    if (/\bkind\s*:\s*["']?CronJob\b|\bjobTemplate\s*:/.test(file.text)) {
      scanners.push(scanK8s);
    }
  }
  if (JS_EXT.has(ext)) {
    scanners.push(scanJsCallsites);
  }
  if ((ext === '.java' || ext === '.kt') && file.text.includes('@Scheduled')) {
    scanners.push(scanSpring);
  }
  if (ext === '.py' && file.text.includes('crontab')) {
    scanners.push(scanCelery);
  }
  return scanners;
}
