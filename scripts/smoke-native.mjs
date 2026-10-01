import { chromium } from 'playwright';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = await mkdtemp(join(tmpdir(), 'script-monkey-native-'));
const profile = join(root, 'profile');
execFileSync(process.execPath, ['scripts/setup.mjs', '--host-dir', join(profile, 'NativeMessagingHosts'), '--workspace', join(root, 'workspace'), '--launcher', join(root, 'launch.sh')]);
const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: process.env.SCRIPT_MONKEY_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox', `--disable-extensions-except=${resolve('dist/extension')}`, `--load-extension=${resolve('dist/extension')}`] });
try {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('chrome-extension://headnlhmjdmmncmbgnepdopknidmoile/sidebar.html');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByText('Local companion connected.', { exact: true }).waitFor();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/sidebar.png' });
  console.log(JSON.stringify({ success: true, codexStatus: await page.locator('#connection-status').textContent(), modelOptions: await page.locator('#model option').count() }));
} finally {
  await context.close(); await rm(root, { recursive: true, force: true });
}
