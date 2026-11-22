import type { LogLevel, LogStep } from '../types';
import {
  closeStep,
  createStep,
  finalizeSteps,
  isoFromSeconds,
  pushLine,
  splitLines,
  splitTimestamp,
  stripAnsi,
} from './structured';

/* ------------------------------- GitLab CI -------------------------------- */

export function parseGitLab(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  const open = new Map<string, LogStep>();
  const startSec = new Map<string, number>();
  let loose: LogStep | null = null;
  const current = () => {
    const arr = Array.from(open.values());
    return arr.length ? arr[arr.length - 1] : null;
  };

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const start = line.match(/section_start:(\d+):([\w\-.]+)(?:\[[^\]]*\])?(?:\r|\\r)?(.*)$/);
    if (start) {
      const title = stripAnsi(start[3]).replace(/\r/g, '').trim() || start[2].replace(/_/g, ' ');
      const s = createStep(`gitlab-${steps.length}-${start[2]}`, title, 'gitlab', {
        status: 'running',
        startTime: isoFromSeconds(Number(start[1])),
        metadata: { section: start[2] },
      });
      steps.push(s);
      open.set(start[2], s);
      startSec.set(start[2], Number(start[1]));
      loose = null;
      return;
    }
    const end = line.match(/section_end:(\d+):([\w\-.]+)/);
    if (end) {
      const s = open.get(end[2]);
      if (s) {
        s.duration = Math.max(0, (Number(end[1]) - (startSec.get(end[2]) ?? Number(end[1]))) * 1000);
        closeStep(s, undefined, isoFromSeconds(Number(end[1])));
        open.delete(end[2]);
      }
      return;
    }
    if (!stripAnsi(line).trim()) return;
    let target = current();
    if (!target) {
      if (!loose) {
        loose = createStep(`gitlab-output-${steps.length}`, steps.length ? 'Job output' : 'Runner setup', 'gitlab');
        steps.push(loose);
      }
      target = loose;
    }
    pushLine(target, line, n);
  });
  return finalizeSteps(steps);
}

/* ----------------------------- GitHub Actions ----------------------------- */

