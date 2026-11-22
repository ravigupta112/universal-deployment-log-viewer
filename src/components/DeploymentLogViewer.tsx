'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import Ansi from 'ansi-to-react';
import {
  ArrowDownToLine,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  Copy,
  Loader2,
  MinusCircle,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import { parseLogs } from '../parsers';
import type {
  DeploymentLogViewerProps,
  LevelFilter,
  LogLevel,
  LogLine,
  LogStep,
  ResolvedLogSource,
  StepStatus,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

export function formatDuration(ms?: number): string {
  if (ms == null || !isFinite(ms)) return '';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  if (m < 60) return `${m}m ${rem}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const SOURCE_META: Record<ResolvedLogSource, { label: string; cls: string }> = {
  gitlab: { label: 'GitLab', cls: 'bg-orange-500/15 text-orange-300 ring-orange-500/30' },
  github: { label: 'GitHub', cls: 'bg-slate-400/15 text-slate-200 ring-slate-400/30' },
  aws: { label: 'AWS', cls: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30' },
  azure: { label: 'Azure', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  docker: { label: 'Docker', cls: 'bg-blue-500/15 text-blue-300 ring-blue-500/30' },
  kubernetes: { label: 'K8s', cls: 'bg-indigo-500/15 text-indigo-300 ring-indigo-500/30' },
  helm: { label: 'Helm', cls: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30' },
  jenkins: { label: 'Jenkins', cls: 'bg-rose-500/15 text-rose-300 ring-rose-500/30' },
  json: { label: 'JSON', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  plaintext: { label: 'Text', cls: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30' },
};

const LEVEL_TEXT: Record<LogLevel, string> = {
  debug: 'text-zinc-500',
  info: 'text-zinc-300',
  warn: 'text-amber-300',
  error: 'text-red-400',
  fatal: 'text-red-300 font-semibold',
};
const LEVEL_ROW_BG: Record<LogLevel, string> = {
  debug: '',
  info: '',
  warn: 'bg-amber-500/[0.06]',
  error: 'bg-red-500/[0.08]',
  fatal: 'bg-red-500/[0.12]',
};
const LEVEL_TAG: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
  fatal: 'FTL',
};

function StatusIcon({ status }: { status: StepStatus }) {
  const common = 'h-4 w-4 shrink-0';
  switch (status) {
    case 'success':
      return <CheckCircle2 className={`${common} text-emerald-400`} aria-label="success" />;
    case 'failed':
      return <XCircle className={`${common} text-red-400`} aria-label="failed" />;
    case 'running':
      return <Loader2 className={`${common} animate-spin text-sky-400`} aria-label="running" />;
    case 'skipped':
      return <MinusCircle className={`${common} text-zinc-500`} aria-label="skipped" />;
    default:
      return <Circle className={`${common} text-zinc-500`} aria-label="pending" />;
  }
}

function matchesLevel(level: LogLevel, filter: LevelFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'info') return level === 'info' || level === 'debug';
  if (filter === 'warn') return level === 'warn';
  return level === 'error' || level === 'fatal';
}

function highlightText(text: string, q: string): ReactNode {
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(q, from);
  let k = 0;
  while (idx !== -1 && k < 50) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark key={k++} className="rounded bg-yellow-400/30 px-0.5 text-yellow-100">
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  parts.push(text.slice(from));
  return parts;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

function highlightJson(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const cls = m[1] ? (m[2] ? 'text-sky-300' : 'text-emerald-300') : m[3] ? 'text-violet-300' : 'text-amber-300';
    out.push(
      <span key={k++} className={cls}>
        {m[1] ?? m[3] ?? m[4]}
      </span>,
    );
    if (m[2]) out.push(m[2]);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
    >
      {done ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {done ? 'Copied' : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline detail card                                                         */
/* -------------------------------------------------------------------------- */

type DetailTab = 'description' | 'inputs' | 'json' | 'raw';

function LineDetail({
  line,
  tab,
  onTab,
  onClose,
}: {
  line: LogLine;
  tab: DetailTab;
  onTab: (t: DetailTab) => void;
  onClose: () => void;
}) {
  const inputs = line.inputs ? Object.entries(line.inputs) : [];
  const json = line.jsonPayload !== undefined ? safeStringify(line.jsonPayload) : '';
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'description', label: 'Description' },
    { id: 'inputs', label: 'Input Parameters', count: inputs.length },
    { id: 'json', label: 'JSON Payload' },
    { id: 'raw', label: 'Raw Output' },
  ];
  return (
    <div
      className="mx-3 mb-2 mt-1 overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 pr-2">
        <div role="tablist" className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={`px-3 py-2 text-xs font-medium ${
                tab === t.id ? 'border-b-2 border-sky-400 text-sky-300' : 'border-b-2 border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1 rounded bg-zinc-800 px-1 text-[10px] text-zinc-400">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-3 text-xs">
        {tab === 'description' && (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed text-zinc-200">
              {line.description ?? 'No additional context could be derived for this line. See Raw Output for the original text.'}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-500">
              <span>Line {line.lineNumber}</span>
              <span>Level: {line.level}</span>
              {line.timestamp && <span>Time: {line.timestamp}</span>}
              {line.tags && line.tags.length > 0 && <span>Tags: {line.tags.join(', ')}</span>}
            </div>
          </div>
        )}
        {tab === 'inputs' &&
          (inputs.length ? (
            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="text-zinc-500">
                  <th className="w-1/3 py-1 pr-3 font-medium">Name</th>
                  <th className="py-1 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {inputs.map(([k, v]) => (
                  <tr key={k} className="border-t border-zinc-800 align-top">
                    <td className="break-all py-1 pr-3 font-mono text-sky-300">{k}</td>
                    <td className="break-all py-1 font-mono text-zinc-200">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-zinc-500">No command arguments, flags or resource identifiers were extracted from this line.</p>
          ))}
        {tab === 'json' &&
          (json ? (
            <div className="space-y-2">
              <div className="flex justify-end">
                <CopyButton text={json} label="Copy JSON" />
              </div>
              <pre className="max-h-72 overflow-auto rounded bg-zinc-950 p-3 font-mono leading-relaxed text-zinc-300">{highlightJson(json)}</pre>
            </div>
          ) : (
            <p className="text-zinc-500">This line does not carry a JSON or logfmt payload.</p>
          ))}
        {tab === 'raw' && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <CopyButton text={line.rawText} label="Copy raw" />
            </div>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-zinc-950 p-3 font-mono leading-relaxed text-zinc-200">
              <Ansi>{line.rawText}</Ansi>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

type Row =
  | { kind: 'step'; key: string; step: LogStep; shown: number; open: boolean }
  | { kind: 'line'; key: string; step: LogStep; line: LogLine };

const MAX_DISPLAY_CHARS = 1200;

function LineRow({
  line,
  query,
  open,
  tab,
  onToggle,
  onTab,
}: {
  line: LogLine;
  query: string;
  open: boolean;
  tab: DetailTab;
  onToggle: () => void;
  onTab: (t: DetailTab) => void;
}) {
  const text = line.cleanText.length > MAX_DISPLAY_CHARS ? `${line.cleanText.slice(0, MAX_DISPLAY_CHARS)}\u2026` : line.cleanText;
  const time = line.timestamp ? (line.timestamp.match(/(\d{2}:\d{2}:\d{2})/)?.[1] ?? '') : '';
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <div className={`border-t border-zinc-900 ${LEVEL_ROW_BG[line.level]} ${open ? 'bg-zinc-800/40' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={onKey}
        className="flex cursor-pointer items-start gap-2 py-0.5 pl-9 pr-3 font-mono text-[12px] leading-5 hover:bg-zinc-800/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
      >
        <span className="w-10 shrink-0 select-none text-right text-zinc-600">{line.lineNumber}</span>
        {time && <span className="w-[60px] shrink-0 select-none text-zinc-600">{time}</span>}
        <span className={`w-7 shrink-0 select-none text-[10px] leading-5 ${LEVEL_TEXT[line.level]}`}>{LEVEL_TAG[line.level]}</span>
        <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${LEVEL_TEXT[line.level]}`}>
          {highlightText(text, query) || '\u00a0'}
        </span>
        {open ? <ChevronDown className="mt-1 h-3 w-3 shrink-0 text-zinc-500" /> : <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-zinc-700" />}
      </div>
      {open && <LineDetail line={line} tab={tab} onTab={onTab} onClose={onToggle} />}
    </div>
  );
}

function StepHeader({
  step,
  shown,
  open,
  filtered,
  onToggle,
}: {
  step: LogStep;
  shown: number;
  open: boolean;
  filtered: boolean;
  onToggle: () => void;
}) {
  const meta = SOURCE_META[step.source] ?? SOURCE_META.plaintext;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={onKey}
      className="flex cursor-pointer items-center gap-2 border-t border-zinc-800 bg-zinc-900 px-3 py-2 hover:bg-zinc-800/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
    >
      {open ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${meta.cls}`}>{meta.label}</span>
      <StatusIcon status={step.status} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100" title={step.title}>
        {step.title}
      </span>
      <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
        {filtered ? `${shown}/${step.lines.length}` : step.lines.length} lines
      </span>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-zinc-500">{formatDuration(step.duration)}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

const LEVEL_PILLS: { id: LevelFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Error' },
];

export function DeploymentLogViewer(props: DeploymentLogViewerProps) {
  const {
    rawLogs,
    steps: stepsProp,
    source = 'auto',
    height = 600,
    className,
    defaultExpanded = 'auto',
    followLogs = false,
    showToolbar = true,
    onLineClick,
    onFollowChange,
    emptyMessage = 'No log output to display.',
  } = props;

  const { steps, error } = useMemo<{ steps: LogStep[]; error: string | null }>(() => {
    if (stepsProp) return { steps: stepsProp, error: null };
    if (rawLogs === undefined || (typeof rawLogs === 'string' && !rawLogs.trim())) return { steps: [], error: null };
    try {
      return { steps: parseLogs(rawLogs, source), error: null };
    } catch (e) {
      return { steps: [], error: e instanceof Error ? e.message : 'Failed to parse logs.' };
    }
  }, [rawLogs, stepsProp, source]);

  // A new log (as opposed to more lines being appended to a live one) resets UI state.
  const identity = useMemo(() => {
    if (stepsProp) return `s:${stepsProp[0]?.id ?? ''}:${stepsProp[0]?.title ?? ''}`;
    const head = typeof rawLogs === 'string' ? rawLogs.slice(0, 200) : JSON.stringify(rawLogs ?? '').slice(0, 200);
    return `r:${source}:${head}`;
  }, [stepsProp, rawLogs, source]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsedInFilter, setCollapsedInFilter] = useState<Set<string>>(() => new Set());
  const [openLines, setOpenLines] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<Record<string, DetailTab>>({});
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [follow, setFollowState] = useState(followLogs);
  const seen = useRef<Set<string>>(new Set());
  const parentRef = useRef<HTMLDivElement>(null);

  const setFollow = useCallback(
    (v: boolean) => {
      setFollowState(v);
      onFollowChange?.(v);
    },
    [onFollowChange],
  );

  useEffect(() => {
    seen.current = new Set();
    setExpanded(new Set());
    setCollapsedInFilter(new Set());
    setOpenLines(new Set());
    setTabs({});
  }, [identity]);

  const idsKey = steps.map((s) => s.id).join('|');
  useEffect(() => {
    const fresh = steps.filter((s) => !seen.current.has(s.id));
    if (!fresh.length) return;
    fresh.forEach((s) => seen.current.add(s.id));
    const toOpen = fresh.filter(
      (s) =>
        defaultExpanded === 'all' ||
        (defaultExpanded === 'auto' && (s.status === 'failed' || s.status === 'running' || steps.length === 1)),
    );
    if (toOpen.length) {
      setExpanded((prev) => {
        const next = new Set(prev);
        toOpen.forEach((s) => next.add(s.id));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, identity, defaultExpanded]);

  const q = search.trim().toLowerCase();
  const filtering = q.length > 0 || level !== 'all';

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const step of steps) {
      const lines = filtering
        ? step.lines.filter((l) => matchesLevel(l.level, level) && (!q || l.cleanText.toLowerCase().includes(q)))
        : step.lines;
      if (filtering && lines.length === 0) continue;
      const open = filtering ? !collapsedInFilter.has(step.id) : expanded.has(step.id);
      out.push({ kind: 'step', key: `s:${step.id}`, step, shown: lines.length, open });
      if (open) for (const line of lines) out.push({ kind: 'line', key: `l:${line.id}`, step, line });
    }
    return out;
  }, [steps, filtering, q, level, expanded, collapsedInFilter]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'step' ? 41 : 26),
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: 14,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    if (follow && rows.length) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
  }, [follow, rows.length, virtualizer]);

  const toggleStep = (id: string) => {
    const setter = filtering ? setCollapsedInFilter : setExpanded;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allOpen = steps.length > 0 && steps.every((s) => (filtering ? !collapsedInFilter.has(s.id) : expanded.has(s.id)));
  const toggleAll = () => {
    const ids = steps.map((s) => s.id);
    if (allOpen) {
      setExpanded(new Set());
      setCollapsedInFilter(new Set(ids));
    } else {
      setExpanded(new Set(ids));
      setCollapsedInFilter(new Set());
    }
  };
  const toggleLine = (line: LogLine, step: LogStep) => {
    setOpenLines((prev) => {
      const next = new Set(prev);
      if (next.has(line.id)) next.delete(line.id);
      else {
        next.add(line.id);
        onLineClick?.(line, step);
      }
      return next;
    });
  };

  const totals = useMemo(() => {
    let lines = 0;
    let errors = 0;
    let warns = 0;
    for (const s of steps) {
      lines += s.lines.length;
      for (const l of s.lines) {
        if (l.level === 'error' || l.level === 'fatal') errors++;
        else if (l.level === 'warn') warns++;
      }
    }
    return { lines, errors, warns };
  }, [steps]);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-200 ${className ?? ''}`}
      data-testid="deployment-log-viewer"
    >
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs across all stages"
              aria-label="Search logs"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-1.5 pl-7 pr-7 text-xs text-zinc-100 placeholder-zinc-500 focus:border-sky-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex overflow-hidden rounded-md border border-zinc-700" role="group" aria-label="Filter by log level">
            {LEVEL_PILLS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={level === p.id}
                onClick={() => setLevel(p.id)}
                className={`px-2.5 py-1 text-xs ${
                  level === p.id ? 'bg-sky-500/20 text-sky-200' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {allOpen ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
            {allOpen ? 'Collapse All' : 'Expand All'}
          </button>
          <button
            type="button"
            aria-pressed={follow}
            onClick={() => setFollow(!follow)}
            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs ${
              follow ? 'border-sky-500 bg-sky-500/20 text-sky-200' : 'border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Follow Logs
          </button>
        </div>
      )}

      {error ? (
        <div className="p-4 text-sm text-red-400" role="alert">
          Could not parse the log: {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-zinc-500" style={{ minHeight: 80 }}>
          {filtering && steps.length ? 'No lines match the current search or level filter.' : emptyMessage}
        </div>
      ) : (
        <div
          ref={parentRef}
          style={{ height, overflow: 'auto', contain: 'strict' }}
          onWheel={(e) => {
            if (follow && e.deltaY < 0) setFollow(false);
          }}
        >
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((v) => {
              const row = rows[v.index];
              if (!row) return null;
              return (
                <div
                  key={v.key}
                  data-index={v.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                >
                  {row.kind === 'step' ? (
                    <StepHeader step={row.step} shown={row.shown} open={row.open} filtered={filtering} onToggle={() => toggleStep(row.step.id)} />
                  ) : (
                    <LineRow
                      line={row.line}
                      query={q}
                      open={openLines.has(row.line.id)}
                      tab={tabs[row.line.id] ?? 'description'}
                      onToggle={() => toggleLine(row.line, row.step)}
                      onTab={(t) => setTabs((prev) => ({ ...prev, [row.line.id]: t }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showToolbar && steps.length > 0 && (
        <div className="flex items-center gap-3 border-t border-zinc-800 bg-zinc-900 px-3 py-1 text-[11px] text-zinc-500">
          <span>{steps.length} stages</span>
          <span>{totals.lines.toLocaleString()} lines</span>
          {totals.errors > 0 && <span className="text-red-400">{totals.errors} errors</span>}
          {totals.warns > 0 && <span className="text-amber-300">{totals.warns} warnings</span>}
        </div>
      )}
    </div>
  );
}

export default DeploymentLogViewer;
