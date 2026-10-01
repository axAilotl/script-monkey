import { chromium } from 'playwright';
import { mkdtemp, rm, chmod, readdir, readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'script-monkey-sidebar-'));
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<title>Export workspace</title><main><button id="export">Export CSV</button></main>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.SCRIPT_MONKEY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox', `--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`] });
try {
  const sidebar = await context.newPage();
  await sidebar.setViewportSize({ width: 400, height: 600 });
  await sidebar.goto('chrome-extension://headnlhmjdmmncmbgnepdopknidmoile/sidebar.html');
  const website = await context.newPage(); await website.goto(origin); await website.bringToFront();
  // A side panel does not activate a browser tab or automatically grant activeTab.
  // Keep the website active while calling the same button handler the sidebar uses.
  await sidebar.evaluate(() => document.getElementById('inspect').click());
  await sidebar.waitForFunction(() => document.getElementById('page-status').textContent.includes('Export workspace') || document.getElementById('notice').textContent.includes('Open a regular'));
  assert.match(await sidebar.locator('#page-status').textContent(), /Export workspace/, `Website inspection failed: ${await sidebar.locator('#notice').textContent()}`);
  const input = await sidebar.locator('#prompt').boundingBox();
  assert.ok(input && input.y >= 0 && input.y + input.height <= 600, 'The prompt is below the fold at a normal sidebar height');
  assert.equal(await sidebar.locator('[data-view="settings"]').count(), 1, 'Setup must live in a Settings tab');
  await sidebar.waitForFunction(() => document.getElementById('setup-status').textContent === 'Finish setup');
  await sidebar.evaluate(() => {
    document.getElementById('prompt').value = 'Add an export shortcut';
    document.getElementById('prompt-form').requestSubmit();
  });
  await sidebar.waitForFunction(() => !document.getElementById('settings').classList.contains('hidden'));
  assert.match(await sidebar.locator('#connection-status').textContent(), /not installed/);
  assert.match(await sidebar.locator('#setup-command').textContent(), /curl.*setup\.sh/);
  assert.equal(await sidebar.locator('#prompt').inputValue(), 'Add an export shortcut');
  await sidebar.evaluate(() => document.querySelector('[data-view=chat]').click());
  await website.goto('chrome://settings');
  await sidebar.waitForFunction(() => document.getElementById('site').textContent.includes('protected'));
  await website.goto(origin + '/return');
  await sidebar.waitForFunction(() => document.getElementById('page-status').textContent.includes('Export workspace'));
  assert.equal(await sidebar.locator('#prompt').inputValue(), 'Add an export shortcut');
  await mkdir('artifacts', { recursive: true });
  await sidebar.screenshot({ path: 'artifacts/sidebar-chat.png' });
  console.log('Sidebar uses the active website without activeTab, and the prompt is visible.');
} finally { await context.close(); server.close(); await rm(profile, { recursive: true, force: true }); }

// Real extension + real native companion + controlled Codex subprocess.
const root = await mkdtemp(join(tmpdir(), 'script-monkey-ui-task-'));
await chmod(resolve('tests/fixtures/codex.mjs'), 0o700);
execFileSync(process.execPath, ['scripts/setup.mjs', '--host-dir', join(root, 'profile/NativeMessagingHosts'), '--launcher', join(root, 'launch.sh'), '--workspace', join(root, 'workspace'), '--codex', resolve('tests/fixtures/codex.mjs')]);
const taskServer = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end('<title>Export workspace</title><button>Export CSV</button>'); });
await new Promise(resolve => taskServer.listen(0, '127.0.0.1', resolve));
const taskOrigin = `http://127.0.0.1:${taskServer.address().port}`;
const taskContext = await chromium.launchPersistentContext(join(root, 'profile'), { headless: true, executablePath: process.env.SCRIPT_MONKEY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox', `--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`] });
try {
  const sidebar = await taskContext.newPage(); await sidebar.setViewportSize({ width: 400, height: 600 });
  await sidebar.goto('chrome-extension://headnlhmjdmmncmbgnepdopknidmoile/sidebar.html');
  const website = await taskContext.newPage(); await website.goto(taskOrigin); await website.bringToFront();
  await sidebar.waitForFunction(() => document.getElementById('setup-status').textContent === 'Codex ready');
  assert.equal(await sidebar.locator('#helper-setup').isVisible(), false);
  await sidebar.evaluate(() => { document.getElementById('prompt').value = 'Add an export shortcut'; document.getElementById('prompt-form').requestSubmit(); });
  await sidebar.waitForFunction(() => document.getElementById('notice').textContent.includes('Draft saved. Review'));
  const source = await sidebar.locator('#source').inputValue();
  assert.match(source, /dataset.shortcut/); assert.match(source, /script-monkey.local\//);
  const projects = await readdir(join(root, 'workspace/projects'));
  assert.equal(projects.length, 1);
  assert.match(await readFile(join(root, 'workspace/projects', projects[0], 'current.user.js'), 'utf8'), /dataset.shortcut/);
  // Reopen the panel: projects auto-load without a Connect button.
  await sidebar.reload(); await website.bringToFront();
  await sidebar.waitForFunction(() => document.querySelectorAll('#projects option').length === 2);
  assert.equal(await sidebar.locator('#setup-status').textContent(), 'Codex ready');
  console.log('Automatic helper connection, UI generation, fresh page inspection, disk save, and panel reopening passed.');
} finally { await taskContext.close(); taskServer.close(); await rm(root, { recursive: true, force: true }); }
