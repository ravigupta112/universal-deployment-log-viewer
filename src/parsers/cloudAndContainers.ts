import type { LogLevel, LogStep } from '../types';
import {
  closeStep,
  createStep,
  finalizeSteps,
  normalizeTs,
  pushLine,
  splitLines,
  stripAnsi,
  tryParseJson,
} from './structured';

/* ------------------------------ Docker Buildx ----------------------------- */

export function parseDocker(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  const byId = new Map<string, LogStep>();
  let loose: LogStep | null = null;

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;
    const m = c.match(/^#(\d+)\s+(.*)$/);
    if (!m) {
      if (!loose) {
        loose = createStep(`docker-output-${steps.length}`, 'Build output', 'docker');
        steps.push(loose);
      }
      pushLine(loose, line, n);
      return;
    }
    const id = m[1];
    const rest = m[2];
    let step = byId.get(id);
    if (!step) {
      step = createStep(`docker-${id}`, rest.trim() || `Step #${id}`, 'docker', { metadata: { step: `#${id}` } });
      byId.set(id, step);
      steps.push(step);
      const sm = rest.match(/^\[(?:([\w.-]+)\s+)?(\d+\/\d+)\]\s*(.*)$/);
      if (sm) {
        step.metadata = { ...step.metadata, stage: sm[1] ?? 'default', progress: sm[2] };
      }
      const cmd = rest.match(/\]\s*(?:RUN|CMD|ENTRYPOINT)\s+(.*)$/);
      pushLine(step, line, n, { text: rest, commandText: cmd ? cmd[1] : undefined, level: 'info' });
      return;
    }
    let text = rest;
    let elapsed: string | undefined;
    const em = rest.match(/^(\d+\.\d+)\s+(.*)$/);
    if (em) {
      elapsed = `${em[1]}s`;
      text = em[2];
    }
    const done = rest.match(/^DONE\s+([\d.]+)s/);
    if (done) {
      step.duration = Math.round(parseFloat(done[1]) * 1000);
      if (step.status !== 'failed') step.status = 'success';
    } else if (/^CACHED\b/.test(rest)) {
      step.metadata = { ...step.metadata, cache: 'hit' };
      if (step.status === 'pending') step.status = 'success';
    } else if (/^ERROR\b/.test(rest)) {
      step.status = 'failed';
    } else if (/^CANCELED\b/.test(rest)) {
      step.status = 'skipped';
    }
    pushLine(step, line, n, { text, inputs: elapsed ? { elapsed } : undefined });
  });
  return finalizeSteps(steps);
}

/* -------------------------------- Kubernetes ------------------------------ */

const SEVERE_REASONS = /^(BackOff|Failed\w*|Err\w+|OOMKill\w*|Evicted|ImagePullBackOff|CrashLoopBackOff)$/;

