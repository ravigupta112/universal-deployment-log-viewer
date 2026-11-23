import type { LogSourceType, LogStep, ResolvedLogSource } from '../types';
import { parseAzure, parseGitHub, parseGitLab, parseJenkins } from './cicd';
import { parseAws, parseDocker, parseHelm, parseKubernetes } from './cloudAndContainers';
import { parseJsonLogs, parsePlaintext } from './structuredLogs';
import { parseAnsible, parseBuildkite, parseCompose, parseGcpCloudBuild, parseTeamCity, parseTerraform } from './extra';
import { splitLines, tryParseJson } from './structured';

export * from './cicd';
export * from './cloudAndContainers';
export * from './structuredLogs';
export * from './extra';
export {
  stripAnsi,
  parseCommand,
  parseLogfmt,
  tryParseJson,
  detectLevel,
  normalizeLevel,
  buildLine,
} from './structured';

function toRawString(input: string | object[]): string {
  if (typeof input === 'string') return input;
  return input.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n');
}

/** Sniffs the platform a log came from. Returns `'plaintext'` when nothing matches. */
export function detectLogFormat(rawInput: string | object[]): ResolvedLogSource {
  if (Array.isArray(rawInput)) {
    const cw = rawInput.some(
      (e) => e && typeof e === 'object' && ('logStreamName' in e || '@logStream' in (e as object)),
    );
    return cw ? 'aws' : 'json';
  }
  const s = rawInput.length > 400_000 ? rawInput.slice(0, 400_000) : rawInput;
  if (/section_start:\d+:/.test(s)) return 'gitlab';
  if (/##\[section\]Starting:/.test(s)) return 'azure';
  if (/(^|\s)(##\[group\]|::group::)/m.test(s)) return 'github';
  if (/^(?:\S+Z )?##\[command\]/m.test(s)) return 'azure';
  if (/##teamcity\[/.test(s)) return 'teamcity';
  if (/^\s*\[Pipeline\]/m.test(s)) return 'jenkins';
  if (/^Step #\d+ - "[^"]*":/m.test(s) || /^starting build "/m.test(s)) return 'gcp';
  if (/^\[Container\]\s+\d{4}\/\d{2}\/\d{2}/m.test(s) || /"logStreamName"|"@logStream"/.test(s)) return 'aws';
  if (
    /^~~~ \S/m.test(s) ||
    /\u001b_bk;t=\d+/.test(s) ||
    (/^(---|\+\+\+) (?![ab]\/)\S/m.test(s) && /Running (global|plugin|commands)|Preparing working directory|^\$ /m.test(s))
  ) {
    return 'buildkite';
  }
  if (/^#\d+\s+\[/m.test(s) || /^#\d+\s+(DONE|CACHED)\b/m.test(s)) return 'docker';
  if (/^(PLAY|TASK) \[.*\] \*+\s*$/m.test(s)) return 'ansible';
  if (
    /Terraform (will perform|has been successfully initialized|used the selected providers)|^Plan: \d+ to add|^(Apply|Destroy) complete! Resources:|^[\w.\-[\]"']+\.[\w\-[\]"'.]+: (Creating|Modifying|Destroying|Refreshing state)\.\.\./m.test(s)
  ) {
    return 'terraform';
  }
  if (
    /^Release "[^"]+" has been (upgraded|installed)/m.test(s) ||
    (/^NAME:\s/m.test(s) && /^(STATUS|REVISION):\s/m.test(s)) ||
    /^(HOOKS|MANIFEST):\s*$/m.test(s) ||
    /^Error: (UPGRADE|INSTALL) FAILED/m.test(s)
  ) {
    return 'helm';
  }
  if (
    /^\[pod\//m.test(s) ||
    /^\s*(Normal|Warning)\s+[A-Z]\w+\s+\S+/m.test(s) ||
    /^\S+Z\s+(stdout|stderr)\s+[FP]\s/m.test(s) ||
    /^[\w.\-]+\/[\w.\-]+\s+(created|configured|unchanged)\s*$/m.test(s)
  ) {
    return 'kubernetes';
  }
  if (
    /^Attaching to /m.test(s) ||
    /^[\w.\-]+-\d+\s+\| /m.test(s) ||
    /^\s*(?:[✔✘]\s*)?(?:Container|Network|Volume) \S+\s+(Started|Created|Running|Healthy|Stopped|Removed)/m.test(s) ||
    /^\[\+\] (Running|Building) \d+\/\d+/m.test(s)
  ) {
    return 'compose';
  }
  if (/^::(error|warning|notice)[ :]/m.test(s) || /^(?:\S+Z )?##\[(error|warning|debug)\]/m.test(s)) return 'github';
  const first = splitLines(s).find((l) => l.trim());
  if (first && first.trim().startsWith('{') && tryParseJson(first) !== undefined) return 'json';
  if (s.trim().startsWith('[{')) return 'json';
  return 'plaintext';
}

/**
 * Parses raw log text (or an array of JSON objects) into collapsible stages.
 * Pass `source` to skip auto-detection.
 */
export function parseLogs(rawInput: string | object[], source: LogSourceType = 'auto'): LogStep[] {
  const raw = toRawString(rawInput);
  const resolved: ResolvedLogSource = source === 'auto' ? detectLogFormat(rawInput) : source;
  switch (resolved) {
    case 'gitlab':
      return parseGitLab(raw);
    case 'github':
      return parseGitHub(raw);
    case 'azure':
      return parseAzure(raw);
    case 'jenkins':
      return parseJenkins(raw);
    case 'docker':
      return parseDocker(raw);
    case 'kubernetes':
      return parseKubernetes(raw);
    case 'helm':
      return parseHelm(raw);
    case 'aws':
      return parseAws(raw);
    case 'gcp':
      return parseGcpCloudBuild(raw);
    case 'buildkite':
      return parseBuildkite(raw);
    case 'teamcity':
      return parseTeamCity(raw);
    case 'terraform':
      return parseTerraform(raw);
    case 'ansible':
      return parseAnsible(raw);
    case 'compose':
      return parseCompose(raw);
    case 'json':
      return parseJsonLogs(raw);
    default:
      return parsePlaintext(raw);
  }
}
