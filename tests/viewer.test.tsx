import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DeploymentLogViewer, formatDuration, mockLogs, parseLogs } from '../src';

beforeAll(() => {
  // jsdom has no layout: give the scroll container a viewport and rows a height so the virtualizer renders items.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const h = this.hasAttribute('data-index') ? 30 : 700;
    return { width: 900, height: h, top: 0, left: 0, right: 900, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  for (const [prop, value] of [['offsetHeight', 700], ['offsetWidth', 900], ['clientHeight', 700], ['clientWidth', 900]] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollTo = function () {} as any;
});
afterEach(cleanup);

describe('formatDuration', () => {
  it('formats', () => {
    expect(formatDuration(0.2)).toBe('<1ms');
    expect(formatDuration(450)).toBe('450ms');
    expect(formatDuration(4000)).toBe('4.0s');
    expect(formatDuration(125000)).toBe('2m 5s');
    expect(formatDuration(undefined)).toBe('');
  });
});

describe('<DeploymentLogViewer />', () => {
  it('renders stage headers with badge, title and line count', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.docker} />);
    expect(screen.getAllByText('Docker').length).toBeGreaterThan(0);
    expect(screen.getByText('[4/5] RUN npm install --omit=dev')).toBeTruthy();
    expect(screen.getByText('Expand All')).toBeTruthy();
  });

  it('auto-expands failed stages and toggles a stage on click', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.jenkins} />);
    expect(screen.getAllByText(/UPGRADE FAILED/).length).toBeGreaterThan(0); // Deploy (failed) is open
    expect(screen.queryByText(/added 1243 packages in 19s/)).toBeNull(); // Build (success) is closed
    fireEvent.click(screen.getByText('Build'));
    expect(screen.getByText(/added 1243 packages in 19s/)).toBeTruthy();
  });

  it('expands a line inline with the four tabs', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.github} defaultExpanded="all" />);
    fireEvent.click(screen.getByText(/Expected status 200 but received 500/));
    const tablist = screen.getByRole('tablist');
    ['Description', 'Input Parameters', 'JSON Payload', 'Raw Output'].forEach((t) => expect(within(tablist).getByText(t)).toBeTruthy());
    expect(screen.getByText(/GitHub Actions error annotation/)).toBeTruthy();
    fireEvent.click(within(tablist).getByText('Input Parameters'));
    expect(screen.getByText('tests/api.test.ts')).toBeTruthy();
    fireEvent.click(within(tablist).getByText('Raw Output'));
    expect(screen.getByText('Copy raw')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close details'));
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('shows a JSON payload tab for structured lines', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.json} defaultExpanded="all" />);
    fireEvent.click(screen.getByText(/Aborting release/));
    fireEvent.click(within(screen.getByRole('tablist')).getByText('JSON Payload'));
    expect(screen.getByText('Copy JSON')).toBeTruthy();
    expect(screen.getByText('"migration_failed"')).toBeTruthy();
  });

  it('search filters lines and auto-expands matching stages', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.gitlab} defaultExpanded="none" />);
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'vite build' } });
    expect(screen.getAllByText(/vite build/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Deploying to staging')).toBeNull();
  });

  it('level filter keeps only error stages', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.gitlab} />);
    fireEvent.click(screen.getByText('Error'));
    expect(screen.queryByText('Getting source from Git repository')).toBeNull();
    expect(screen.getByText('Deploying to staging')).toBeTruthy();
  });

  it('Expand All / Collapse All', () => {
    render(<DeploymentLogViewer rawLogs={mockLogs.helm} defaultExpanded="none" />);
    fireEvent.click(screen.getByText('Expand All'));
    expect(screen.getByText('Collapse All')).toBeTruthy();
    expect(screen.getAllByText(/Release "webapp" has been upgraded/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Collapse All'));
    expect(screen.queryByText(/Release "webapp" has been upgraded/)).toBeNull();
  });

  it('copies a section and the entire log (ANSI stripped)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<DeploymentLogViewer rawLogs={mockLogs.gitlab} />);
    fireEvent.click(screen.getAllByLabelText('Copy this section')[0]);
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const section = writeText.mock.calls[0][0] as string;
    expect(section.startsWith('=== ')).toBe(true);
    expect(section).not.toMatch(/\u001b\[/);

    fireEvent.click(screen.getByLabelText('Copy entire log'));
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    const all = writeText.mock.calls[1][0] as string;
    expect(all).toContain('=== Deploying to staging (failed) ===');
    expect(all.split('=== ').length - 1).toBe(parseLogs(mockLogs.gitlab).length);
  });

  it('accepts pre-parsed steps and calls onLineClick', () => {
    const steps = parseLogs(mockLogs.helm);
    const onLineClick = vi.fn();
    render(<DeploymentLogViewer steps={steps} defaultExpanded="all" onLineClick={onLineClick} />);
    fireEvent.click(screen.getAllByText(/STATUS: deployed/)[0]);
    expect(onLineClick).toHaveBeenCalledTimes(1);
  });

  it('Follow Logs toggles and reports', () => {
    const onFollowChange = vi.fn();
    render(<DeploymentLogViewer rawLogs={mockLogs.docker} onFollowChange={onFollowChange} />);
    fireEvent.click(screen.getByText('Follow Logs'));
    expect(onFollowChange).toHaveBeenCalledWith(true);
  });

  it('shows the empty message', () => {
    render(<DeploymentLogViewer rawLogs="" emptyMessage="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });
});
