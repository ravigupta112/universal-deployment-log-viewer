# universal-deployment-log-viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Next.js App Router](https://img.shields.io/badge/Next.js-App%20Router%20ready-000000.svg)](https://nextjs.org/docs/app)

A Railway / Kestra-style **consolidated deployment log viewer** for React and Next.js. Feed it raw output from
almost any CI/CD, container or cloud platform; it auto-detects the format, groups lines into collapsible
stages, and renders them in a virtualized list with inline, per-line detail cards.

- Auto-detection for **GitLab CI, GitHub Actions, AWS, Azure DevOps, Docker Buildx, Kubernetes, Helm, Jenkins and NDJSON**, plus **GCP Cloud Build, Buildkite, TeamCity, Terraform/OpenTofu, Ansible and Docker Compose**
- Handles **10,000+ lines** via `@tanstack/react-virtual` with dynamic row measurement
- Inline line expansion (no drawer): **Description, Input Parameters, JSON Payload, Raw Output (ANSI colours)**
- Search across stages, level filter, Expand/Collapse All, Follow Logs
- **Copy** icons: one per stage (header) and a **Copy All** button for the entire log (ANSI codes stripped)
- Parsers are pure functions - run them on the server or in a Web Worker

## Supported log formats

| Platform | Auto-detected markers | What becomes a stage |
| --- | --- | --- |
| GitLab CI | `section_start:<ts>:<name>` / `section_end:<ts>:<name>` | Each collapsible section (duration from timestamps) |
| GitHub Actions | `##[group]` / `##[endgroup]`, `::error::`, `::warning::` | Each step group; annotations become inputs (`file`, `line`) |
| AWS | `[Container] 2026/..` CodeBuild phases, CloudWatch events (`logStreamName`) | Each CodeBuild phase / each log stream |
| Azure DevOps | `##[section]Starting:` / `Finishing:`, `##[command]`, `##[error]` | Each task |
| Docker Buildx | `#1 [internal] load build definition`, `#5 [2/4] RUN ...`, `DONE 14.2s`, `CACHED` | Each `#N` build step (duration + cache hit) |
| Kubernetes | `[pod/name/container]` prefixes, `Normal`/`Warning` events, `kubectl apply` / rollout output, JSON & logfmt container logs | Each pod/container, Events, Apply, Rollout |
| Helm | `Release "x" has been upgraded`, `NAME:`, `STATUS:`, `HOOKS:`, `MANIFEST:`, `NOTES:` | Release summary, Hooks, Manifest, Notes |
| Jenkins | `[Pipeline] stage`, `[Pipeline] { (Name)`, `[Pipeline] // stage`, `[Pipeline] sh` | Each declarative stage (skipped stages detected) |
| GCP Cloud Build | `starting build "<uuid>"`, `Step #0 - "build": ...`, `Starting Step #N` / `Finished Step #N` | Each build step (+ source fetch and build result) |
| Buildkite | `~~~` / `---` / `+++` section headers, `$ command`, `^^^ +++` | Each log group |
| TeamCity | `##teamcity[blockOpened name='...']` / `blockClosed`, `message`, `testFailed`, `buildProblem` | Each block (tests/problems keep their attributes as inputs) |
| Terraform / OpenTofu | `Terraform will perform...`, `# addr will be created`, `addr: Creating...`, `Plan: N to add`, `Error:` boxes | Init, Plan, one stage per resource (with duration), Errors |
| Ansible | `PLAY [..] ***`, `TASK [role : name] ***`, `ok:` / `changed:` / `fatal: ... FAILED! => {json}`, `PLAY RECAP` | Each task (role/play metadata, skipped detection) + recap |
| Docker Compose | `service-1  \| message` prefixes, `[+] Running 3/3`, `Container x  Started`, `exited with code N` | One stage per service + lifecycle |
| NDJSON / JSON / logfmt | JSON objects with `level`, `msg`/`message`, `timestamp`, `input`; `key=value` pairs | Grouped by `stage` / `step` / `service` / `component` ... |

Anything else renders as a single plain-text stage.

## Installation

```bash
npm install universal-deployment-log-viewer
# or
pnpm add universal-deployment-log-viewer
# or
yarn add universal-deployment-log-viewer
```

Peer dependencies: `react` and `react-dom` (>= 18).

### Tailwind CSS setup

The viewer is styled with Tailwind utility classes (dark theme). Tell Tailwind to scan the package so those
classes are generated.

**Tailwind v3** - `tailwind.config.js`:

```js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './node_modules/universal-deployment-log-viewer/dist/**/*.{js,mjs}',
  ],
};
```

**Tailwind v4** - in your global CSS:

```css
@import "tailwindcss";
@source "../node_modules/universal-deployment-log-viewer/dist";
```

## Quick start (Next.js App Router)

The package ships with a `'use client'` directive, so it can be imported from Server Components or Client Components.

```tsx
// app/deployments/[id]/page.tsx
import { DeploymentLogViewer } from 'universal-deployment-log-viewer';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawLog = await fetch(`https://ci.example.com/api/jobs/${id}/log`).then((r) => r.text());

  return <DeploymentLogViewer rawLogs={rawLog} source="auto" height={640} />;
}
```

Try every format instantly with the bundled fixtures:

```tsx
import { DeploymentLogViewer, mockLogs } from 'universal-deployment-log-viewer';

