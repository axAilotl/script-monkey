import { chromium } from 'playwright';
import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
// Opt-in: one real Codex turn, only a controlled fixture's page data.
const root = await mkdtemp(join(tmpdir(), 'script-monkey-live-ui-'));
execFileSync(process.execPath, ['scripts/setup.mjs', '--host-dir', join(root, 'profile/NativeMessagingHosts'), '--launcher', join(root, 'launch.sh'), '--workspace', join(root, 'workspace')]);
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end(`<title>Export workspace</title><main><button id="more" onclick="document.querySelector('[role=menu]').hidden=false">More</button><div role="menu" hidden><button id="export-open" onclick="document.body.dataset.export='open'">Export CSV</button></div></main>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const context = await chromium.launchPersistentContext(join(root, 'profile'), { headless: true, executablePath: process.env.SCRIPT_MONKEY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox', `--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`] });
try {
  const sidebar = await context.newPage(); await sidebar.setViewportSize({ width: 400, height: 600 });
  await sidebar.goto('chrome-extension://headnlhmjdmmncmbgnepdopknidmoile/sidebar.html');
  const website = await context.newPage(); await website.goto(`http://127.0.0.1:${server.address().port}`); await website.bringToFront();
  await sidebar.waitForFunction(() => document.getElementById('setup-status').textContent === 'Codex ready');
  if (process.env.SCRIPT_MONKEY_MODEL) await sidebar.evaluate(model => { document.getElementById('model').value = model; }, process.env.SCRIPT_MONKEY_MODEL);
  await sidebar.evaluate(() => {
    document.getElementById('prompt').value = 'Use inspect_page to inspect the live page. Add one top-right button with id script-monkey-shortcut. Clicking it should click #more and then #export-open once it is visible. Keep setup idempotent, preserve name/namespace and the existing @include for this localhost port. No external requests.';
    document.getElementById('prompt-form').requestSubmit();
  });
  await sidebar.waitForFunction(() => document.getElementById('notice').textContent.includes('Draft saved') || document.getElementById('notice').classList.contains('error'), undefined, { timeout: 180_000 });
  assert.match(await sidebar.locator('#notice').textContent(), /Draft saved/, `Live UI task failed: ${await sidebar.locator('#notice').textContent()}`);
  const source = await sidebar.locator('#source').inputValue();
  assert.match(source, /script-monkey-shortcut/);
  assert.match(await sidebar.locator('#conversation').textContent(), /Read .*(controls|Export)/s, 'Real page inspection activity was not relayed');
  assert.match(await sidebar.locator('.activity.source pre').textContent(), /script-monkey-shortcut/, 'Real generated source was not relayed');
  await mkdir('artifacts', { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile('artifacts/sidebar-live.user.js', source);
  await sidebar.evaluate(() => document.querySelector('[data-view=chat]').click());
  await sidebar.screenshot({ path: 'artifacts/sidebar-connected.png' });
  await sidebar.evaluate(() => document.querySelector('[data-view=settings]').click());
  await sidebar.screenshot({ path: 'artifacts/sidebar-settings.png' });
  console.log('Live sidebar → native helper → existing Codex account → page tool → saved userscript passed.');
} catch (error) {
  const panel = context.pages().find(page => page.url().includes('/sidebar.html'));
  if (panel) console.log(await panel.locator('#settings').textContent(), await panel.locator('#notice').textContent());
  throw error;
} finally { await context.close(); server.close(); await rm(root, { recursive: true, force: true }); }