export function parseKubernetes(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  const buckets = new Map<string, LogStep>();
  const bucket = (key: string, title: string, meta?: Record<string, string>) => {
    let s = buckets.get(key);
    if (!s) {
      s = createStep(`k8s-${steps.length}`, title, 'kubernetes', { metadata: meta ?? {} });
      buckets.set(key, s);
      steps.push(s);
    }
    return s;
  };

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;

    if (/^\s*(Events:|Type\s+Reason\s+Age|LAST SEEN\s+TYPE|-{2,}\s+-{2,})/.test(c)) {
      pushLine(bucket('events', 'Events'), line, n, { level: 'info' });
      return;
    }
    const ev = c.match(/^\s*(Normal|Warning)\s+(\w+)\s+(\S+(?:\s\(x\d+ over \S+\))?)\s+(\S+)\s+(.*)$/);
    if (ev) {
      const level: LogLevel = ev[1] === 'Warning' ? (SEVERE_REASONS.test(ev[2]) ? 'error' : 'warn') : 'info';
      pushLine(bucket('events', 'Events'), line, n, {
        level,
        inputs: { type: ev[1], reason: ev[2], age: ev[3], from: ev[4] },
      });
      return;
    }
    const apply = c.match(/^([\w.\-]+\/[\w.\-]+)\s+(created|configured|unchanged|deleted|patched|pruned|image updated)(\s+\(.*\))?$/);
    if (apply) {
      pushLine(bucket('apply', 'kubectl apply'), line, n, {
        level: 'info',
        inputs: { resource: apply[1], action: apply[2] },
        description: `kubectl ${apply[2]} ${apply[1]}.`,
      });
      return;
    }
    if (
      /^(Waiting for (deployment|statefulset|daemon set)|(deployment|statefulset|daemon set) ".+" successfully rolled out|\d+ (of|out of) \d+ (updated|new) replicas|Waiting for rollout|error: .*progress deadline)/i.test(
        c,
      )
    ) {
      pushLine(bucket('rollout', 'Rollout status'), line, n);
      return;
    }
    const pm = c.match(/^\[(pod\/[^/\]]+)(?:\/([^\]]+))?\]\s?(.*)$/);
    if (pm) {
      const pod = pm[1].replace('pod/', '');
      const container = pm[2] ?? '';
      const step = bucket(`${pod}/${container}`, container ? `${pod} \u00b7 ${container}` : pod, {
        pod,
        ...(container ? { container } : {}),
      });
      pushLine(step, line, n, {
        text: pm[3],
        inputs: { pod, ...(container ? { container } : {}) },
      });
      return;
    }
    const text = c.replace(/^(\S+Z)\s+(?:stdout|stderr)\s+[FP]\s/, '$1 ');
    pushLine(bucket('logs', 'Container logs'), line, n, { text });
  });
  return finalizeSteps(steps);
}

/* ---------------------------------- Helm ---------------------------------- */

