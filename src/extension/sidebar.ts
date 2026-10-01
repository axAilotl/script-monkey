import type { ManagerScript, Page, Project, ProjectView, Request, Revision } from '../shared/model.js';
import { metadata, siteOrigin } from '../shared/userscript.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
let view: ProjectView | undefined;
let captured: { page: Page; tabId: number; documentId: string } | undefined;
let busy = false;
let fileMode: 'script' | 'backup' = 'script';
function notice(text: string, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
async function message<T>(value: unknown): Promise<T> {
  const reply = await chrome.runtime.sendMessage(value);
  if (reply?.error) throw new Error(reply.error);
  return reply.result as T;
}
const request = <T>(value: Request) => message<T>({ action: 'request', request: value });
function on(id: string, action: () => Promise<unknown> | unknown) {
  $(id).addEventListener('click', () => { void Promise.resolve().then(action).catch(error => notice(error instanceof Error ? error.message : String(error), true)); });
}
function show(name: string) {
  for (const section of document.querySelectorAll<HTMLElement>('.view')) section.classList.toggle('hidden', section.id !== name);
  for (const button of document.querySelectorAll<HTMLElement>('[data-view]')) button.classList.toggle('active', button.dataset.view === name);
}
function revision(): Revision {
  const value = view?.revisions.find(item => item.id === view?.project.currentRevisionId);
  if (!value) throw new Error('Choose or create a project first.');
  return value;
}
function projectId() { if (!view) throw new Error('Choose a project first.'); return view.project.id; }
async function inspect(): Promise<typeof captured> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error('Open a regular website and click the extension icon.');
  const origin = siteOrigin(tab.url);
  const allowed = await chrome.permissions.contains({ origins: [`${origin}/*`] });
  if (!allowed) {
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error('Page access was not granted.');
  }
  captured = await message({ action: 'inspect', tabId: tab.id });
  $('site').textContent = new URL(captured!.page.url).hostname;
  $('page-status').textContent = `${captured!.page.title} · ${captured!.page.selectors.length} visible controls`;
  return captured;
}
function download(filename: string, content: string, type = 'text/javascript') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const scriptFilename = () => `${(metadata(revision().source).name?.[0] ?? 'customization').replace(/[^\w .-]/g, '_')}.user.js`;
function card(title: string, description: string, label: string, action: () => Promise<unknown>) {
  const element = document.createElement('div'); element.className = 'card';
  const heading = document.createElement('strong'); heading.textContent = title;
  const text = document.createElement('p'); text.textContent = description;
  const button = document.createElement('button'); button.textContent = label;
  button.addEventListener('click', () => { void action().catch(error => notice(String(error), true)); });
  element.append(heading, text, button); return element;
}
async function projects() {
  const list = await request<Project[]>({ method: 'projects' });
  const select = $<HTMLSelectElement>('projects'); select.replaceChildren(new Option('Choose or create a project', ''));
  $('project-list').replaceChildren();
  for (const project of list) {
    select.add(new Option(`${new URL(project.origin).hostname} · ${project.name}`, project.id));
    $('project-list').append(card(project.name, project.origin, 'Open project', async () => { render(await request({ method: 'project', projectId: project.id })); show('chat'); }));
  }
  select.value = view?.project.id ?? '';
}
function changes(before: string, after: string): string {
  if (before === after) return 'No source changes.';
  const a = before.split('\n'), b = after.split('\n');
  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first++;
  let endA = a.length, endB = b.length;
  while (endA > first && endB > first && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return [`Changed section, starting at line ${first + 1}:`, ...a.slice(first, endA).map(line => `- ${line}`), ...b.slice(first, endB).map(line => `+ ${line}`)].join('\n');
}
function render(value: ProjectView) {
  view = value;
  $<HTMLSelectElement>('projects').value = view.project.id;
  const current = revision();
  $<HTMLTextAreaElement>('source').value = current.source;
  $<HTMLDetailsElement>('draft').open = true;
  const meta = metadata(current.source);
  $('script-meta').textContent = `Sites: ${[...(meta.match ?? []), ...(meta.include ?? [])].join(', ')}\nGrants: ${(meta.grant ?? ['none']).join(', ')}${meta.updateURL || meta.downloadURL ? '\nThis script has an upstream update URL. Manager updates can replace personal edits.' : ''}`;
  const previous = view.revisions.filter(item => item.id !== current.id)[0];
  $('diff').textContent = changes(view.project.manager?.source ?? previous?.source ?? '', current.source);
  $('apply').toggleAttribute('disabled', !view.project.manager || busy);
  $('conversation').replaceChildren();
  for (const event of value.events.filter(event => ['user', 'assistant', 'error'].includes(event.type)).slice(-30)) {
    const element = document.createElement('div'); element.className = `message ${event.type}`;
    const role = document.createElement('span'); role.className = 'role'; role.textContent = event.type === 'user' ? 'You' : event.type === 'assistant' ? 'Codex' : 'Task interrupted';
    element.append(role, document.createTextNode(event.text)); $('conversation').append(element);
  }
  if (!$('conversation').childElementCount) $('conversation').append(card('Ready to customize', 'Describe a change below. Existing source is kept in the revision history.', 'Inspect current page', inspect));
  $('conversation').scrollTop = $('conversation').scrollHeight;
  $('revisions').replaceChildren();
  for (const item of view.revisions) {
    const installed = item.id === view.project.appliedRevisionId ? ' · source verified in manager' : '';
    $('revisions').append(card(new Date(item.createdAt).toLocaleString() + installed, item.note, 'Restore as draft', async () => {
      render(await request({ method: 'restore', projectId: projectId(), revisionId: item.id })); show('chat'); notice('Previous code restored as a saved draft. Apply it through your manager.');
    }));
  }
  for (const check of view.events.filter(event => event.type === 'check').slice(-10)) $('revisions').append(card('Recorded page check', check.text, 'View script', async () => { show('chat'); }));
}
async function saved() {
  const source = $<HTMLTextAreaElement>('source').value;
  if (source !== revision().source) render(await request({ method: 'save', projectId: projectId(), source, note: 'Manual source edit' }));
  return revision();
}
function setBusy(value: boolean) {
  busy = value;
  for (const id of ['generate', 'new', 'save', 'install', 'apply', 'projects']) $(id).toggleAttribute('disabled', value || (id === 'apply' && !view?.project.manager));
  $('cancel').classList.toggle('hidden', !value);
}
on('connect', async () => {
  notice('Connecting to your machine…');
  const status = await request<{ workspace: string; codex: any }>({ method: 'status' });
  $('workspace').textContent = status.workspace;
  const models = $<HTMLSelectElement>('model');
  models.replaceChildren(new Option('Use CLI configuration', ''));
  for (const model of status.codex.models ?? []) models.add(new Option(model.name, model.model));
  $('connection-status').textContent = status.codex.error ? status.codex.error : status.codex.account ? 'Codex CLI connected using its existing sign-in.' : 'Codex CLI found. Sign in with codex login in your terminal first.';
  await projects(); notice('Local companion connected.');
});
on('pair', async () => { const result = await request<{ code: string }>({ method: 'pair' }); $('pair-code').textContent = result.code; $<HTMLDetailsElement>('connection').open = true; notice('Enter this code in Tampermonkey Editors. Keep the companion connected.'); });
on('inspect', inspect);
on('new', async () => {
  const capture = await inspect();
  const name = window.prompt('Name this customization', 'My website shortcut');
  if (!name?.trim()) return;
  render(await request({ method: 'create', origin: capture!.page.url, name: name.trim() })); await projects();
});
on('example', () => { $<HTMLTextAreaElement>('prompt').value = 'Add a button in the top right that opens the export menu directly. Inspect the page to find the existing controls, and preserve the original menu.'; $<HTMLTextAreaElement>('prompt').focus(); });
$('prompt-form').addEventListener('submit', event => {
  event.preventDefault();
  if (busy) return;
  void (async () => {
    const prompt = $<HTMLTextAreaElement>('prompt').value.trim();
    if (!prompt) return;
    const capture = await inspect();
    if (!view) { render(await request({ method: 'create', origin: capture!.page.url, name: new URL(capture!.page.url).hostname + ' customization' })); await projects(); }
    await saved(); setBusy(true); notice('Working with Codex…');
    try {
      const result = await message<ProjectView>({ action: 'request', request: { method: 'generate', projectId: projectId(), prompt, page: capture!.page, model: $<HTMLSelectElement>('model').value || undefined }, target: { tabId: capture!.tabId, url: capture!.page.url, documentId: capture!.documentId } });
      render(result); $<HTMLTextAreaElement>('prompt').value = ''; notice('Draft saved on disk. Install or update it through your manager.');
    } finally { setBusy(false); }
  })().catch(error => notice(error instanceof Error ? error.message : String(error), true));
});
on('cancel', () => request({ method: 'cancel' }));
on('save', async () => { await saved(); notice('Saved a new source revision on disk.'); });
on('download', async () => { const value = await saved(); download(scriptFilename(), value.source); notice('Open the .user.js with your manager, or import it from its dashboard.'); });
on('copy', async () => { const value = await saved(); await navigator.clipboard.writeText(value.source); notice('Copied. Paste into your userscript manager editor.'); });
on('install', async () => { const value = await saved(); const result = await request<{ url: string }>({ method: 'install-url', projectId: projectId(), revisionId: value.id }); await chrome.tabs.create({ url: result.url }); notice('Install handoff opened. If no installer appears, download or copy the code.'); });
on('apply', async () => { const value = await saved(); render(await request({ method: 'apply', projectId: projectId(), revisionId: value.id })); notice('Updated and read back from Tampermonkey. Reload the website to test it.'); });
on('verify', async () => { const value = await saved(); render(await request({ method: 'verify-install', projectId: projectId(), revisionId: value.id })); notice('Exact source verified in Tampermonkey. Page behavior still needs testing.'); });
on('reload', async () => {
  if (!captured) await inspect();
  const tabId = captured!.tabId;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Reload timed out. Inspect again after the page loads.')); }, 20_000);
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => { if (id === tabId && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
    void chrome.tabs.reload(tabId).catch(error => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); reject(error); });
  });
  captured = await message({ action: 'inspect', tabId });
  $('page-status').textContent = `${captured!.page.selectors.length} visible controls after reload.`;
  notice('Reloaded and inspected. Try the new behavior, then save a test note.');
});
on('check', async () => {
  const capture = await inspect(), note = window.prompt('What did you observe when testing the script?');
  if (!note) return;
  render(await request({ method: 'record-check', projectId: projectId(), revisionId: revision().id, page: capture!.page, note })); notice('Test observation saved with this revision.');
});
on('manager-list', async () => {
  const scripts = await request<ManagerScript[]>({ method: 'manager-list' });
  $('manager-scripts').replaceChildren();
  for (const script of scripts) $('manager-scripts').append(card(script.name, script.namespace, 'Import / refresh source', async () => {
    const capture = await inspect();
    render(await request({ method: 'manager-import', path: script.path, origin: capture!.page.url })); await projects(); show('chat');
  }));
  notice(`${scripts.length} existing scripts found in Tampermonkey.`);
});
on('import-script', () => { fileMode = 'script'; $<HTMLInputElement>('file').accept = '.js'; $<HTMLInputElement>('file').click(); });
on('import-backup', () => { fileMode = 'backup'; $<HTMLInputElement>('file').accept = '.json'; $<HTMLInputElement>('file').click(); });
$('file').addEventListener('change', () => { void (async () => {
  const file = $<HTMLInputElement>('file').files?.[0]; if (!file) return;
  if (file.size > 32 * 1024 * 1024) throw new Error('Import exceeds 32 MB.');
  const text = await file.text();
  if (fileMode === 'backup') render(await request({ method: 'import-backup', backup: JSON.parse(text) }));
  else { const capture = await inspect(); render(await request({ method: 'create', origin: capture!.page.url, name: metadata(text).name?.[0] ?? file.name, source: text })); }
  await projects(); show('chat'); $<HTMLInputElement>('file').value = ''; notice('Imported into your disk-backed project library.');
})().catch(error => notice(String(error), true)); });
on('export', async () => { const backup = await request({ method: 'export', projectId: projectId() }); download(`${view!.project.name.replace(/[^\w.-]/g, '_')}.script-monkey.json`, JSON.stringify(backup, null, 2), 'application/json'); notice('Portable backup exported with source history and conversation.'); });
$('projects').addEventListener('change', () => { const id = $<HTMLSelectElement>('projects').value; if (id) void request<ProjectView>({ method: 'project', projectId: id }).then(render).catch(error => notice(String(error), true)); });
for (const button of document.querySelectorAll<HTMLElement>('[data-view]')) button.addEventListener('click', () => show(button.dataset.view!));
chrome.runtime.onMessage.addListener(message => { if (message.event === 'progress') notice(message.text); });
void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => { if (tab?.url?.startsWith('http')) $('site').textContent = new URL(tab.url).hostname; });
