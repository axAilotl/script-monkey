#!/usr/bin/env node
import { mkdir, writeFile, readFile, unlink, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { constants } from 'node:fs';
import { delimiter } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const browser = option('--browser', 'chromium');
const workspace = resolve(option('--workspace', join(homedir(), 'Script Monkey')));
const browserDirs = process.platform === 'darwin'
  ? { chromium: 'Library/Application Support/Chromium', chrome: 'Library/Application Support/Google/Chrome', brave: 'Library/Application Support/BraveSoftware/Brave-Browser', edge: 'Library/Application Support/Microsoft Edge' }
  : { chromium: '.config/chromium', chrome: '.config/google-chrome', brave: '.config/BraveSoftware/Brave-Browser', edge: '.config/microsoft-edge' };
if (args.includes('--help')) {
  console.log('node scripts/setup.mjs --browser chromium|chrome|brave|edge [--workspace /path/to/scripts] [--host-dir /custom/profile/NativeMessagingHosts] [--codex /absolute/path/to/codex] [--remove]');
  process.exit(0);
}
if (!['linux', 'darwin'].includes(process.platform)) throw new Error('Automatic native-host setup supports Linux and macOS in this version.');
if (!browserDirs[browser]) throw new Error(`Unknown browser: ${browser}`);
const hostDir = resolve(option('--host-dir', join(homedir(), browserDirs[browser], 'NativeMessagingHosts')));
const launcher = resolve(option('--launcher', join(root, '.script-monkey-host.sh')));
const manifestFile = join(hostDir, 'io.github.script_monkey.json');
if (args.includes('--remove')) {
  const installed = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (installed.path !== launcher) throw new Error('This host registration belongs to a different installation.');
  await unlink(manifestFile);
  console.log('Removed native-host registration. Your projects and extension are untouched.');
  process.exit(0);
}
const manifest = JSON.parse(await readFile(join(root, 'dist/extension/manifest.json'), 'utf8'));
if (!manifest.key) throw new Error('Built extension is missing its stable public key.');
const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, character => String.fromCharCode(97 + parseInt(character, 16)));
const quote = value => `'${value.replace(/'/g, "'\\''")}'`;
await mkdir(hostDir, { recursive: true, mode: 0o700 });
try {
  const existing = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (existing.path !== launcher) throw new Error('A different Script Monkey installation is registered. Remove it with its setup script first.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
let codex = option('--codex', process.env.SCRIPT_MONKEY_CODEX);
if (!codex) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, 'codex');
    try { await access(candidate, constants.X_OK); codex = resolve(candidate); break; } catch {}
  }
}
const environment = codex ? `export SCRIPT_MONKEY_CODEX=${quote(codex)}\n` : '';
await writeFile(launcher, `#!/bin/sh\n${environment}exec ${quote(process.execPath)} ${quote(join(root, 'dist/companion/host.mjs'))} --workspace ${quote(workspace)} "$@"\n`, { mode: 0o700 });
await writeFile(manifestFile, JSON.stringify({ name: 'io.github.script_monkey', description: 'Script Monkey local companion', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }, null, 2), { mode: 0o600 });
console.log(`Registered Script Monkey for ${browser}.\nExtension ID: ${id}\nProject folder: ${workspace}\nLoad unpacked extension: ${join(root, 'dist/extension')}\nKeep this installation folder in place; the native host runs from it.`);
