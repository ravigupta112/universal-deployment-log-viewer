import type { LogLevel, LogStep, ResolvedLogSource } from '../types';
import {
  closeStep,
  createStep,
  finalizeSteps,
  parseLogfmt,
  pushLine,
  splitLines,
  stripAnsi,
  tryParseJson,
} from './structured';

function makeBuckets(source: ResolvedLogSource) {
  const steps: LogStep[] = [];
  const map = new Map<string, LogStep>();
  const get = (key: string, title: string, init: Partial<LogStep> = {}) => {
    let s = map.get(key);
    if (!s) {
      s = createStep(`${source}-${steps.length}`, title, source, init);
      map.set(key, s);
      steps.push(s);
    }
    return s;
  };
  return { steps, map, get };
}

/* ------------------------------ GCP Cloud Build ---------------------------- */

export function parseGcpCloudBuild(raw: string): LogStep[] {
  const { steps, get } = makeBuckets('gcp');
  let started = false;
  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const marker = c.match(/^(Starting|Finished) Step #(\d+) - "([^"]*)"\s*$/);
    const out = c.match(/^Step #(\d+) - "([^"]*)":\s?(.*)$/);
    if (marker || out) {
      const num = marker ? marker[2] : out![1];
      const name = marker ? marker[3] : out![2];
      const step = get(`s${num}`, `${name} (#${num})`, { metadata: { step: `#${num}`, builder: name } });
      started = true;
      if (marker && marker[1] === 'Starting' && step.status === 'pending') step.status = 'running';
      pushLine(step, line, n, { text: out ? out[3] : c });
      if (marker && marker[1] === 'Finished') closeStep(step);
      return;
    }
    const target = started ? get('result', 'Build result') : get('setup', 'Fetch source');
    pushLine(target, line, n);
  });
  return finalizeSteps(steps);
}

/* -------------------------------- Buildkite -------------------------------- */

export function parseBuildkite(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;
  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const hdr = c.match(/^(~~~|---|\+\+\+)\s+(.*)$/);
    if (hdr) {
      const title = hdr[2].replace(/:[\w+-]+:\s*/g, '').trim() || hdr[2];
      cur = createStep(`buildkite-${steps.length}`, title, 'buildkite', { metadata: { expanded: String(hdr[1] === '+++') } });
      steps.push(cur);
      pushLine(cur, line, n, { level: 'info' });
      return;
    }
    if (/^\^\^\^\s+\+\+\+/.test(c)) return;
    if (!cur) {
      cur = createStep('buildkite-setup', 'Setup', 'buildkite');
      steps.push(cur);
    }
    pushLine(cur, line, n);
  });
  return finalizeSteps(steps);
}

/* -------------------------------- TeamCity --------------------------------- */

const tcUnescape = (s: string) => s.replace(/\|(n|r|'|\||\[|\])/g, (_m, ch: string) => (ch === 'n' ? '\n' : ch === 'r' ? '\r' : ch));

function tcAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)='((?:[^'|]|\|.)*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = tcUnescape(m[2]);
  return out;
}

export function parseTeamCity(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  const open: LogStep[] = [];
  let loose: LogStep | null = null;
  const current = () => (open.length ? open[open.length - 1] : null);

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const sm = c.match(/##teamcity\[(\w+)\s*(.*)\]\s*$/);
    if (sm) {
      const type = sm[1];
      const attrs = tcAttrs(sm[2]);
      if (type === 'blockOpened') {
        const s = createStep(`teamcity-${steps.length}`, attrs.name || 'Block', 'teamcity', {
          status: 'running',
          metadata: attrs.description ? { description: attrs.description } : {},
        });
        steps.push(s);
        open.push(s);
        loose = null;
        pushLine(s, line, n, { text: `Block opened: ${attrs.name}${attrs.description ? ` - ${attrs.description}` : ''}`, inputs: attrs, jsonPayload: { type, ...attrs } });
        return;
      }
      if (type === 'blockClosed') {
        const idx = open.map((s) => s.title).lastIndexOf(attrs.name);
        const s = idx >= 0 ? open.splice(idx, 1)[0] : current();
        if (s) {
          pushLine(s, line, n, { text: `Block closed: ${attrs.name}`, level: 'debug', inputs: attrs, jsonPayload: { type, ...attrs } });
          closeStep(s);
        }
        return;
      }
      let text = `${type}${attrs.name ? `: ${attrs.name}` : ''}`;
      let level: LogLevel | undefined;
      if (type === 'message') {
        text = attrs.text ?? '';
        const st = (attrs.status || 'NORMAL').toUpperCase();
        level = st === 'ERROR' || st === 'FAILURE' ? 'error' : st === 'WARNING' ? 'warn' : 'info';
      } else if (type === 'testStarted') text = `Test started: ${attrs.name}`;
      else if (type === 'testFinished') text = `Test finished: ${attrs.name}${attrs.duration ? ` (${attrs.duration}ms)` : ''}`;
      else if (type === 'testFailed') {
        text = `Test failed: ${attrs.name}${attrs.message ? ` - ${attrs.message}` : ''}`;
        level = 'error';
      } else if (type === 'testIgnored') text = `Test ignored: ${attrs.name}`;
      else if (type === 'buildProblem') {
        text = `Build problem: ${attrs.description ?? ''}`;
        level = 'error';
      } else if (type === 'buildStatus') {
        text = `Build status ${attrs.status ?? ''}${attrs.text ? `: ${attrs.text}` : ''}`;
        level = /FAIL/i.test(attrs.status ?? '') ? 'error' : 'info';
      }
      let target = current();
      if (!target) {
        if (!loose) {
          loose = createStep(`teamcity-output-${steps.length}`, steps.length ? 'Build output' : 'Build setup', 'teamcity');
          steps.push(loose);
        }
        target = loose;
      }
      pushLine(target, line, n, { text, level, inputs: attrs, jsonPayload: { type, ...attrs } });
      return;
    }
    // Plain line, optionally prefixed with `[hh:mm:ss]E:` / `W:` / `i:` and `[Step 1/3]`.
    let text = c;
    let level: LogLevel | undefined;
    const pm = c.match(/^\[(\d{2}:\d{2}:\d{2})\]([EWi]?):?\s?(?:\[Step \d+\/\d+\]\s*)?/);
    if (pm) {
      text = c.slice(pm[0].length);
      if (pm[2] === 'E') level = 'error';
      else if (pm[2] === 'W') level = 'warn';
    }
    let target = current();
    if (!target) {
      if (!loose) {
        loose = createStep(`teamcity-output-${steps.length}`, steps.length ? 'Build output' : 'Build setup', 'teamcity');
        steps.push(loose);
      }
      target = loose;
    }
    pushLine(target, line, n, { text, level, inputs: pm ? { time: pm[1] } : undefined });
  });
  return finalizeSteps(steps);
}

