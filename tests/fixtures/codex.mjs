#!/usr/bin/env node
import { createInterface } from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
let thread = 'script-monkey-test-thread', hold = false;
let currentSource;
const source = '// ==UserScript==\n// @name Shortcut\n// @namespace script-monkey.local\n// @match https://example.com/*\n// @grant none\n// ==/UserScript==\ndocument.body.dataset.shortcut = "ready";';
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') send({ id: message.id, result: {} });
  if (message.method === 'account/read') send({ id: message.id, result: { account: { type: 'chatgpt' } } });
  if (message.method === 'model/list') send({ id: message.id, result: { data: [{ model: 'fixture-model' }] } });
  if (message.method === 'config/read') send({ id: message.id, result: { config: { model: 'fixture-model' } } });
  if (message.method === 'thread/start') {
    if (message.params.dynamicTools?.[0]?.type !== 'function' || message.params.sandbox !== 'read-only') throw new Error('Incorrect client contract');
    send({ id: message.id, result: { thread: { id: thread } } });
  }
  if (message.method === 'thread/resume') send({ id: message.id, result: { thread: { id: thread } } });
  if (message.method === 'turn/start') {
    hold = message.params.input[0].text.includes('Hold the task');
    const inputSource = message.params.input[0].text.match(/Current userscript[^\n]*:\n([\s\S]*?)\n\nPage observation/)?.[1];
    currentSource = inputSource ? inputSource.slice(0, inputSource.indexOf('// ==/UserScript==') + '// ==/UserScript=='.length) + '\ndocument.body.dataset.shortcut = "ready";' : source;
    send({ id: message.id, result: { turn: { id: 'turn-test' } } });
    send({ method: 'turn/started', params: { threadId: thread, turn: { id: 'turn-test' } } });
    send({ id: 'inspection', method: 'item/tool/call', params: { threadId: thread, turnId: 'turn-test', tool: 'inspect_page', arguments: { selector: 'button' } } });
  }
  if (message.id === 'inspection' && !message.method && !hold) {
    if (!message.result?.success || !message.result.contentItems[0].text.includes('Export')) throw new Error('Missing page observation');
    const text = JSON.stringify({ source: currentSource, explanation: 'Added a shortcut after inspecting the export button.' });
    send({ method: 'item/agentMessage/delta', params: { threadId: thread, delta: text } });
    send({ method: 'item/completed', params: { threadId: thread, item: { type: 'agentMessage', text } } });
    send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'completed' } } });
  }
  if (message.method === 'turn/interrupt') { send({ id: message.id, result: {} }); send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'interrupted' } } }); }
});
