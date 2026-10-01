import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get } from 'node:http';
import { Workspace } from '../src/companion/store.js';
import { Controller } from '../src/companion/controller.js';
import { template } from '../src/shared/userscript.js';
import type { ProjectView } from '../src/shared/model.js';

async function setup(t: { after: (fn: () => unknown) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-controller-'));
  const state = { source: template('https://example.com', 'Shortcut'), lastModified: 10, patches: 0, badReadback: false };
  const store = new Workspace(root);
  const manager = {
    pair: async () => 'paircode',
    list: async () => [{ name: 'Shortcut', namespace: 'script-monkey.local', path: 'uuid/source' }],
    read: async () => ({ source: state.source, lastModified: state.lastModified }),
    patch: async (_path: string, source: string, expected: number) => {
      assert.equal(expected, state.lastModified); state.patches++;
      if (!state.badReadback) state.source = source;
      state.lastModified++;
    }, close: async () => {},
  };
  const controller = new Controller(store, manager, () => {});
  t.after(async () => { await controller.close(); await rm(root, { recursive: true, force: true }); });
  const project = await controller.handle({ method: 'manager-import', path: 'uuid/source', origin: 'https://example.com' }) as ProjectView;
  return { controller, store, state, project };
}

test('conflicting manager edit is not overwritten, and refresh preserves previous drafts', async t => {
  const { controller, store, state, project } = await setup(t);
  const candidate = await store.save(project.project.id, state.source.replace('0.1.0', '0.2.0'), 'Agent draft');
  state.source = state.source.replace('Personal website customization', 'External editor change'); state.lastModified++;
  await assert.rejects(() => controller.handle({ method: 'apply', projectId: project.project.id, revisionId: candidate.project.currentRevisionId! }), /Conflict/);
  assert.equal(state.patches, 0);
  const refreshed = await controller.handle({ method: 'manager-import', path: 'uuid/source', origin: 'https://example.com' }) as ProjectView;
  assert.equal(refreshed.project.id, project.project.id);
  assert.equal(refreshed.revisions.length, 3);
  assert.equal(refreshed.project.manager?.source, state.source);
});

test('update is marked installed only after exact source readback', async t => {
  const { controller, store, state, project } = await setup(t);
  const candidate = await store.save(project.project.id, state.source.replace('0.1.0', '0.2.0'), 'Agent draft');
  state.badReadback = true;
  await assert.rejects(() => controller.handle({ method: 'apply', projectId: project.project.id, revisionId: candidate.project.currentRevisionId! }), /differs/);
  assert.equal((await store.project(project.project.id)).appliedRevisionId, undefined);
  // Refresh the modification-time snapshot after the failed readback, then apply another draft.
  await controller.handle({ method: 'manager-import', path: 'uuid/source', origin: 'https://example.com' });
  state.badReadback = false;
  const applied = await controller.handle({ method: 'apply', projectId: project.project.id, revisionId: candidate.project.currentRevisionId! }) as ProjectView;
  assert.equal(applied.project.appliedRevisionId, candidate.project.currentRevisionId);
  assert.equal(state.source, candidate.revisions.find(item => item.id === candidate.project.currentRevisionId)!.source);
  assert.ok(applied.events.some(event => event.type === 'installed'));
});

test('restore keeps installed state intact until explicitly applied; install handoff serves immutable source', async t => {
  const { controller, store, state, project } = await setup(t);
  const original = project.project.currentRevisionId!;
  await store.save(project.project.id, state.source.replace('0.1.0', '0.2.0'), 'New draft');
  const restored = await controller.handle({ method: 'restore', projectId: project.project.id, revisionId: original }) as ProjectView;
  assert.equal(state.patches, 0);
  assert.notEqual(restored.project.currentRevisionId, original);
  const result = await controller.handle({ method: 'install-url', projectId: project.project.id, revisionId: original }) as { url: string };
  const response = await fetch(result.url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), state.source);
  assert.equal((await fetch(result.url, { method: 'POST' })).status, 404);
  const hostRejected = await new Promise<number | undefined>((resolve, reject) => {
    get(result.url, { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(hostRejected, 404);
});

test('a failed conversation write releases the generation gate', async t => {
  const { controller, store, project } = await setup(t);
  const original = store.event.bind(store);
  store.event = async () => { throw new Error('Disk write failed'); };
  await assert.rejects(() => controller.handle({ method: 'generate', projectId: project.project.id, prompt: 'Add a shortcut', page: { url: 'https://example.com', title: 'Example', text: '', html: '', selectors: [] } }), /Disk write failed/);
  store.event = original;
  const next = await controller.handle({ method: 'save', projectId: project.project.id, source: project.revisions[0]!.source, note: 'Retry after recovery' }) as ProjectView;
  assert.equal(next.revisions.length, 2);
});
