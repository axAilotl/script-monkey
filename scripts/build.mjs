import { build } from 'esbuild';
import { mkdir, copyFile, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/extension', { recursive: true });
await mkdir('dist/companion', { recursive: true });
await build({ entryPoints: ['src/extension/worker.ts', 'src/extension/sidebar.ts'], outdir: 'dist/extension', bundle: true, format: 'esm', platform: 'browser', target: 'chrome138' });
await build({ entryPoints: ['src/companion/main.ts'], outfile: 'dist/companion/host.mjs', bundle: true, format: 'esm', platform: 'node', target: 'node22', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
await build({ entryPoints: ['node_modules/tampermonkey-mcp/dist/index.js'], outfile: 'dist/companion/tampermonkey-mcp.mjs', bundle: true, format: 'esm', platform: 'node', target: 'node22', banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } });
for (const name of ['manifest.json', 'sidebar.html', 'sidebar.css']) await copyFile(`src/extension/${name}`, `dist/extension/${name}`);

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let notices = 'Script Monkey bundles third-party software under the licenses below.\n\n';
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  notices += `${path.replace(/^node_modules\//, '')} ${info.version} — ${info.license ?? 'See package license'}\n`;
  const files = await readdir(path).catch(() => []);
  const license = files.find(name => /^licen[sc]e(?:\..*)?$/i.test(name));
  if (license) notices += (await readFile(join(path, license), 'utf8')) + '\n';
  notices += '\n';
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', notices);
console.log('Built extension and local companion in dist/.');