export function parseHelm(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  const summary = createStep('helm-summary', 'Release summary', 'helm');
  steps.push(summary);
  let cur = summary;
  const SECTIONS: Record<string, string> = {
    HOOKS: 'Hooks',
    MANIFEST: 'Manifest',
    NOTES: 'Notes',
    'USER-SUPPLIED VALUES': 'Values',
    'COMPUTED VALUES': 'Values',
  };

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;

    const sec = c.match(/^([A-Z][A-Z -]+):\s*$/);
    if (sec && SECTIONS[sec[1]]) {
      cur = createStep(`helm-${steps.length}-${sec[1].toLowerCase().replace(/[^a-z]+/g, '-')}`, SECTIONS[sec[1]], 'helm');
      steps.push(cur);
      pushLine(cur, line, n, { level: 'info' });
      return;
    }
    const kv = c.match(/^(NAME|LAST DEPLOYED|NAMESPACE|STATUS|REVISION|TEST SUITE|CHART|APP VERSION):\s*(.*)$/);
    if (kv && cur === summary) {
      summary.metadata = { ...(summary.metadata ?? {}), [kv[1].toLowerCase().replace(/ /g, '_')]: kv[2].trim() };
      if (kv[1] === 'STATUS') {
        const st = kv[2].trim().toLowerCase();
        if (st === 'failed') summary.status = 'failed';
        else if (st.startsWith('pending')) summary.status = 'running';
        else summary.status = 'success';
      }
      pushLine(summary, line, n, { inputs: { [kv[1]]: kv[2].trim() }, level: kv[1] === 'STATUS' && /failed/i.test(kv[2]) ? 'error' : 'info' });
      return;
    }
    const inputs: Record<string, string> = {};
    let m: RegExpMatchArray | null;
    if ((m = c.match(/helm\.sh\/hook"?:\s*"?([\w,\-]+)/))) inputs.hook = m[1];
    if ((m = c.match(/helm\.sh\/hook-weight"?:\s*"?(-?\d+)/))) inputs.hookWeight = m[1];
    if ((m = c.match(/helm\.sh\/hook-delete-policy"?:\s*"?([\w,\-]+)/))) inputs.deletePolicy = m[1];
    if ((m = c.match(/^#\s*Source:\s*(\S+)/))) inputs.source = m[1];
    if ((m = c.match(/^kind:\s*(\S+)/))) inputs.kind = m[1];
    if ((m = c.match(/^Release "([^"]+)"/))) inputs.release = m[1];
    pushLine(cur, line, n, { inputs: Object.keys(inputs).length ? inputs : undefined });
  });
  return finalizeSteps(steps);
}

/* ----------------------------------- AWS ---------------------------------- */

const CODEBUILD = /^\[Container\]\s+(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+(.*)$/;

export function parseAws(raw: string): LogStep[] {
  const steps: LogStep[] = [];
  let cur: LogStep | null = null;
  const streams = new Map<string, LogStep>();

  splitLines(raw).forEach((line, i) => {
    const n = i + 1;
    const c = stripAnsi(line).replace(/\r/g, '');
    if (!c.trim()) return;

    // CloudWatch Logs events: {"timestamp":..., "message":..., "logStreamName":...}
    const js = tryParseJson(c);
    if (js && typeof js === 'object' && !Array.isArray(js)) {
      const o = js as Record<string, unknown>;
      const stream = (o.logStreamName ?? o['@logStream']) as string | undefined;
      if (stream) {
        let s = streams.get(stream);
        if (!s) {
          s = createStep(`aws-${steps.length}`, stream, 'aws', {
            metadata: {
              ...(o.logGroupName || o['@log'] ? { logGroup: String(o.logGroupName ?? o['@log']) } : {}),
              logStream: stream,
            },
          });
          streams.set(stream, s);
          steps.push(s);
        }
        const msg = typeof o.message === 'string' ? o.message : typeof o['@message'] === 'string' ? (o['@message'] as string) : '';
        pushLine(s, line, n, {
          timestamp: normalizeTs(o.timestamp ?? o['@timestamp']),
          level: msg ? undefined : 'info',
          description: `CloudWatch Logs event from stream ${stream}.`,
        });
        return;
      }
    }

    const cb = c.match(CODEBUILD);
    if (cb) {
      const ts = `${cb[1]}-${cb[2]}-${cb[3]}T${cb[4]}Z`;
      const msg = cb[5];
      const enter = msg.match(/^(?:Entering phase|Phase is)\s+(\w+)/);
      if (enter) {
        if (!cur || cur.metadata?.phase !== enter[1]) {
          if (cur && cur.status === 'running') closeStep(cur, undefined, ts);
          cur = createStep(`aws-${steps.length}-${enter[1].toLowerCase()}`, enter[1], 'aws', {
            status: 'running',
            startTime: ts,
            metadata: { phase: enter[1] },
          });
          steps.push(cur);
        }
        pushLine(cur, line, n, { text: msg, timestamp: ts });
        return;
      }
      if (!cur) {
        cur = createStep(`aws-${steps.length}-provisioning`, 'Provisioning', 'aws', { status: 'running', startTime: ts });
        steps.push(cur);
      }
      const done = msg.match(/^Phase complete:\s*(\w+)\s+State:\s*(\w+)/);
      const cmd = msg.match(/^Running command\s+(.*)$/);
      pushLine(cur, line, n, { text: msg, timestamp: ts, commandText: cmd ? cmd[1] : undefined });
      if (done) {
        cur.metadata = { ...(cur.metadata ?? {}), state: done[2] };
        closeStep(cur, done[2] === 'SUCCEEDED' ? 'success' : done[2] === 'FAILED' ? 'failed' : undefined, ts);
      }
      return;
    }

    // ECS / EKS task output and anything else: keep with the current phase or a generic bucket.
    if (!cur) {
      cur = createStep(`aws-${steps.length}-task`, 'Task output', 'aws', { status: 'running' });
      steps.push(cur);
    }
    pushLine(cur, line, n);
  });
  return finalizeSteps(steps);
}