export function parseGitHub(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const { timestamp, rest } = splitTimestamp(c);

    const g = rest.match(/^(?:##\[group\]|::group::)(.*)$/);
    if (g) {
      if (cur) closeStep(cur, undefined, timestamp);
      cur = createStep(`github-${steps.length}`, g[1].trim() || 'Step', 'github', {
        status: 'running',
        startTime: timestamp,
      });
      steps.push(cur);
      pushLine(cur, line, n, { level: 'info' });
      return;
    }
    // The group header ends here, but the step's output keeps streaming into the same stage.
    if (/^(?:##\[endgroup\]|::endgroup::)/.test(rest)) return;

    if (!cur) {
      cur = createStep(`github-${steps.length}`, 'Job setup', 'github', { status: 'running' });
      steps.push(cur);
    }
    let level: LogLevel | undefined;
    let description: string | undefined;
    let inputs: Record<string, string> | undefined;
    const ann = rest.match(/^::(error|warning|notice|debug)(?: ([^:]*))?::(.*)$/);
    if (ann) {
      level = ann[1] === 'error' ? 'error' : ann[1] === 'warning' ? 'warn' : ann[1] === 'debug' ? 'debug' : 'info';
      const props: Record<string, string> = {};
      (ann[2] ?? '')
        .split(',')
        .filter(Boolean)
        .forEach((kv) => {
          const eq = kv.indexOf('=');
          if (eq > 0) props[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
        });
      props.annotation = ann[1];
      inputs = props;
      const loc = props.file ? ` in ${props.file}${props.line ? `:${props.line}` : ''}` : '';
      description = `GitHub Actions ${ann[1]} annotation${loc}: ${ann[3].trim()}`;
    } else if (/^##\[error\]/.test(rest)) level = 'error';
    else if (/^##\[warning\]/.test(rest)) level = 'warn';
    else if (/^##\[debug\]/.test(rest)) level = 'debug';

    pushLine(cur, line, n, { level, description, inputs });
  });
  // The runner's last line marks a completed job; otherwise the final stage is still streaming.
  const last = steps[steps.length - 1];
  if (last && last.status === 'running' && /Cleaning up orphan processes/.test(raw)) closeStep(last);
  return finalizeSteps(steps);
}

/* ------------------------------ Azure DevOps ------------------------------ */

export function parseAzure(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;
  let loose: LogStep | null = null;

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const { timestamp, rest } = splitTimestamp(c);

    const st = rest.match(/^##\[section\]Starting:\s*(.*)$/);
    if (st) {
      if (cur) closeStep(cur, undefined, timestamp);
      cur = createStep(`azure-${steps.length}`, st[1].trim() || 'Task', 'azure', { status: 'running', startTime: timestamp });
      steps.push(cur);
      loose = null;
      pushLine(cur, line, n);
      return;
    }
    const fin = rest.match(/^##\[section\]Finishing:\s*(.*)$/);
    if (fin) {
      if (cur) {
        pushLine(cur, line, n);
        closeStep(cur, undefined, timestamp);
        cur = null;
      }
      return;
    }
    if (/^={5,}$/.test(rest.trim())) return;

    let target = cur;
    if (!target) {
      if (!loose) {
        loose = createStep(`azure-output-${steps.length}`, steps.length ? 'Pipeline output' : 'Pipeline setup', 'azure');
        steps.push(loose);
      }
      target = loose;
    }
    let level: LogLevel | undefined;
    let inputs: Record<string, string> | undefined;
    const meta = rest.match(/^(Task|Description|Version|Author|Help)\s*:\s*(.*)$/);
    if (meta) {
      target.metadata = { ...(target.metadata ?? {}), [meta[1].toLowerCase()]: meta[2].trim() };
      inputs = { [meta[1]]: meta[2].trim() };
    }
    if (/^##\[error\]/.test(rest)) level = 'error';
    else if (/^##\[warning\]/.test(rest)) level = 'warn';
    else if (/^##\[debug\]/.test(rest)) level = 'debug';
    pushLine(target, line, n, { level, inputs });
  });
  return finalizeSteps(steps);
}

/* --------------------------------- Jenkins -------------------------------- */

export function parseJenkins(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;
  let loose: LogStep | null = null;

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const { timestamp, rest } = splitTimestamp(c);
    const text = rest.trim();

    const start = text.match(/^\[Pipeline\]\s*\{\s*\((.+)\)\s*$/);
    if (start) {
      if (cur) closeStep(cur, undefined, timestamp);
      cur = createStep(`jenkins-${steps.length}`, start[1], 'jenkins', { status: 'running', startTime: timestamp });
      steps.push(cur);
      loose = null;
      pushLine(cur, line, n, { level: 'debug' });
      return;
    }
    if (/^\[Pipeline\]\s*\/\/\s*stage\b/.test(text)) {
      if (cur) {
        pushLine(cur, line, n, { level: 'debug' });
        closeStep(cur, undefined, timestamp);
        cur = null;
      }
      return;
    }
    const skipped = text.match(/^Stage "(.+)" skipped due to (.*)$/);
    if (skipped && cur) {
      cur.status = 'skipped';
      cur.metadata = { ...(cur.metadata ?? {}), skipped: skipped[2] };
      pushLine(cur, line, n, { level: 'info', description: `Stage skipped because: ${skipped[2]}` });
      return;
    }
    const fin = text.match(/^Finished:\s*(\w+)/);
    let target = cur;
    // Structural `[Pipeline]` bookkeeping lines and the final result belong with the last stage.
    if (!target && steps.length && (/^\[Pipeline\]/.test(text) || fin)) target = steps[steps.length - 1];
    if (!target) {
      if (!loose) {
        loose = createStep(`jenkins-output-${steps.length}`, steps.length ? 'Pipeline output' : 'Pipeline setup', 'jenkins');
        steps.push(loose);
      }
      target = loose;
    }
    const level: LogLevel | undefined = /^\[Pipeline\]/.test(text) ? 'debug' : undefined;
    pushLine(target, line, n, { level });
    if (fin) {
      if (fin[1] === 'FAILURE') target.status = 'failed';
      else if (fin[1] === 'SUCCESS' && target.status === 'running') target.status = 'success';
    }
  });
  return finalizeSteps(steps);
}
