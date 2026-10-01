import type { Request, Reply } from '../shared/model.js';
import { inspectPage } from './inspector.js';

const HOST = 'io.github.script_monkey';
let native: chrome.runtime.Port | undefined;
const waiting = new Map<string, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const chunks = new Map<string, string>();
let target: { tabId: number; url: string; documentId: string } | undefined;

async function publish(event: unknown) { await chrome.runtime.sendMessage(event).catch(() => {}); }
async function receive(message: Reply) {
  if ('event' in message) {
    if (message.event === 'inspect') {
      try {
        if (!target || target.url !== message.url) throw new Error('The original target tab is unavailable.');
        const result = await chrome.scripting.executeScript({ target: { tabId: target.tabId, documentIds: [target.documentId] }, func: inspectPage, args: [message.selector] });
        const page = result[0]?.result;
        if (!page || page.url !== target.url) throw new Error('The target page navigated. Start a new request.');
        await call({ method: 'page-result', callId: message.callId, page });
      } catch (error) { await call({ method: 'page-result', callId: message.callId, error: String(error) }).catch(() => {}); }
    } else await publish(message);
    return;
  }
  const entry = waiting.get(message.id);
  if (!entry) return;
  clearTimeout(entry.timer); waiting.delete(message.id);
  message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result);
}
function connect() {
  if (native) return native;
  native = chrome.runtime.connectNative(HOST);
  native.onMessage.addListener((message: any) => {
    if (typeof message.chunk === 'string') {
      const data = (chunks.get(message.chunk) ?? '') + String(message.data ?? '');
      if (data.length > 64 * 1024 * 1024) { native?.disconnect(); return; }
      if (message.last) { chunks.delete(message.chunk); void receive(JSON.parse(data)); }
      else chunks.set(message.chunk, data);
    } else void receive(message);
  });
  native.onDisconnect.addListener(() => {
    const reason = chrome.runtime.lastError?.message ?? 'Local companion disconnected.';
    native = undefined; chunks.clear();
    for (const entry of waiting.values()) { clearTimeout(entry.timer); entry.reject(new Error(`${reason} Run the local setup command from the README.`)); }
    waiting.clear();
    void publish({ event: 'progress', text: 'Disconnected. Your saved projects remain on disk.' });
  });
  return native;
}
function call(request: Request): Promise<unknown> {
  const port = connect(), id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Companion request timed out.')); }, request.method === 'generate' ? 660_000 : 90_000);
    waiting.set(id, { resolve, reject, timer });
    try { port.postMessage({ id, request }); }
    catch (error) { clearTimeout(timer); waiting.delete(id); reject(error); }
  });
}
chrome.runtime.onInstalled.addListener(() => { void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('sidebar.html'))) return;
  if (message.event) return;
  void (async () => {
    if (message.action === 'inspect') {
      const tab = await chrome.tabs.get(message.tabId);
      const result = await chrome.scripting.executeScript({ target: { tabId: tab.id! }, func: inspectPage, args: [message.selector ?? ''] });
      const first = result[0];
      if (!first?.result || !first.documentId) throw new Error('Could not inspect this page.');
      return { page: first.result, tabId: tab.id, documentId: first.documentId };
    }
    if (message.action === 'request') {
      if (message.request.method === 'generate') {
        if (target) throw new Error('A task is already running.');
        target = message.target;
        try { return await call(message.request); } finally { target = undefined; }
      }
      return call(message.request);
    }
    throw new Error('Unknown sidebar action.');
  })().then(result => sendResponse({ result }), error => sendResponse({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