<DeploymentLogViewer rawLogs={mockLogs.kubernetes} />;
```

A complete interactive demo (platform switcher, "Paste Custom Raw Log" modal, 10k-line stress test) lives in
[`examples/nextjs-demo/page.tsx`](./examples/nextjs-demo/page.tsx).

### Live / streaming logs

Append to the string (or array) you pass as `rawLogs`. Existing expansion state is preserved while new stages
are added; enable the toolbar's **Follow Logs** toggle (or `followLogs`) to keep the view pinned to the bottom.

```tsx
<DeploymentLogViewer rawLogs={liveText} source="github" followLogs />
```

## Using standalone parsers

`parseLogs()` has no React or DOM dependency.

```ts
import { parseLogs, detectLogFormat } from 'universal-deployment-log-viewer';

const format = detectLogFormat(raw);       // 'gitlab' | 'github' | ... | 'plaintext'
const steps = parseLogs(raw);              // LogStep[]
const failed = steps.filter((s) => s.status === 'failed');
```

Web Worker example:

```ts
// log.worker.ts
import { parseLogs } from 'universal-deployment-log-viewer';

self.onmessage = (e: MessageEvent<string>) => {
  self.postMessage(parseLogs(e.data));
};
```

```tsx
<DeploymentLogViewer steps={stepsFromWorker} />
```

CloudWatch events / JSON arrays can be passed directly:

```ts
parseLogs([{ timestamp: 1763805600000, logStreamName: 'ecs/app/abc', message: 'started' }]);
```

Individual parsers (`parseGitLab`, `parseGitHub`, `parseAzure`, `parseJenkins`, `parseDocker`, `parseKubernetes`,
`parseHelm`, `parseAws`, `parseGcpCloudBuild`, `parseBuildkite`, `parseTeamCity`, `parseTerraform`, `parseAnsible`, `parseCompose`, `parseJsonLogs`, `parsePlaintext`) and helpers (`parseCommand`, `parseLogfmt`, `stripAnsi`,
`detectLevel`) are exported too.

## API reference

### `DeploymentLogViewerProps`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `rawLogs` | `string \| object[]` | - | Raw log text, or JSON objects (NDJSON / CloudWatch events). |
| `steps` | `LogStep[]` | - | Pre-parsed stages. Takes precedence over `rawLogs`. |
| `source` | `LogSourceType` | `'auto'` | Force a parser instead of auto-detecting. |
| `height` | `number \| string` | `600` | Height of the scroll panel. |
| `className` | `string` | - | Extra classes for the outer container. |
| `defaultExpanded` | `'auto' \| 'all' \| 'none'` | `'auto'` | `'auto'` opens failed and running stages. |
| `followLogs` | `boolean` | `false` | Initial state of the Follow Logs toggle. Scrolling up disables it. |
| `showToolbar` | `boolean` | `true` | Show search, filters and controls. |
| `onLineClick` | `(line, step) => void` | - | Called when a line's detail card is opened. |
| `onFollowChange` | `(follow: boolean) => void` | - | Called when Follow Logs changes. |
| `emptyMessage` | `string` | `'No log output to display.'` | Shown when there is nothing to render. |

### `LogSourceType`

`'auto' | 'gitlab' | 'github' | 'aws' | 'azure' | 'docker' | 'kubernetes' | 'helm' | 'jenkins' | 'gcp' | 'buildkite' | 'teamcity' | 'terraform' | 'ansible' | 'compose' | 'json' | 'plaintext'`

### `LogStep`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique within the parsed result. |
| `title` | `string` | Stage name shown in the header. |
| `source` | `ResolvedLogSource` | Platform badge (`'auto'` is never stored). |
| `status` | `'success' \| 'failed' \| 'running' \| 'pending' \| 'skipped'` | Derived from markers and error lines. |
| `duration` | `number?` | Milliseconds. |
| `startTime` / `endTime` | `string?` | ISO-like timestamps. |
| `metadata` | `Record<string, string>?` | Platform extras (Helm release info, Azure task, Docker cache hit, ...). |
| `lines` | `LogLine[]` | The stage's lines. |

### `LogLine`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique line id. |
| `lineNumber` | `number` | 1-based line in the original input. |
| `timestamp` | `string?` | Extracted timestamp. |
| `level` | `'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal'` | From JSON/logfmt fields, platform markers, or keyword detection. |
| `rawText` | `string` | Original line including ANSI codes. |
| `cleanText` | `string` | ANSI-stripped text without timestamp/prefix. |
| `description` | `string?` | Auto-generated explanation (exit codes, K8s reasons, Docker cache, Helm hooks...). |
| `inputs` | `Record<string, string>?` | Command, flags, args, image, pod/container, annotation fields, JSON scalars. |
| `jsonPayload` | `unknown?` | Parsed JSON object or logfmt map. |
| `tags` | `string[]?` | e.g. `['kubernetes', 'json', 'error']`. |

## Development

```bash
npm install
npm run typecheck
npm test           # Vitest: parsers for every platform + component behaviour (jsdom)
npm run build      # tsup -> dist/index.js, dist/index.mjs, dist/index.d.ts
```

## License & third-party attributions

Released under the [MIT License](./LICENSE). Dependencies and their licenses
(`@tanstack/react-virtual` MIT, `ansi-to-react` BSD-3-Clause, `lucide-react` ISC/MIT) are documented in
[THIRD-PARTY-LICENSES.md](./THIRD-PARTY-LICENSES.md).
