import { describe, expect, it } from 'vitest';
import {
  detectLogFormat,
  generateLargeMockLog,
  mockCloudWatchEvents,
  mockLogs,
  parseCommand,
  parseLogfmt,
  parseLogs,
  type MockLogKey,
} from '../src';

const byTitle = (steps: ReturnType<typeof parseLogs>, part: string) => steps.find((s) => s.title.includes(part))!;

describe('detectLogFormat', () => {
  it.each(Object.keys(mockLogs) as MockLogKey[])('detects %s', (key) => {
    expect(detectLogFormat(mockLogs[key])).toBe(key);
  });
  it('detects CloudWatch event arrays as aws and other arrays as json', () => {
    expect(detectLogFormat(mockCloudWatchEvents)).toBe('aws');
    expect(detectLogFormat([{ level: 'info', msg: 'x' }])).toBe('json');
  });
  it('falls back to plaintext', () => {
    expect(detectLogFormat('hello\nworld')).toBe('plaintext');
  });
});

describe('parseLogs invariants', () => {
  it.each(Object.keys(mockLogs) as MockLogKey[])('%s: ids unique, lines non-empty, statuses valid', (key) => {
    const steps = parseLogs(mockLogs[key]);
    expect(steps.length).toBeGreaterThan(0);
    const stepIds = new Set(steps.map((s) => s.id));
    expect(stepIds.size).toBe(steps.length);
    const lineIds = new Set<string>();
    for (const s of steps) {
      expect(s.lines.length).toBeGreaterThan(0);
      expect(['success', 'failed', 'running', 'pending', 'skipped']).toContain(s.status);
      for (const l of s.lines) {
        lineIds.add(l.id);
        expect(l.cleanText).not.toMatch(/\u001b\[/);
      }
    }
    expect(lineIds.size).toBe(steps.reduce((a, s) => a + s.lines.length, 0));
  });
  it('handles empty input', () => {
    expect(parseLogs('')).toEqual([]);
    expect(parseLogs('   \n\n')).toEqual([]);
  });
  it('respects an explicit source', () => {
    const steps = parseLogs(mockLogs.github, 'plaintext');
    expect(steps).toHaveLength(1);
    expect(steps[0].source).toBe('plaintext');
  });
  it('parses 10k lines quickly', () => {
    const t = Date.now();
    const steps = parseLogs(generateLargeMockLog(10000));
    expect(steps.reduce((a, s) => a + s.lines.length, 0)).toBeGreaterThan(9000);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe('platform specifics', () => {
  it('GitLab: sections, durations, failure', () => {
    const steps = parseLogs(mockLogs.gitlab);
    expect(byTitle(steps, 'Preparing').duration).toBe(4000);
    expect(byTitle(steps, 'Deploying').status).toBe('failed');
    expect(byTitle(steps, 'Executing').status).toBe('success');
  });
  it('GitHub: annotations become inputs and error level', () => {
    const line = parseLogs(mockLogs.github)
      .flatMap((s) => s.lines)
      .find((l) => l.cleanText.includes('Expected status'))!;
    expect(line.level).toBe('error');
    expect(line.inputs).toMatchObject({ file: 'tests/api.test.ts', line: '88', annotation: 'error' });
    expect(byTitle(parseLogs(mockLogs.github), 'npm test').status).toBe('failed');
  });
  it('Azure: sections, command flags, failure', () => {
    const steps = parseLogs(mockLogs.azure);
    expect(byTitle(steps, 'Deploy to AKS').status).toBe('failed');
    const cmd = byTitle(steps, 'Docker build').lines.find((l) => l.inputs?.command === 'docker' && l.inputs['--build-arg'])!;
    expect(cmd.inputs!['--build-arg']).toBe('NODE_ENV=production');
    expect(cmd.inputs!.image).toBe('acracme.azurecr.io/webapp:20261122.4');
    expect(byTitle(steps, 'Docker build').metadata).toMatchObject({ task: 'Docker', version: '2.246.0' });
  });
  it('Docker: step grouping, cache, duration, RUN command', () => {
    const steps = parseLogs(mockLogs.docker);
    expect(byTitle(steps, '[1/5] FROM').metadata?.cache).toBe('hit');
    const run = byTitle(steps, 'RUN npm install');
    expect(run.duration).toBe(14200);
    expect(run.lines[0].inputs).toMatchObject({ command: 'npm', args: 'install', '--omit': 'dev' });
  });
  it('Kubernetes: pods, events, apply, rollout', () => {
    const steps = parseLogs(mockLogs.kubernetes);
    const titles = steps.map((s) => s.title);
    expect(titles).toEqual(expect.arrayContaining(['kubectl apply', 'Rollout status', 'Events']));
    expect(steps.some((s) => s.metadata?.container === 'istio-proxy')).toBe(true);
    const err = steps.flatMap((s) => s.lines).find((l) => l.cleanText.includes('Connection refused'))!;
    expect(err.level).toBe('error');
    expect(err.inputs).toMatchObject({ host: 'postgres.prod.svc.cluster.local', container: 'app' });
    const backoff = byTitle(steps, 'Events').lines.find((l) => l.inputs?.reason === 'BackOff')!;
    expect(backoff.description).toMatch(/restart/i);
  });
  it('Helm: summary metadata, hooks, notes', () => {
    const steps = parseLogs(mockLogs.helm);
    expect(steps.map((s) => s.title)).toEqual(['Release summary', 'Hooks', 'Manifest', 'Notes']);
    expect(steps[0].metadata).toMatchObject({ name: 'webapp', status: 'deployed', revision: '14' });
    expect(steps[0].status).toBe('success');
    expect(steps[1].lines.some((l) => l.inputs?.hook === 'pre-upgrade')).toBe(true);
  });
  it('Helm: failed status', () => {
    const steps = parseLogs('NAME: x\nSTATUS: failed\nREVISION: 2\nError: UPGRADE FAILED: boom');
    expect(steps[0].status).toBe('failed');
  });
  it('Jenkins: stages, skipped, failure, no stray bookkeeping steps', () => {
    const steps = parseLogs(mockLogs.jenkins);
    expect(steps.map((s) => s.title)).toEqual(['Pipeline setup', 'Checkout', 'Build', 'Integration Tests', 'Deploy']);
    expect(byTitle(steps, 'Integration').status).toBe('skipped');
    expect(byTitle(steps, 'Deploy').status).toBe('failed');
    expect(byTitle(steps, 'Build').lines.some((l) => l.inputs?.command === 'npm')).toBe(true);
  });
  it('AWS CodeBuild: phases and failed state', () => {
    const steps = parseLogs(mockLogs.aws);
    expect(steps.map((s) => s.title)).toEqual(['Provisioning', 'DOWNLOAD_SOURCE', 'INSTALL', 'PRE_BUILD', 'BUILD', 'POST_BUILD']);
    expect(steps.find((s) => s.title === 'BUILD')!.status).toBe('failed');
    expect(byTitle(steps, 'INSTALL').status).toBe('success');
  });
  it('AWS CloudWatch: grouped by log stream', () => {
    const steps = parseLogs(mockCloudWatchEvents);
    expect(steps.map((s) => s.title)).toEqual(['ecs/webapp/3f9a1c2d4e5f', 'ecs/worker/8b7c6d5e4f3a']);
    expect(steps[1].status).toBe('failed');
  });
  it('NDJSON: grouped by stage, payload and inputs extracted', () => {
    const steps = parseLogs(mockLogs.json);
    expect(steps.map((s) => s.title)).toEqual(['validate', 'provision', 'migrate', 'release']);
    const first = steps[0].lines[0];
    expect(first.level).toBe('info');
    expect(first.jsonPayload).toMatchObject({ msg: 'Starting deployment' });
    expect(first.inputs!.input).toContain('1.4.2');
    expect(steps[3].lines[0].level).toBe('fatal');
  });
  it('JSON array input', () => {
    const steps = parseLogs('[{"level":"warn","msg":"a","service":"x"},{"level":"error","msg":"b","service":"x"}]');
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('failed');
  });
});

describe('helpers', () => {
  it('parseLogfmt', () => {
    expect(parseLogfmt('level=warn msg="hello world" n=3')).toEqual({ level: 'warn', msg: 'hello world', n: '3' });
    expect(parseLogfmt('just text')).toBeUndefined();
  });
  it('parseCommand needs an explicit marker', () => {
    expect(parseCommand('docker is great')).toBeUndefined();
    expect(parseCommand('$ kubectl get pods -n prod --output=json')).toMatchObject({
      command: 'kubectl',
      args: 'get pods',
      '-n': 'prod',
      '--output': 'json',
    });
  });
});

describe('additional platforms', () => {
  it('GCP Cloud Build: steps, setup and result buckets', () => {
    const steps = parseLogs(mockLogs.gcp);
    expect(steps.map((s) => s.title)).toEqual(['Fetch source', 'build (#0)', 'push (#1)', 'deploy (#2)', 'Build result']);
    expect(steps[0].lines.length).toBeGreaterThan(3);
    expect(byTitle(steps, 'deploy').status).toBe('failed');
    expect(byTitle(steps, 'build').status).toBe('success');
    expect(steps[4].status).toBe('failed');
  });
  it('Buildkite: ~~~ / --- / +++ sections, commands, failure', () => {
    const steps = parseLogs(mockLogs.buildkite);
    expect(steps.map((s) => s.title)).toEqual(['Running global environment hook', 'Preparing working directory', 'Build image', 'Run tests']);
    expect(byTitle(steps, 'Run tests').status).toBe('failed');
    expect(byTitle(steps, 'Build image').lines.some((l) => l.inputs?.['--tag'] === 'registry.acme.io/webapp:1.4.2')).toBe(true);
  });
  it('Buildkite: strips APC timestamp markers', () => {
    const steps = parseLogs('\u001b_bk;t=1763805600000\u0007~~~ Running hook\n$ echo hi');
    expect(detectLogFormat('\u001b_bk;t=1\u0007x')).toBe('buildkite');
    expect(steps[0].title).toBe('Running hook');
  });
  it('TeamCity: blocks, tests, problems', () => {
    const steps = parseLogs(mockLogs.teamcity);
    expect(steps.map((s) => s.title)).toEqual(['Build setup', 'Compile', 'Tests', 'Build output']);
    expect(byTitle(steps, 'Compile').lines.some((l) => l.level === 'warn')).toBe(true);
    const failed = byTitle(steps, 'Tests').lines.find((l) => l.cleanText.startsWith('Test failed'))!;
    expect(failed.level).toBe('error');
    expect(failed.inputs).toMatchObject({ name: 'PaymentTest.rejectsExpiredCard' });
    expect(failed.jsonPayload).toMatchObject({ type: 'testFailed' });
    expect(byTitle(steps, 'Tests').status).toBe('failed');
  });
  it('Terraform: init, plan, per-resource apply with durations, errors', () => {
    const steps = parseLogs(mockLogs.terraform);
    expect(steps.map((s) => s.title)).toEqual(['Init', 'Plan', 'aws_s3_bucket.logs', 'aws_instance.web', 'Errors']);
    expect(byTitle(steps, 'aws_s3_bucket').duration).toBe(2000);
    expect(byTitle(steps, 'aws_s3_bucket').status).toBe('success');
    expect(byTitle(steps, 'aws_instance.web').status).toBe('failed');
    const plan = byTitle(steps, 'Plan').lines.find((l) => l.inputs?.address === 'aws_instance.web')!;
    expect(plan.inputs!.action).toBe('created');
  });
  it('Ansible: tasks, roles, JSON results, skipped, recap', () => {
    const steps = parseLogs(mockLogs.ansible);
    expect(steps.map((s) => s.title)).toEqual(['Gathering Facts', 'Install nginx', 'Deploy config', 'Restart nginx', 'Play recap']);
    expect(byTitle(steps, 'Install nginx').metadata).toMatchObject({ role: 'nginx', play: 'Configure web servers' });
    const fatal = byTitle(steps, 'Deploy config').lines.find((l) => l.cleanText.startsWith('fatal'))!;
    expect(fatal.level).toBe('error');
    expect(fatal.inputs).toMatchObject({ host: 'web2', result: 'FAILED', rc: '1' });
    expect(fatal.jsonPayload).toMatchObject({ rc: 1 });
    expect(byTitle(steps, 'Restart nginx').status).toBe('skipped');
    const recap = byTitle(steps, 'recap').lines.find((l) => l.inputs?.host === 'web2')!;
    expect(recap.level).toBe('error');
    expect(recap.inputs).toMatchObject({ failed: '1', ok: '2' });
  });
  it('Docker Compose: per-service steps and lifecycle', () => {
    const steps = parseLogs(mockLogs.compose);
    expect(steps.map((s) => s.title)).toEqual(['Compose lifecycle', 'db-1', 'web-1']);
    expect(byTitle(steps, 'web-1').status).toBe('failed');
    expect(byTitle(steps, 'web-1').metadata).toMatchObject({ service: 'web', container: 'web-1' });
    expect(steps[0].lines.some((l) => l.inputs?.name === 'app-db-1' && l.inputs?.state === 'Started')).toBe(true);
  });
  it('does not mistake Helm manifests or diffs for Buildkite', () => {
    expect(detectLogFormat(mockLogs.helm)).toBe('helm');
    expect(detectLogFormat('--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@')).toBe('plaintext');
  });
});
