import { zipSync } from 'fflate';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const files = {};
async function add(path) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const name = join(path, item.name);
    if (item.isDirectory()) await add(name);
    else files[`script-monkey/${name}`] = new Uint8Array(await readFile(name));
  }
}
await add('dist');
await add('docs');
for (const name of ['README.md', 'LICENSE', 'scripts/setup.mjs', 'scripts/install.sh']) files[`script-monkey/${name}`] = new Uint8Array(await readFile(name));
await mkdir('artifacts', { recursive: true });
await writeFile(`artifacts/script-monkey-${version}.zip`, zipSync(files));
console.log(`Packaged artifacts/script-monkey-${version}.zip`);
