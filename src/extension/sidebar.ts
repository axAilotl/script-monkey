import type { AgentActivity, ManagerScript, Page, Project, ProjectView, Request, Revision } from '../shared/model.js';
import { metadata, siteOrigin } from '../shared/userscript.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
let view: ProjectView | undefined;
type Capture = { page: Page; tabId: number; documentId: string };
let captured: Capture | undefined;
let busy = false;
let fileMode: 'script' | 'backup' = 'script';
let libraryWarnings: string[] = [];
let helperReady = false;
let codexReady = false;
let checkingSetup: Promise<boolean> | undefined;
let windowId: number | undefined;
let pageVersion = 0;
const projectTargets = new Map<string, number>();
const activityElements = new Map<string, HTMLElement>();
let liveProjectId: string | undefined;
let liveSource: AgentActivity | undefined;
const installHandoffs = new Set<string>();
type PageContext = { tabId: number; url: string; title: string; supported: boolean; reason?: string };
const isMissingHelper = (error: unknown) => /native messaging host.*not found|specified native messaging|access to the specified native messaging host|disconnected port/i.test(String(error));
function failed(error: unknown) {
  if (isMissingHelper(error)) {
    missingHelper(error); show('settings');
    notice('Install the local helper using the command here, then click Check setup again.', true);
  } else if (/model.*not supported|model.*not available/i.test(String(error))) {
    show('settings'); $('model').scrollIntoView({ block: 'center' });
    notice('That model is not available with your Codex login. Choose another model here, then retry your message in Chat.', true);
    $('connection-error').textContent = String(error);
  } else notice(error instanceof Error ? error.message : String(error), true);
}
function missingHelper(error: unknown) {
  helperReady = false; codexReady = false;
  $('setup-status').textContent = 'Finish setup'; $('setup-status').classList.remove('ready');
  $('setup-hint').classList.remove('hidden'); $('helper-setup').classList.remove('hidden');
  $('connection-status').textContent = 'The local helper is not installed for this browser yet.';
  $('connection-error').textContent = String(error);
  $('codex-status').textContent = 'Install the helper below so this sidebar can use your existing Codex login.';
}
function setupCommand() {
  const browser = $<HTMLSelectElement>('browser').value;
  $('setup-command').textContent = `curl -fsSL https://github.com/axAilotl/script-monkey/releases/download/v0.1.2/setup.sh | sh -s -- --browser ${browser}`;
}