/* --------------------------- Terraform / OpenTofu -------------------------- */

const TF_RESOURCE = /^((?:module\.[\w\-[\]"']+\.)*[a-z][\w]*\.[\w\-[\]"'.]+):\s+(.*)$/;
const TF_RESOURCE_ACTIONS = /^(Creating|Modifying|Destroying|Still \w+|Creation complete|Modifications complete|Destruction complete|Provisioning|Importing|Import complete)/;
const TF_PLAN_RE = /^Terraform used the selected providers|^Terraform will perform|^\s*# \S+ (?:will|must) be|Refreshing state|^Acquiring state lock|^No changes\.|^Changes to Outputs|^Note: Objects have changed/;

export function parseTerraform(raw: string): LogStep[] {
  const { steps, map, get } = makeBuckets('terraform');
  let section: 'init' | 'plan' | 'apply' | 'summary' = 'init';
  const titles = { init: 'Init', plan: 'Plan', apply: 'Apply', summary: 'Summary' } as const;
  const errorText: string[] = [];

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;

    if (/^[╷│╵]/.test(c) || /^Error:/.test(c)) {
      errorText.push(c);
      pushLine(get('errors', 'Errors'), line, n, { level: /Error:/.test(c) ? 'error' : 'info' });
      return;
    }
    const res = c.match(TF_RESOURCE);
    if (res && TF_RESOURCE_ACTIONS.test(res[2])) {
      const step = get(`res:${res[1]}`, res[1], { metadata: { resource: res[1] } });
      const action = res[2].split(/\.\.\.| after| \[/)[0];
      pushLine(step, line, n, { inputs: { resource: res[1], action } });
      const done = res[2].match(/complete after (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
      if (done) {
        step.duration = (Number(done[1] || 0) * 3600 + Number(done[2] || 0) * 60 + Number(done[3] || 0)) * 1000;
        step.status = 'success';
      }
      const id = res[2].match(/\[id=([^\]]+)\]/);
      if (id) step.metadata = { ...(step.metadata ?? {}), id: id[1] };
      return;
    }
    if (/^(Apply|Destroy) complete!|^Outputs:/.test(c)) section = 'summary';
    else if (TF_PLAN_RE.test(c)) section = 'plan';
    else if (/^Do you want to perform|^Enter a value/.test(c)) section = 'apply';

    const pl = c.match(/^\s*# (\S+) (?:will|must) be (.+)$/);
    pushLine(get(section, titles[section]), line, n, { inputs: pl ? { address: pl[1], action: pl[2] } : undefined });
    if (/^Plan: /.test(c)) section = 'apply';
  });

  const errs = errorText.join('\n');
  const re = /with ([^\s,]+),/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(errs))) {
    const s = map.get(`res:${m[1]}`);
    if (s && s.status !== 'success') s.status = 'failed';
  }
  return finalizeSteps(steps);
}

/* ---------------------------------- Ansible -------------------------------- */

const ANSIBLE_RESULT = /^(ok|changed|fatal|skipping|failed|unreachable|included)(?::\s|\s)\[([^\]]+)\](?::\s(FAILED!|UNREACHABLE!))?(?:\s*=>\s*(.*))?$/;

export function parseAnsible(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;
  let play = '';
  let pending: { line: string; n: number } | null = null;
  const tally = new Map<string, { active: number; skipped: number }>();

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;

    const pm = c.match(/^PLAY \[(.*)\]\s*\*+\s*$/);
    if (pm) {
      play = pm[1];
      pending = { line, n };
      return;
    }
    const tm = c.match(/^(TASK|RUNNING HANDLER|PLAY RECAP)\s*(?:\[(.*)\])?\s*\*+\s*$/);
    if (tm) {
      const recap = tm[1] === 'PLAY RECAP';
      let title = recap ? 'Play recap' : (tm[2] ?? 'Task');
      let role: string | undefined;
      const rm = title.match(/^(.+?) : (.+)$/);
      if (rm) {
        role = rm[1];
        title = rm[2];
      }
      cur = createStep(`ansible-${steps.length}`, title, 'ansible', {
        metadata: { ...(play ? { play } : {}), ...(role ? { role } : {}), kind: tm[1].toLowerCase() },
      });
      steps.push(cur);
      tally.set(cur.id, { active: 0, skipped: 0 });
      if (pending) {
        pushLine(cur, pending.line, pending.n, { level: 'info' });
        pending = null;
      }
      pushLine(cur, line, n, { level: 'info' });
      return;
    }
    if (!cur) {
      cur = createStep('ansible-setup', 'Playbook', 'ansible');
      steps.push(cur);
      tally.set(cur.id, { active: 0, skipped: 0 });
    }
    const recap = c.match(/^(\S+)\s*:\s+(ok=\d+.*)$/);
    if (recap) {
      const kv = parseLogfmt(recap[2]) ?? {};
      const bad = Number(kv.failed || 0) > 0 || Number(kv.unreachable || 0) > 0;
      pushLine(cur, line, n, {
        level: bad ? 'error' : 'info',
        inputs: { host: recap[1], ...kv },
        description: `Recap for ${recap[1]}: ${kv.ok ?? 0} ok, ${kv.changed ?? 0} changed, ${kv.failed ?? 0} failed, ${kv.unreachable ?? 0} unreachable.`,
      });
      return;
    }
    const rm = c.match(ANSIBLE_RESULT);
    if (rm) {
      const kind = rm[1];
      const payload = rm[4] ? tryParseJson(rm[4]) : undefined;
      const inputs: Record<string, string> = { host: rm[2], result: rm[3] ? rm[3].replace('!', '') : kind };
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        for (const k of ['msg', 'rc', 'cmd', 'dest', 'stderr', 'stdout']) {
          const v = (payload as Record<string, unknown>)[k];
          if (v !== undefined && v !== null && typeof v !== 'object') inputs[k] = String(v).slice(0, 300);
        }
      }
      const bad = kind === 'fatal' || kind === 'failed' || kind === 'unreachable';
      const t = tally.get(cur.id)!;
      if (kind === 'skipping') t.skipped++;
      else t.active++;
      pushLine(cur, line, n, { level: bad ? 'error' : undefined, inputs, jsonPayload: payload });
      return;
    }
    pushLine(cur, line, n, { level: /^\.\.\.ignoring/.test(c) ? 'warn' : undefined });
  });
  steps.forEach((s) => {
    const t = tally.get(s.id);
    if (t && t.skipped > 0 && t.active === 0 && !s.lines.some((l) => l.level === 'error')) s.status = 'skipped';
  });
  return finalizeSteps(steps);
}

