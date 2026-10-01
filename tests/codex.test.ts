import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Codex } from '../src/companion/codex.js';
import { template } from '../src/shared/userscript.js';
import type { Page, Project } from '../src/shared/model.js';

test('Codex relays commentary, page reads, and decoded source while the turn is still running', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-activity-'));
  const command = resolve('tests/fixtures/codex.mjs'); await chmod(command, 0o700);
  const activities: { kind: string; text: string; state: string }[] = [];
  let finished = false;
  const page: Page = { url: 'https://example.com', title: 'Export', text: 'Export', html: '<button>Export</button>', selectors: ['button: Export'] };
  const codex = new Codex(root, async () => page, () => {}, command, activity => {
    assert.equal(finished, false);
    activities.push(activity);
  });
  t.after(async () => { codex.close(); await rm(root, { recursive: true, force: true }); });
  const project: Project = { schemaVersion: 1, id: crypto.randomUUID(), name: 'Shortcut', origin: page.url, createdAt: new Date().toISOString() };
  const result = await codex.generate(project, 'Add export shortcut', page, template(project.origin, project.name), async () => {});
  finished = true;
  assert.ok(activities.some(item => item.kind === 'message' && item.text.includes('checking the export button')), 'Actual Codex commentary was discarded');
  assert.ok(activities.some(item => item.kind === 'tool' && item.state === 'completed' && item.text.includes('Export')), 'Page read result was discarded');
  assert.ok(activities.some(item => item.kind === 'source' && item.state === 'running' && item.text.includes('\ndocument.body.dataset.shortcut')), 'Source was not decoded and relayed before completion');
  assert.ok(activities.some(item => item.kind === 'summary' && item.text.includes('Checking the page structure.')));
  assert.ok(activities.some(item => item.kind === 'command' && item.state === 'completed' && item.text.includes('Exit code: 0')));
  assert.equal(activities.some(item => item.text.includes('Private reasoning content')), false);
  assert.match(result.source, /dataset.shortcut/);
});

test('Codex app-server adapter inspects the target page, resumes saved threads, and cancels turns', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-codex-'));
  const command = resolve('tests/fixtures/codex.mjs'); await chmod(command, 0o700);
  const page: Page = { url: 'https://example.com', title: 'Export', text: 'Export', html: '<button>Export</button>', selectors: ['button: Export'] };
  let inspections = 0;
  const codex = new Codex(root, async selector => { assert.equal(selector, 'button'); inspections++; return page; }, () => {}, command);
  t.after(async () => { codex.close(); await rm(root, { recursive: true, force: true }); });
  const project: Project = { schemaVersion: 1, id: crypto.randomUUID(), name: 'Shortcut', origin: 'https://example.com', createdAt: new Date().toISOString() };
  const persist = async (threadId: string) => { project.threadId = threadId; };
  const first = await codex.generate(project, 'Add export shortcut', page, template(project.origin, project.name), persist);
  assert.match(first.source, /dataset.shortcut/);
  assert.equal(project.threadId, 'script-monkey-test-thread');
  await codex.generate(project, 'Improve export shortcut', page, first.source, persist);
  assert.equal(inspections, 2);
  const pending = codex.generate(project, 'Hold the task', page, first.source, persist);
  const rejection = assert.rejects(() => pending, /interrupted/);
  while (inspections < 3) await new Promise(resolve => setTimeout(resolve, 10));
  await codex.cancel(); await rejection;
});
