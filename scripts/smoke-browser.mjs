import { chromium } from 'playwright';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';

// Opt-in: supply the extracted official Violentmonkey MV3 release directory.
const managerPath = process.env.SCRIPT_MONKEY_VM;
if (!managerPath) throw new Error('Set SCRIPT_MONKEY_VM to an extracted Violentmonkey MV3 release. Run smoke:codex first.');
const profile = await mkdtemp(join(tmpdir(), 'script-monkey-vm-'));
let source;
const server = createServer((request, response) => {
  if (request.url === '/shortcut.user.js') { response.setHeader('content-type', 'text/javascript'); response.end(source); }
  else {
    response.setHeader('content-type', 'text/html');
    response.end(`<main><button id="more" onclick="document.querySelector('[role=menu]').hidden=false">More</button><div role="menu" hidden><button id="export-open" onclick="document.body.dataset.export='open'">Export CSV</button></div></main>`);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
source = (await readFile('artifacts/codex-smoke.user.js', 'utf8')).replaceAll('https://example.com/*', `${origin}/*`);
const context = await chromium.launchPersistentContext(profile, {
  headless: true, executablePath: process.env.SCRIPT_MONKEY_CHROMIUM ?? '/usr/bin/chromium',
  args: ['--no-sandbox', `--disable-extensions-except=${resolve(managerPath)}`, `--load-extension=${resolve(managerPath)}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const managerId = new URL(worker.url()).host;
  const settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${managerId}`);
  const toggle = settings.getByRole('button', { name: /^Allow User Scripts/ });
  await toggle.waitFor();
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  const installer = await context.newPage();
  await installer.goto(`${origin}/shortcut.user.js`).catch(() => {});
  await installer.waitForURL('chrome-extension://*/confirm/index.html*');
  await installer.getByRole('button', { name: 'Install', exact: true }).click();
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('#script-monkey-shortcut').waitFor({ timeout: 15_000 });
  await page.locator('#script-monkey-shortcut').click();
  await page.waitForFunction(() => document.body.dataset.export === 'open');
  await page.locator('#script-monkey-shortcut').click();
  assert.equal(await page.locator('#script-monkey-shortcut').count(), 1);
  await page.reload();
  await page.locator('#script-monkey-shortcut').waitFor();
  await page.locator('#script-monkey-shortcut').click();
  await page.waitForFunction(() => document.body.dataset.export === 'open');
  console.log(JSON.stringify({ success: true, managerId, checked: ['install', 'shortcut reaches export', 'no duplicate controls', 'reload'] }));
} finally {
  await context.close(); server.close(); await rm(profile, { recursive: true, force: true });
}
