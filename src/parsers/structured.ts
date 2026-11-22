import type { LogLevel, LogLine, LogStep, ResolvedLogSource, StepStatus } from '../types';

/* -------------------------------------------------------------------------- */
/* Primitive helpers                                                          */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

const TS_RE = /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s?/;

export function splitTimestamp(text: string): { timestamp?: string; rest: string } {
  const m = text.match(TS_RE);
  if (!m) return { rest: text };
  return { timestamp: m[1].replace(',', '.'), rest: text.slice(m[0].length) };
}

export function splitLines(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').split('\n');
}

export function isoFromSeconds(sec: number): string {
  return new Date(sec * 1000).toISOString();
}

export function normalizeTs(t: unknown): string | undefined {
  if (typeof t === 'number' && isFinite(t)) {
    return new Date(t < 1e12 ? t * 1000 : t).toISOString();
  }
  if (typeof t === 'string' && t.trim()) return t;
  return undefined;
}

export function tryParseJson(text: string): unknown | undefined {
  const t = text.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export function normalizeLevel(v: unknown): LogLevel | undefined {
  if (typeof v === 'number') {
    if (v >= 60) return 'fatal';
    if (v >= 50) return 'error';
    if (v >= 40) return 'warn';
    if (v >= 30) return 'info';
    return 'debug';
  }
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (/^(fatal|panic|crit|emerg|alert)/.test(s)) return 'fatal';
  if (/^(err|severe)/.test(s)) return 'error';
  if (/^warn/.test(s)) return 'warn';
  if (/^(debug|trace|verbose)/.test(s)) return 'debug';
  if (/^(info|notice|log)/.test(s)) return 'info';
  return undefined;
}

export function detectLevel(text: string): LogLevel {
  if (/\b(fatal|panic)\b/i.test(text)) return 'fatal';
  if (
    /##\[error\]|::error|\berror\b|\bERR\b|\bfailed\b|\bfailure\b|\bexception\b|\bexit (?:code|status):? [1-9]|\bOOMKilled\b|\bCrashLoopBackOff\b/i.test(
      text,
    ) &&
    !/\b(0|no) (errors?|failed|failures?)\b|error[- ]?free/i.test(text)
  ) {
    return 'error';
  }
  if (/##\[warning\]|::warning|\bwarn(?:ing)?\b|\bdeprecated\b/i.test(text)) return 'warn';
  if (/##\[debug\]|::debug|\[debug\]|\bdebug\b|\btrace\b/i.test(text)) return 'debug';
  return 'info';
}

/* -------------------------------------------------------------------------- */
/* logfmt + command parsing                                                   */
/* -------------------------------------------------------------------------- */

const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2');

export function parseLogfmt(text: string): Record<string, string> | undefined {
  const re = /([A-Za-z_][\w.\-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;
  const out: Record<string, string> = {};
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out[m[1]] = unquote(m[2]);
    count++;
  }
  return count >= 2 ? out : undefined;
}

const IMAGE_BINS = /^(docker|helm|kubectl|podman|buildah|oc)$/;
const VALUE_SHORT_FLAGS = /^-[tfnpevwcouHN]$/;

/**
 * Extracts `{ command, args, --flags, image }` from a shell command line.
 * Only runs when the line carries an explicit command marker (`$ `, `+ `, `##[command]`,
 * `Running command`) or when `forceExplicit` is set (e.g. a Dockerfile RUN instruction).
 */
export function parseCommand(text: string, forceExplicit = false): Record<string, string> | undefined {
  let t = text.trim();
  let explicit = forceExplicit;
  if (!explicit) {
    const prefixes = [/^##\[command\]/, /^\[command\]/, /^Running command\s+/i, /^\$\s+/, /^\+\+\s+/, /^\+\s+/];
    for (const p of prefixes) {
      const m = t.match(p);
      if (m) {
        t = t.slice(m[0].length);
        explicit = true;
        break;
      }
    }
  }
  if (!explicit) return undefined;
  const tokens = t.match(/"[^"]*"|'[^']*'|\S+/g);
  if (!tokens || !tokens.length) return undefined;
  const bin = tokens[0].replace(/^.*\//, '');
  if (!/^[A-Za-z][\w.-]*$/.test(bin)) return undefined;

  const inputs: Record<string, string> = { command: bin };
  const args: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith('--') && tok.length > 2) {
      const eq = tok.indexOf('=');
      if (eq > 0) {
        inputs[tok.slice(0, eq)] = unquote(tok.slice(eq + 1));
      } else {
        const next = tokens[i + 1];
        if (next && !next.startsWith('-')) {
          inputs[tok] = unquote(next);
          i++;
        } else inputs[tok] = 'true';
      }
    } else if (tok.startsWith('-') && tok.length > 1 && !/^-\d/.test(tok)) {
      const next = tokens[i + 1];
      if (VALUE_SHORT_FLAGS.test(tok) && next && !next.startsWith('-')) {
        inputs[tok] = unquote(next);
        i++;
      } else inputs[tok] = 'true';
    } else args.push(unquote(tok));
  }
  if (args.length) inputs.args = args.join(' ');
  if (IMAGE_BINS.test(bin)) {
    const img = tokens
      .map(unquote)
      .find((a) => !a.startsWith('-') && /^[\w.\-]+(?:\/[\w.\-]+)*:[\w.\-]+$/.test(a));
    if (img) inputs.image = img;
  }
  return inputs;
}

/* -------------------------------------------------------------------------- */
/* Descriptions                                                               */
/* -------------------------------------------------------------------------- */

const K8S_REASONS: Record<string, string> = {
  CrashLoopBackOff: 'The container keeps crashing; Kubernetes is waiting longer between each restart. Check the previous container logs (kubectl logs --previous).',
  BackOff: 'Kubernetes is delaying restarts of a repeatedly failing container (typically CrashLoopBackOff).',
  ImagePullBackOff: 'The image could not be pulled and Kubernetes is retrying with back-off. Verify the image name, tag and registry credentials.',
  ErrImagePull: 'Pulling the container image failed. Verify the image name, tag and imagePullSecrets.',
  OOMKilled: 'The container exceeded its memory limit and was killed by the kernel. Raise resources.limits.memory or fix the leak.',
  OOMKilling: 'The node killed a process because the container exceeded its memory limit.',
  Evicted: 'The pod was evicted from its node, usually due to resource pressure (memory, disk or PIDs).',
  FailedScheduling: 'The scheduler could not find a node that satisfies the pod requirements (resources, taints, affinity).',
  FailedMount: 'A volume could not be mounted into the pod. Check PVC status, secrets and ConfigMaps.',
  Unhealthy: 'A liveness, readiness or startup probe failed.',
  Scheduled: 'The scheduler assigned the pod to a node.',
  Pulling: 'The kubelet is pulling the container image.',
  Pulled: 'The container image was pulled successfully (or was already present).',
  Created: 'The container was created.',
  Started: 'The container started.',
  Killing: 'The kubelet is stopping a container (rollout, probe failure or deletion).',
  ScalingReplicaSet: 'The Deployment controller scaled a ReplicaSet.',
  SuccessfulCreate: 'The controller created a pod.',
  Failed: 'A Kubernetes operation failed. See the message for details.',
};

export function k8sReasonText(reason: string): string | undefined {
  return K8S_REASONS[reason];
}

export function describeText(
  text: string,
  source: ResolvedLogSource,
  inputs: Record<string, string>,
  level: LogLevel,
): string | undefined {
  const t = text.trim();
  let m: RegExpMatchArray | null;

  if ((m = t.match(/^(Normal|Warning)\s+(\w+)\s+/))) {
    return `Kubernetes ${m[1]} event "${m[2]}". ${K8S_REASONS[m[2]] ?? ''}`.trim();
  }
  if ((m = t.match(/\b(CrashLoopBackOff|ImagePullBackOff|ErrImagePull|OOMKilled|Evicted|FailedScheduling|FailedMount)\b/))) {
    return K8S_REASONS[m[1]];
  }
  if (source === 'docker') {
    if (/^CACHED\b/.test(t)) return 'Layer was reused from the build cache - no work was needed for this step.';
    if ((m = t.match(/^DONE\s+([\d.]+s)/))) return `Build step finished in ${m[1]}.`;
    if (/^ERROR\b/.test(t)) return 'This build step failed. The Dockerfile instruction above did not complete.';
    if ((m = t.match(/naming to (\S+)/))) return `Final image tagged as ${m[1]}.`;
    if (/exporting (to image|layers)|writing image/.test(t)) return 'BuildKit is assembling and writing the final image.';
    if (/^\[internal\]/.test(t)) return 'Internal BuildKit step (context, metadata or Dockerfile loading).';
  }
  if ((m = t.match(/exit(?:ed)?(?: with)?(?: code| status)?[: ]+'?(\d+)/i))) {
    const code = Number(m[1]);
    return code === 0
      ? 'The process exited with code 0 (success).'
      : `The process exited with code ${code}, which indicates failure. Look at the output just above this line for the root cause.`;
  }
  if ((m = t.match(/Release "([^"]+)" has been (upgraded|installed|uninstalled)/))) {
    return `Helm release "${m[1]}" was ${m[2]} successfully.`;
  }
  if ((m = t.match(/^STATUS:\s*(\S+)/))) return `Helm release status is "${m[1]}".`;
  if (/UPGRADE FAILED|INSTALL FAILED/.test(t)) {
    return 'Helm could not apply the release. With --atomic Helm rolls back automatically; otherwise the release stays in a failed state.';
  }
  if (/helm\.sh\/hook/.test(t) || inputs.hook) {
    return `Helm lifecycle hook${inputs.hook ? ` (${inputs.hook})` : ''}: runs outside the normal release manifest at the given phase.`;
  }
  if ((m = t.match(/Starting delete for "([^"]+)"/))) return `Helm is deleting "${m[1]}" before re-creating it (hook delete policy).`;
  if ((m = t.match(/^\[Pipeline\]\s+(\S.*)$/))) return `Jenkins pipeline step: ${m[1]}.`;
  if ((m = t.match(/^Finished:\s*(\w+)/))) return `Jenkins build finished with result ${m[1]}.`;
  if ((m = t.match(/Phase complete:\s*(\w+)\s+State:\s*(\w+)/))) return `CodeBuild phase ${m[1]} completed with state ${m[2]}.`;
  if ((m = t.match(/Phase context status code:\s*(\S+)\s+Message:\s*(.*)/))) return `CodeBuild reported ${m[1]}: ${m[2]}`;
  if ((m = t.match(/^(?:Entering phase|Phase is)\s+(\w+)/))) return `CodeBuild entered the ${m[1]} phase.`;
  if ((m = t.match(/^Starting:\s*(.+)$/))) return `Azure Pipelines started "${m[1]}".`;
  if ((m = t.match(/^(?:##\[group\])?Run\s+(.+)$/))) return `GitHub Actions step: ${m[1]}.`;
  if (/Running with gitlab-runner/.test(t)) return 'GitLab Runner picked up the job.';
  if (/Job succeeded/.test(t)) return 'The GitLab job finished successfully.';
  if (/ERROR: Job failed/.test(t)) return 'The GitLab job failed. Check the exit code and the preceding output.';
  if (inputs.command) {
    const rest = Object.entries(inputs)
      .filter(([k]) => k !== 'command')
      .map(([k, v]) => (v === 'true' ? k : `${k} ${v}`))
      .join(' ');
    return `Runs "${inputs.command}${rest ? ' ' + rest : ''}". Flags and arguments were extracted into Input Parameters.`;
  }
  if (level === 'fatal') return 'A fatal condition was reported; execution cannot continue.';
  if (level === 'error') return 'This line was classified as an error. Review the surrounding output for the root cause.';
  if (level === 'warn') return 'This line was classified as a warning. It may not stop the run but deserves attention.';
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Line construction                                                          */
/* -------------------------------------------------------------------------- */

export interface LineHint {
  level?: LogLevel;
  timestamp?: string;
  /** Use this text for analysis instead of the raw line (prefix already stripped). */
  text?: string;
  /** Text that is known to be a shell command (no `$ ` prefix required). */
  commandText?: string;
  description?: string;
  inputs?: Record<string, string>;
}

const SKIP_KEYS = new Set(['level', 'severity', 'lvl', 'levelname', 'msg', 'message', 'time', 'timestamp', 'ts', '@timestamp']);

function scalarInputs(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP_KEYS.has(k) || v === null || v === undefined) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : String(v);
  }
  return out;
}

export function buildLine(
  raw: string,
  lineNumber: number,
  id: string,
  source: ResolvedLogSource,
  hint: LineHint = {},
): LogLine {
  const rawText = raw.replace(/\r/g, '');
  let clean = stripAnsi(hint.text ?? raw).replace(/\r/g, '').trimEnd();
  const ts = splitTimestamp(clean);
  const timestamp = hint.timestamp ?? ts.timestamp;
  if (ts.timestamp) clean = ts.rest;

  let inputs: Record<string, string> = {};
  let jsonPayload: unknown;
  let level = hint.level;
  let description = hint.description;
  let ts2: string | undefined;
  const tags: string[] = [source];

  const parsed = tryParseJson(clean);
  if (parsed && typeof parsed === 'object') {
    jsonPayload = parsed;
    tags.push('json');
    if (!Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      const msgRaw = o.msg ?? o.message ?? o.log ?? o.text;
      const msg = typeof msgRaw === 'string' ? msgRaw : undefined;
      level = level ?? normalizeLevel(o.level ?? o.severity ?? o.lvl ?? o.levelname) ?? (msg ? detectLevel(msg) : undefined);
      ts2 = normalizeTs(o.timestamp ?? o.time ?? o.ts ?? o['@timestamp']);
      inputs = scalarInputs(o);
      const tail = Object.entries(inputs)
        .filter(([, v]) => v.length <= 40)
        .slice(0, 4)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      if (msg) clean = tail ? `${msg}  ${tail}` : msg;
      description =
        description ??
        (msg ? describeText(msg, source, inputs, level ?? 'info') : undefined) ??
        `Structured log event${msg ? `: ${msg}` : ''}. Fields were extracted into Input Parameters.`;
    }
  } else {
    const lf = parseLogfmt(clean);
    if (lf && (lf.level || lf.msg || lf.message || lf.time || lf.ts)) {
      jsonPayload = lf;
      tags.push('logfmt');
      level = level ?? normalizeLevel(lf.level ?? lf.lvl);
      ts2 = normalizeTs(lf.time ?? lf.ts ?? lf.timestamp);
      inputs = Object.fromEntries(Object.entries(lf).filter(([k]) => !SKIP_KEYS.has(k)));
    } else {
      const cmd = parseCommand(hint.commandText ?? clean, !!hint.commandText);
      if (cmd) {
        inputs = cmd;
        tags.push('command');
      }
    }
  }
  if (hint.inputs) inputs = { ...inputs, ...hint.inputs };

  const finalLevel: LogLevel = level ?? detectLevel(clean);
  description = description ?? describeText(clean, source, inputs, finalLevel);
  if (finalLevel === 'error' || finalLevel === 'fatal') tags.push('error');

  return {
    id,
    lineNumber,
    timestamp: timestamp ?? ts2,
    level: finalLevel,
    rawText,
    cleanText: clean,
    description,
    inputs: Object.keys(inputs).length ? inputs : undefined,
    jsonPayload,
    tags,
  };
}

/* -------------------------------------------------------------------------- */
/* Step helpers                                                               */
/* -------------------------------------------------------------------------- */

export function createStep(
  id: string,
  title: string,
  source: ResolvedLogSource,
  init: Partial<LogStep> = {},
): LogStep {
  return { id, title, source, status: 'pending', metadata: {}, lines: [], ...init };
}

export function pushLine(step: LogStep, raw: string, lineNumber: number, hint?: LineHint): LogLine {
  const line = buildLine(raw, lineNumber, `${step.id}-L${lineNumber}`, step.source, hint);
  step.lines.push(line);
  return line;
}

export function deriveStatus(step: LogStep): StepStatus {
  if (!step.lines.length) return 'pending';
  return step.lines.some((l) => l.level === 'error' || l.level === 'fatal') ? 'failed' : 'success';
}

export function closeStep(step: LogStep, status?: StepStatus, endTime?: string): void {
  if (endTime) step.endTime = endTime;
  if (step.status === 'skipped') return;
  step.status = status ?? deriveStatus(step);
}

export function finalizeSteps(input: LogStep[]): LogStep[] {
  const steps = input.filter((s) => s.lines.length > 0);
  steps.forEach((s, i) => {
    if (!s.startTime || !s.endTime) {
      const ts = s.lines.map((l) => l.timestamp).filter(Boolean) as string[];
      if (ts.length) {
        if (!s.startTime) s.startTime = ts[0];
        if (!s.endTime && ts.length > 1) s.endTime = ts[ts.length - 1];
      }
    }
    if (s.duration == null && s.startTime && s.endTime) {
      const d = Date.parse(s.endTime) - Date.parse(s.startTime);
      if (Number.isFinite(d) && d >= 0) s.duration = d;
    }
    if (s.status === 'pending' || (s.status === 'running' && i < steps.length - 1)) {
      s.status = deriveStatus(s);
    }
  });
  return steps;
}
