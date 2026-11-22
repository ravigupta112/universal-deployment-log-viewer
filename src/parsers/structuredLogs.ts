import type { LogStep } from '../types';
import { createStep, finalizeSteps, pushLine, splitLines, tryParseJson } from './structured';

const GROUP_KEYS = ['stage', 'step', 'job', 'component', 'service', 'logger', 'module', 'app', 'container'];

/** Generic JSON / NDJSON / JSON-array parser. Groups by `stage`, `step`, `service`, ... if present. */
export function parseJsonLogs(raw: string): LogStep[] {
  let lines: string[] | undefined;
  const t = raw.trim();
  if (t.startsWith('[')) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) lines = arr.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)));
    } catch {
      /* fall through to line-based parsing */
    }
  }
  if (!lines) lines = splitLines(raw);

  const steps: LogStep[] = [];
  const byKey = new Map<string, LogStep>();
  let last: LogStep | null = null;
  const get = (key: string) => {
    let s = byKey.get(key);
    if (!s) {
      s = createStep(`json-${steps.length}`, key, 'json');
      byKey.set(key, s);
      steps.push(s);
    }
    return s;
  };

  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const obj = tryParseJson(line);
    let key: string | undefined;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      for (const k of GROUP_KEYS) {
        if (typeof o[k] === 'string' && o[k]) {
          key = o[k] as string;
          break;
        }
      }
    }
    const step: LogStep = key ? get(key) : last ?? get('Application logs');
    last = step;
    pushLine(step, line, i + 1);
  });
  return finalizeSteps(steps);
}

/** Fallback for unrecognised plain text. */
export function parsePlaintext(raw: string): LogStep[] {
  const step = createStep('plaintext-0', 'Log output', 'plaintext');
  splitLines(raw).forEach((line, i) => {
    if (line.trim()) pushLine(step, line, i + 1);
  });
  return finalizeSteps([step]);
}