/* ------------------------------ Docker Compose ----------------------------- */

export function parseCompose(raw: string): LogStep[] {
  const { steps, get } = makeBuckets('compose');
  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const pm = c.match(/^([\w.\-]+?)\s+\|\s?(.*)$/);
    if (pm) {
      const name = pm[1];
      const service = name.replace(/[-_]\d+$/, '');
      const step = get(`svc:${name}`, name, { metadata: { service, container: name } });
      pushLine(step, line, n, { text: pm[2], inputs: { service, container: name } });
      return;
    }
    const ex = c.match(/^([\w.\-]+?)\s+exited with code (\d+)/);
    if (ex) {
      const step = get(`svc:${ex[1]}`, ex[1], { metadata: { service: ex[1].replace(/[-_]\d+$/, ''), container: ex[1] } });
      pushLine(step, line, n, { level: ex[2] === '0' ? 'info' : 'error', inputs: { exitCode: ex[2] } });
      step.status = ex[2] === '0' ? 'success' : 'failed';
      return;
    }
    const lc = c.match(/^\s*(?:[✔✘!]\s*)?(Container|Network|Volume)\s+(\S+)\s+(\w+)/);
    const inputs = lc ? { type: lc[1], name: lc[2], state: lc[3] } : undefined;
    pushLine(get('lifecycle', 'Compose lifecycle'), line, n, {
      inputs,
      level: /^\s*✘|Error|Failed/.test(c) ? 'error' : undefined,
    });
  });
  return finalizeSteps(steps);
}
