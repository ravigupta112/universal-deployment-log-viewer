'use client';

/**
 * Next.js App Router demo: drop this file at `app/log-viewer-demo/page.tsx`.
 * Requires Tailwind CSS (see README) so the viewer's utility classes are generated.
 */
import { useMemo, useState } from 'react';
import {
  DeploymentLogViewer,
  detectLogFormat,
  generateLargeMockLog,
  mockLogLabels,
  mockLogs,
  type LogSourceType,
  type MockLogKey,
} from 'universal-deployment-log-viewer';

const PLATFORMS = Object.keys(mockLogs) as MockLogKey[];
const SOURCES: LogSourceType[] = ['auto', 'gitlab', 'github', 'aws', 'azure', 'docker', 'kubernetes', 'helm', 'jenkins', 'gcp', 'buildkite', 'teamcity', 'terraform', 'ansible', 'compose', 'json', 'plaintext'];

export default function LogViewerDemoPage() {
  const [platform, setPlatform] = useState<MockLogKey>('gitlab');
  const [custom, setCustom] = useState<string | null>(null);
  const [customSource, setCustomSource] = useState<LogSourceType>('auto');
  const [useLarge, setUseLarge] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftSource, setDraftSource] = useState<LogSourceType>('auto');

  const large = useMemo(() => (useLarge ? generateLargeMockLog(10000) : null), [useLarge]);
  const raw = large ?? custom ?? mockLogs[platform];
  const source: LogSourceType = large ? 'github' : custom ? customSource : 'auto';
  const detected = useMemo(() => detectLogFormat(raw), [raw]);

  const pick = (p: MockLogKey) => {
    setPlatform(p);
    setCustom(null);
    setUseLarge(false);
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-8 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Consolidated Deployment Log Viewer</h1>
          <p className="text-sm text-zinc-400">
            Pick a platform, paste your own log, or load 10,000 lines to test virtualization. Click any line to expand its details inline.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Platform" className="flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={!custom && !useLarge && platform === p}
                onClick={() => pick(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  !custom && !useLarge && platform === p ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                }`}
              >
                {mockLogLabels[p]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setUseLarge(true)}
            className={`rounded-md border px-3 py-1.5 text-xs ${useLarge ? 'border-sky-500 text-sky-200' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}`}
          >
            10,000-line stress test
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Paste Custom Raw Log
          </button>
          <span className="ml-auto text-xs text-zinc-500">
            Detected format: <span className="font-mono text-zinc-300">{detected}</span>
          </span>
        </div>

        <DeploymentLogViewer rawLogs={raw} source={source} height={640} />
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Paste custom raw log"
          onClick={() => setModalOpen(false)}
        >
          <div className="w-full max-w-3xl space-y-3 rounded-lg border border-zinc-700 bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Paste custom raw log</h2>
              <select
                value={draftSource}
                onChange={(e) => setDraftSource(e.target.value as LogSourceType)}
                aria-label="Log source"
                className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s === 'auto' ? 'Auto-detect' : s}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Paste GitLab, GitHub, AWS, Azure, Docker, Kubernetes, Helm, Jenkins or NDJSON logs here..."
              className="h-72 w-full resize-none rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-200 focus:border-sky-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Cancel
              </button>
              <button
                disabled={!draft.trim()}
                onClick={() => {
                  setCustom(draft);
                  setCustomSource(draftSource);
                  setUseLarge(false);
                  setModalOpen(false);
                }}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
              >
                Render log
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