function recoveryWarnings(warnings: string[] = []) {
  $('recovery-warning').textContent = [...libraryWarnings, ...warnings].join('\n');
  $('recovery-warning').classList.toggle('hidden', !$('recovery-warning').textContent);
}
function notice(text: string, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
async function message<T>(value: unknown): Promise<T> {
  const reply = await chrome.runtime.sendMessage(value);
  if (reply?.error) throw new Error(reply.error);
  return reply.result as T;
}
const request = <T>(value: Request) => message<T>({ action: 'request', request: value });
function on(id: string, action: () => Promise<unknown> | unknown) {
  $(id).addEventListener('click', () => { void Promise.resolve().then(action).catch(failed); });
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
async function context(): Promise<PageContext> {
  return message({ action: 'page-context', windowId });
}
async function inspect(): Promise<Capture> {
  captured = undefined;
  const tab = await context();
  if (!tab.supported) throw new Error(tab.reason);
  const value = await message<Capture>({ action: 'inspect', tabId: tab.tabId });
  captured = value;
  $('site').textContent = new URL(value.page.url).host;
  $('page-status').textContent = value.page.title || 'Page ready';
  $('access-status').textContent = `Page read successfully: ${value.page.title || new URL(value.page.url).host}. ${value.page.selectors.length} visible controls found.`;
  return value;
}
async function refreshPage() {
  if (busy) return;
  const version = ++pageVersion;
  captured = undefined;
  try {
    const tab = await context();
    if (version !== pageVersion) return;
    $('site').textContent = tab.supported ? new URL(tab.url).host : 'This page is protected by Chrome';
    $('page-status').textContent = tab.supported ? tab.title : '';
    if (!tab.supported) { captured = undefined; $('access-status').textContent = tab.reason!; return; }
    const value = await message<Capture>({ action: 'inspect', tabId: tab.tabId });
    if (version !== pageVersion) return;
    captured = value;
    $('page-status').textContent = value.page.title || 'Page ready';
    $('access-status').textContent = `${value.page.selectors.length} visible controls found. Page access is working.`;
  } catch (error) {
    if (version === pageVersion) {
      $('access-status').textContent = `Page access is blocked. In Chrome’s extension menu, open Script Monkey → Site access → On all sites. ${String(error)}`;
      $('page-status').textContent = 'Page access blocked · see Settings';
    }
  }
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
  button.addEventListener('click', () => { void action().catch(failed); });
  element.append(heading, text, button); return element;
}
function chatMessage(role: string, text: string, type = '') {
  const element = document.createElement('div'); element.className = `message ${type}`;
  const label = document.createElement('span'); label.className = 'role'; label.textContent = role;
  const content = document.createElement('div'); content.textContent = text;
  element.append(label, content); $('conversation').append(element);
}
function activity(value: AgentActivity) {
  const conversation = $('conversation');
  const follow = conversation.scrollTop + conversation.clientHeight >= conversation.scrollHeight - 50;
  let element = activityElements.get(value.id);
  if (!element) {
    element = document.createElement(value.kind === 'source' ? 'details' : 'div');
    element.className = `message activity ${value.kind}`;
    const label = document.createElement(value.kind === 'source' ? 'summary' : 'span'); label.className = 'role';
    const content = document.createElement(value.kind === 'source' ? 'pre' : 'div'); content.className = 'activity-content';
    element.append(label, content); conversation.append(element); activityElements.set(value.id, element);
    if (value.kind === 'source') (element as HTMLDetailsElement).open = value.state === 'running';
  }
  element.classList.toggle('failed', value.state === 'failed');
  const label = element.querySelector<HTMLElement>('.role')!;
  label.textContent = ({ source: 'Code · live preview', tool: 'Page inspection', message: 'Codex', summary: 'Codex summary', plan: 'Plan', status: 'Progress', command: 'Command' })[value.kind];
  label.dataset.state = value.state === 'running' ? 'Working…' : value.state === 'failed' ? 'Failed' : 'Done';
  const content = element.querySelector<HTMLElement>('.activity-content')!;
  const followCode = content.scrollTop + content.clientHeight >= content.scrollHeight - 30;
  content.textContent = value.text;
  if (value.kind === 'source' && followCode) content.scrollTop = content.scrollHeight;
  if (follow) conversation.scrollTop = conversation.scrollHeight;
}
function delivery() {
  $('delivery').classList.toggle('hidden', !view);
  if (!view) return;
  const installed = view.project.appliedRevisionId === view.project.currentRevisionId;
  const opened = installHandoffs.has(revision().id);
  const status = installed ? 'Source verified in Tampermonkey' : opened ? 'Installer opened · installation not verified' : view.project.appliedRevisionId ? 'New draft saved · source not verified' : 'Draft saved · installation unverified';
  const help = installed ? 'Reload the website and test the change.' : opened ? 'Finish Install / Update in your manager, then reload the website.' : 'Install or update this code in your manager before reloading.';
  $('delivery-status').textContent = status; $('delivery-help').textContent = help;
  $('library-delivery').textContent = `${status}. ${help}`;
  $('chat-install').textContent = view.project.manager ? 'Update Tampermonkey' : 'Install in manager';
  $('chat-install').classList.toggle('hidden', installed);
  $('chat-reload').classList.toggle('hidden', !installed && !opened);
}
async function projects() {
  const list = await request<Project[]>({ method: 'projects' });
  const select = $<HTMLSelectElement>('projects'); select.replaceChildren(new Option('New customization', ''));
  $('project-list').replaceChildren();
  for (const project of list) {
    select.add(new Option(`${new URL(project.origin).hostname} · ${project.name}`, project.id));
    $('project-list').append(card(project.name, project.origin, 'Open project', async () => { render(await request({ method: 'project', projectId: project.id })); show('chat'); }));
  }
  select.value = view?.project.id ?? '';
  $('project-picker').classList.toggle('hidden', list.length === 0);
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
  void chrome.storage.local.set({ lastProject: value.project.id });
  if (captured && siteOrigin(captured.page.url) === value.project.origin) projectTargets.set(value.project.id, captured.tabId);
  recoveryWarnings(value.warnings);
  $<HTMLSelectElement>('projects').value = view.project.id;
  const current = revision();
  $<HTMLTextAreaElement>('source').value = current.source;
  $('draft').classList.remove('hidden');
  const meta = metadata(current.source);
  $('script-meta').textContent = `Sites: ${[...(meta.match ?? []), ...(meta.include ?? [])].join(', ')}\nGrants: ${(meta.grant ?? ['unspecified (manager default)']).join(', ')}${meta.updateURL || meta.downloadURL ? '\nThis script has an upstream update URL. Manager updates can replace personal edits.' : ''}`;
  const previous = view.revisions.filter(item => item.id !== current.id)[0];
  $('diff').textContent = changes(view.project.manager?.source ?? previous?.source ?? '', current.source);
  $('apply').toggleAttribute('disabled', !view.project.manager || busy);
  $('conversation').replaceChildren();
  activityElements.clear();
  for (const event of value.events.filter(event => ['user', 'assistant', 'error', 'activity'].includes(event.type)).slice(-60)) {
    if (event.type === 'activity') {
      try { const item = JSON.parse(event.text) as AgentActivity; if (['status', 'message', 'tool', 'summary', 'plan', 'command'].includes(item.kind)) activity({ ...item, id: `${event.at}:${item.id}` }); } catch { /* A damaged activity line must not hide saved code. */ }
    } else chatMessage(event.type === 'user' ? 'You' : event.type === 'assistant' ? 'Codex' : 'Task interrupted', event.text, event.type);
  }
  if (value.project.id === liveProjectId && liveSource) activity(liveSource);
  if (!$('conversation').childElementCount) $('conversation').append(card('Ready to customize', 'Describe a change below. Existing source is kept in the revision history.', 'Inspect current page', inspect));
  $('conversation').scrollTop = $('conversation').scrollHeight;
  delivery();
  $('revisions').replaceChildren();
  for (const item of view.revisions) {
    const installed = item.id === view.project.appliedRevisionId ? ' · source verified in manager' : '';
    $('revisions').append(card(new Date(item.createdAt).toLocaleString() + installed, item.note, 'Restore as draft', async () => {
      render(await request({ method: 'restore', projectId: projectId(), revisionId: item.id })); show('library'); notice('Previous code restored as a saved draft. Apply it through your manager.');
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
  for (const id of ['generate', 'new', 'save', 'install', 'apply', 'projects', 'chat-install', 'chat-reload']) $(id).toggleAttribute('disabled', value || (id === 'apply' && !view?.project.manager));
  $('cancel').classList.toggle('hidden', !value);
}
async function checkSetup(): Promise<boolean> {
  if (checkingSetup) return checkingSetup;
  checkingSetup = (async () => {
    $('setup-status').textContent = 'Checking setup…';
    try {
      const status = await request<{ workspace: string; codex: any; warnings: string[] }>({ method: 'status' });
      helperReady = true; codexReady = !!status.codex.account && !status.codex.error;
      libraryWarnings = status.warnings; recoveryWarnings(view?.warnings);
      $('workspace').textContent = `Scripts are saved in ${status.workspace}`;
      $('helper-setup').classList.toggle('hidden', !status.codex.error);
      $('connection-status').textContent = 'Local helper installed and running. It starts automatically.';
      $('connection-error').textContent = status.codex.error ?? '';
      $('codex-status').textContent = status.codex.error ? `Codex could not start. Re-run the helper installer from a terminal where codex works. ${status.codex.error}` : codexReady ? `Connected using your existing Codex login.${status.codex.configuredModel ? ` CLI model: ${status.codex.configuredModel}.` : ''}` : 'Codex is installed but needs a login. Run codex login in your terminal, then Check setup again.';
      $('setup-status').textContent = codexReady ? 'Codex ready' : 'Codex needs setup';
      $('setup-status').classList.toggle('ready', codexReady);
      $('setup-hint').classList.toggle('hidden', codexReady);
      const models = $<HTMLSelectElement>('model'), selected = models.value;
      models.replaceChildren(new Option('Use CLI configuration', ''));
      for (const model of status.codex.models ?? []) models.add(new Option(model.name, model.model));
      const preference = await chrome.storage.local.get('model');
      models.value = typeof preference.model === 'string' ? preference.model : status.codex.suggestedModel ?? selected;
      if (codexReady && status.codex.suggestedModel && typeof preference.model !== 'string') $('codex-status').textContent += ` This sidebar will use ${status.codex.suggestedModel} because the configured model is not in Codex's available list. You can change this below.`;
      await projects();
      const previous = await chrome.storage.local.get('lastProject');
      if (!view && typeof previous.lastProject === 'string' && [...$<HTMLSelectElement>('projects').options].some(option => option.value === previous.lastProject)) render(await request({ method: 'project', projectId: previous.lastProject }));
      return codexReady;
    } catch (error) {
      missingHelper(error);
      if (!isMissingHelper(error)) $('connection-status').textContent = 'The local helper could not start. Reinstall it with the command below.';
      return false;
    }
  })().finally(() => { checkingSetup = undefined; });
  return checkingSetup;
}
async function requireHelper() {
  if (!helperReady && !await checkSetup()) {
    show('settings'); notice('Run the setup command here once. Your message is kept in Chat.', true);
    return false;
  }
  return true;
}
on('connect', async () => { if (await checkSetup()) notice('Codex is ready. Return to Chat and describe your change.'); else notice('Follow the setup steps shown here.', true); });
on('setup-status', () => show('settings'));
on('open-setup', () => show('settings'));
on('copy-setup', async () => { await navigator.clipboard.writeText($('setup-command').textContent!); notice('Copied. Run it in your terminal, then click Check setup again.'); });
$('browser').addEventListener('change', setupCommand);
on('manager-setup', () => { show('settings'); $('manager-settings').scrollIntoView({ block: 'start' }); });
on('pair', async () => {
  if (!await requireHelper()) return;
  notice('Getting a code from the local Tampermonkey bridge…');
  const result = await request<{ code: string }>({ method: 'pair' });
  $('pair-code').textContent = result.code; $('pair-code').classList.remove('hidden');
  $('manager-status').textContent = 'Code ready. Paste it into Tampermonkey Editors, then Check pairing.';
  notice('Pairing code ready. The steps are shown above it.');
});
on('check-pair', async () => {
  if (!await requireHelper()) return;
  try {
    const scripts = await request<ManagerScript[]>({ method: 'manager-list' });
    $('manager-status').textContent = `Tampermonkey connected. ${scripts.length} installed scripts available in Scripts.`;
    notice('Tampermonkey pairing works.');
  } catch (error) {
    $('manager-status').textContent = 'Not connected yet. Keep Editors open and paste the pairing code from this sidebar into its MCP connection field.';
    $('connection-error').textContent = String(error);
    notice('Pairing is not finished. Follow the three steps above.', true);
  }
});
on('inspect', inspect);
on('new', async () => {
  if (!await requireHelper()) return;
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
    if (!await requireHelper()) return;
    if (!codexReady) { show('settings'); notice('Finish the Codex setup shown here. Your message is kept in Chat.', true); return; }
    const capture = await inspect();
    if (view && view.project.origin !== siteOrigin(capture.page.url)) view = undefined;
    if (!view) { render(await request({ method: 'create', origin: capture!.page.url, name: new URL(capture!.page.url).hostname + ' customization' })); await projects(); }
    await saved(); setBusy(true); notice('Working with Codex…');
    liveProjectId = projectId(); liveSource = undefined; activityElements.clear();
    show('chat');
    chatMessage('You', prompt, 'user');
    $('conversation').scrollTop = $('conversation').scrollHeight;
    try {
      const result = await message<ProjectView>({ action: 'request', request: { method: 'generate', projectId: projectId(), prompt, page: capture!.page, model: $<HTMLSelectElement>('model').value || undefined }, target: { tabId: capture!.tabId, url: capture!.page.url, documentId: capture!.documentId } });
      render(result); $<HTMLTextAreaElement>('prompt').value = ''; notice('Draft saved. Install or update it in your manager to change the website.');
    } catch (error) {
      // Keep streamed activity and the submitted request visible on failure.
      chatMessage('Task interrupted', error instanceof Error ? error.message : String(error), 'error');
      throw error;
    } finally { setBusy(false); }
  })().catch(failed);
});
on('cancel', () => request({ method: 'cancel' }));
on('save', async () => { await saved(); notice('Saved a new source revision on disk.'); });
on('download', async () => { const value = await saved(); download(scriptFilename(), value.source); notice('Open the .user.js with your manager, or import it from its dashboard.'); });
on('copy', async () => { const value = await saved(); await navigator.clipboard.writeText(value.source); notice('Copied. Paste into your userscript manager editor.'); });
async function install() {
  const value = await saved(); const result = await request<{ url: string }>({ method: 'install-url', projectId: projectId(), revisionId: value.id });
  await chrome.tabs.create({ url: result.url }); installHandoffs.add(value.id); delivery();
  notice('Finish Install / Update in your manager’s screen, then reload the website. If no installer appears, use Download or Copy in Scripts.');
}
async function apply() { const value = await saved(); render(await request({ method: 'apply', projectId: projectId(), revisionId: value.id })); notice('Updated and read back from Tampermonkey. Reload the website to test it.'); }
on('install', install);
on('apply', apply);
on('chat-install', () => view?.project.manager ? apply() : install());
on('chat-source', () => show('library'));
on('verify', async () => { const value = await saved(); render(await request({ method: 'verify-install', projectId: projectId(), revisionId: value.id })); notice('Exact source verified in Tampermonkey. Page behavior still needs testing.'); });
async function reloadWebsite() {
  let tabId = projectTargets.get(projectId());
  if (!tabId) {
    const page = await inspect();
    if (siteOrigin(page.page.url) !== view!.project.origin) throw new Error('Switch to this script’s website before reloading it.');
    tabId = page.tabId;
  }
  const tab = await chrome.tabs.get(tabId);
  if (siteOrigin(tab.url ?? '') !== view!.project.origin) throw new Error('The original website tab navigated away. Open the script’s website again.');
  await chrome.tabs.update(tabId, { active: true });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('Reload timed out. Inspect again after the page loads.')); }, 20_000);
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => { if (id === tabId && info.status === 'complete') { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(); } };
    chrome.tabs.onUpdated.addListener(listener);
    void chrome.tabs.reload(tabId).catch(error => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); reject(error); });
  });
  captured = await message({ action: 'inspect', tabId });
  $('page-status').textContent = `${captured!.page.selectors.length} visible controls after reload.`;
  notice('Reloaded and inspected. Try the new behavior, then save a test note.');
}
on('reload', reloadWebsite);
on('chat-reload', reloadWebsite);
on('check', async () => {
  const capture = await inspect(), note = window.prompt('What did you observe when testing the script?');
  if (!note) return;
  render(await request({ method: 'record-check', projectId: projectId(), revisionId: revision().id, page: capture!.page, note })); notice('Test observation saved with this revision.');
});
on('manager-list', async () => {
  if (!await requireHelper()) return;
  let scripts: ManagerScript[];
  try { scripts = await request<ManagerScript[]>({ method: 'manager-list' }); }
  catch (error) {
    show('settings'); $('manager-settings').scrollIntoView({ block: 'start' });
    $('manager-status').textContent = 'Tampermonkey is not connected yet. Install Editors, paste the pairing code, then Check pairing.';
    $('connection-error').textContent = String(error);
    notice('Finish the optional Tampermonkey pairing steps here to read installed scripts.', true);
    return;
  }
  $('manager-scripts').replaceChildren();
  for (const script of scripts) $('manager-scripts').append(card(script.name, script.namespace, 'Import / refresh source', async () => {
    const capture = await inspect();
    render(await request({ method: 'manager-import', path: script.path, origin: capture!.page.url })); await projects(); show('chat');
  }));
  notice(`${scripts.length} existing scripts found in Tampermonkey.`);
});
on('import-script', async () => { if (!await requireHelper()) return; fileMode = 'script'; $<HTMLInputElement>('file').accept = '.js'; $<HTMLInputElement>('file').click(); });
on('import-backup', async () => { if (!await requireHelper()) return; fileMode = 'backup'; $<HTMLInputElement>('file').accept = '.json'; $<HTMLInputElement>('file').click(); });
$('file').addEventListener('change', () => { void (async () => {
  const file = $<HTMLInputElement>('file').files?.[0]; if (!file) return;
  if (file.size > 32 * 1024 * 1024) throw new Error('Import exceeds 32 MB.');
  const text = await file.text();
  if (fileMode === 'backup') render(await request({ method: 'import-backup', backup: JSON.parse(text) }));
  else { const capture = await inspect(); render(await request({ method: 'create', origin: capture!.page.url, name: metadata(text).name?.[0] ?? file.name, source: text })); }
  await projects(); show('chat'); $<HTMLInputElement>('file').value = ''; notice('Imported into your disk-backed project library.');
})().catch(failed); });
on('export', async () => { if (!await requireHelper()) return; const backup = await request({ method: 'export', projectId: projectId() }); download(`${view!.project.name.replace(/[^\w.-]/g, '_')}.script-monkey.json`, JSON.stringify(backup, null, 2), 'application/json'); notice('Portable backup exported with source history and conversation.'); });
$('projects').addEventListener('change', () => { const id = $<HTMLSelectElement>('projects').value; if (!id) { view = undefined; $('draft').classList.add('hidden'); $('conversation').replaceChildren(); delivery(); return; } if (id) void request<ProjectView>({ method: 'project', projectId: id }).then(render).catch(failed); });
for (const button of document.querySelectorAll<HTMLElement>('[data-view]')) button.addEventListener('click', () => show(button.dataset.view!));
chrome.runtime.onMessage.addListener(message => {
  if (message.event === 'progress') notice(message.text);
  if (message.event === 'activity' && message.projectId === view?.project.id) {
    if (message.activity.kind === 'source') { liveProjectId = message.projectId; liveSource = message.activity; }
    activity(message.activity);
  }
  if (message.event === 'connection-lost') missingHelper(message.reason);
});
chrome.tabs.onActivated.addListener(() => { void refreshPage(); });
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete' || info.url) void refreshPage(); });
void (async () => {
  windowId = (await chrome.windows.getCurrent()).id;
  const brands: { brand: string }[] = (navigator as any).userAgentData?.brands ?? [];
  $<HTMLSelectElement>('browser').value = /Edg\//.test(navigator.userAgent) ? 'edge' : (navigator as any).brave ? 'brave' : brands.some(item => item.brand === 'Google Chrome') ? 'chrome' : 'chromium';
  setupCommand();
  const settings = await chrome.storage.local.get(['model']);
  await Promise.all([refreshPage(), checkSetup()]);
  if (typeof settings.model === 'string') $<HTMLSelectElement>('model').value = settings.model;
})().catch(failed);
$('model').addEventListener('change', () => { void chrome.storage.local.set({ model: $<HTMLSelectElement>('model').value }); });
