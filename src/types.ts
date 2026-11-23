export type LogSourceType =
  | 'auto'
  | 'gitlab'
  | 'github'
  | 'aws'
  | 'azure'
  | 'docker'
  | 'kubernetes'
  | 'helm'
  | 'jenkins'
  | 'gcp'
  | 'buildkite'
  | 'teamcity'
  | 'terraform'
  | 'ansible'
  | 'compose'
  | 'json'
  | 'plaintext';

/** A concrete platform (i.e. `LogSourceType` without `'auto'`). */
export type ResolvedLogSource = Exclude<LogSourceType, 'auto'>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type StepStatus = 'success' | 'failed' | 'running' | 'pending' | 'skipped';

export type LevelFilter = 'all' | 'info' | 'warn' | 'error';

export interface LogLine {
  id: string;
  /** 1-based line number in the original input. */
  lineNumber: number;
  /** ISO-ish timestamp when one could be extracted. */
  timestamp?: string;
  level: LogLevel;
  /** The original, untouched line (ANSI codes preserved). */
  rawText: string;
  /** Human-readable text: ANSI stripped, timestamp / platform prefixes removed. */
  cleanText: string;
  /** Auto-generated explanation of what happened on this line. */
  description?: string;
  /** Extracted command arguments, flags, pod/container names, image tags, resource ids... */
  inputs?: Record<string, string>;
  /** Parsed JSON / logfmt payload, when the line carries one. */
  jsonPayload?: unknown;
  tags?: string[];
}

export interface LogStep {
  id: string;
  title: string;
  source: ResolvedLogSource;
  status: StepStatus;
  /** Duration in milliseconds. */
  duration?: number;
  startTime?: string;
  endTime?: string;
  metadata?: Record<string, string>;
  lines: LogLine[];
}

export interface DeploymentLogViewerProps {
  /** Raw log text, or an array of JSON objects (NDJSON / CloudWatch events). */
  rawLogs?: string | object[];
  /** Pre-parsed steps. Takes precedence over `rawLogs`. */
  steps?: LogStep[];
  /** Force a parser. Defaults to `'auto'` detection. */
  source?: LogSourceType;
  /** Height of the scroll panel (px number or any CSS length). Default `600`. */
  height?: number | string;
  className?: string;
  /** Which stages start expanded. `'auto'` = failed / running stages. Default `'auto'`. */
  defaultExpanded?: 'auto' | 'all' | 'none';
  /** Initial state of the "Follow Logs" toggle. */
  followLogs?: boolean;
  /** Hide the search / filter toolbar. Default `true` (shown). */
  showToolbar?: boolean;
  onLineClick?: (line: LogLine, step: LogStep) => void;
  onFollowChange?: (follow: boolean) => void;
  emptyMessage?: string;
}
