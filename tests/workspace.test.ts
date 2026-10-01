import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workspace } from '../src/companion/store.js';
import { template } from '../src/shared/userscript.js';

test('disk history survives a new workspace instance and portable restore without manager bindings', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Workspace(root), original = template('https://example.com', 'Export shortcut');
  const created = await store.create('https://example.com/page', 'Export shortcut', original, { path: 'manager/source', source: original, lastModified: 1 });
  const changed = original.replace('// Describe your change in the sidebar.', 'document.body.dataset.shortcut = "ready";');
  await store.save(created.project.id, changed, 'Add shortcut');
  await store.event(created.project.id, 'user', 'Put export in the corner');
  const reopened = await new Workspace(root).view(created.project.id);
  assert.equal(reopened.revisions.length, 2);
  assert.equal(reopened.revisions.find(item => item.id === reopened.project.currentRevisionId)?.source, changed);
  assert.ok(reopened.events.some(item => item.text === 'Put export in the corner'));
  const restored = await store.restore(await store.backup(created.project.id));
  assert.notEqual(restored.project.id, created.project.id);
  assert.equal(restored.project.manager, undefined);
  assert.equal(restored.project.threadId, undefined);
  assert.equal(restored.revisions.length, 2);
  assert.ok(restored.revisions.some(item => item.source === original));
});

test('damaged backup or revision fails rather than returning corrupt source', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-damage-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Workspace(root), created = await store.create('https://example.com', 'Test');
  const backup = await store.backup(created.project.id);
  backup.revisions[0]!.source += 'corruption';
  await assert.rejects(() => store.restore(backup), /checksum/);
  await writeFile(join(root, 'projects', created.project.id, 'revisions', `${created.revisions[0]!.id}.json`), JSON.stringify(backup.revisions[0]));
  await assert.rejects(() => store.view(created.project.id), /checksum/);
});

test('invalid source and filesystem traversal do not create usable projects', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new Workspace(root);
  await assert.rejects(() => store.create('https://example.com', 'Bad script', 'alert(1)'), /metadata/);
  assert.deepEqual(await store.list(), []);
  await assert.rejects(() => store.project('../../elsewhere'));
  await assert.rejects(() => store.create('file:///etc/passwd', 'Invalid origin'));
});
