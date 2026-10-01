import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../src/companion/codex.js';
import { template, validateSource } from '../src/shared/userscript.js';
import type { Page, Project } from '../src/shared/model.js';

// Opt-in: uses the developer's existing Codex login for one real inference turn.
const root = await mkdtemp(join(tmpdir(), 'script-monkey-live-codex-'));
const page: Page = { url: 'https://example.com/', title: 'Export menu test', text: 'Workspace More Export CSV', html: '<main><button id="more">More</button><div role="menu" hidden><button id="export-open">Export CSV</button></div></main>', selectors: ['button#more: More', 'button#export-open: Export CSV'] };
let inspections = 0;
const codex = new Codex(root, async () => { inspections++; return page; }, text => process.stderr.write(text + '\n'));
try {
  const project: Project = { schemaVersion: 1, id: crypto.randomUUID(), name: 'Export menu shortcut', origin: 'https://example.com', createdAt: new Date().toISOString() };
  const result = await codex.generate(project, 'Inspect the page with inspect_page, then add one fixed top-right button with id script-monkey-shortcut. On click it should click #more to open the existing menu, then click #export-open once it becomes visible. Make setup idempotent. No external requests. Keep this script name and namespace.', page, template(project.origin, project.name), async id => { project.threadId = id; });
  validateSource(result.source);
  if (!result.source.includes('script-monkey-shortcut') || inspections < 1) throw new Error('The live agent did not satisfy the smoke-test contract.');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/codex-smoke.user.js', result.source);
  console.log(JSON.stringify({ success: true, inspections, saved: 'artifacts/codex-smoke.user.js' }));
} finally { codex.close(); await rm(root, { recursive: true, force: true }); }
