#!/usr/bin/env node
import { createInterface } from 'node:readline';
if (process.env.SCRIPT_MONKEY_EXPECT_NODE && process.execPath !== process.env.SCRIPT_MONKEY_EXPECT_NODE) throw new Error('Browser PATH selected the wrong Node installation');
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
    send({ method: 'item/reasoning/summaryTextDelta', params: { threadId: thread, itemId: 'summary-test', summaryIndex: 0, delta: 'Checking the page structure.' } });
    send({ method: 'item/reasoning/textDelta', params: { threadId: thread, itemId: 'summary-test', delta: 'Private reasoning content must not be relayed.' } });
    send({ method: 'item/completed', params: { threadId: thread, item: { id: 'summary-test', type: 'reasoning', summary: ['Checking the page structure.'], content: ['Private reasoning content must not be relayed.'] } } });
    send({ method: 'item/started', params: { threadId: thread, item: { id: 'commentary-test', type: 'agentMessage', phase: 'commentary', text: '' } } });
    send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'commentary-test', delta: 'I am checking the export button before building your shortcut.' } });
    send({ method: 'item/completed', params: { threadId: thread, item: { id: 'commentary-test', type: 'agentMessage', phase: 'commentary', text: 'I am checking the export button before building your shortcut.' } } });
    send({ id: 'inspection', method: 'item/tool/call', params: { threadId: thread, turnId: 'turn-test', tool: 'inspect_page', arguments: { selector: 'button' } } });
  }
  if (message.id === 'inspection' && !message.method && !hold) {
    if (!message.result?.success || !message.result.contentItems[0].text.includes('Export')) throw new Error('Missing page observation');
    send({ method: 'item/started', params: { threadId: thread, item: { id: 'command-test', type: 'commandExecution', command: 'printf fixture', status: 'inProgress' } } });
    send({ method: 'item/commandExecution/outputDelta', params: { threadId: thread, itemId: 'command-test', delta: 'fixture' } });
    send({ method: 'item/completed', params: { threadId: thread, item: { id: 'command-test', type: 'commandExecution', command: 'printf fixture', aggregatedOutput: 'fixture', exitCode: 0, status: 'completed' } } });
    const text = JSON.stringify({ source: currentSource, explanation: 'Added a shortcut after inspecting the export button.' });
    send({ method: 'item/started', params: { threadId: thread, item: { id: 'draft-test', type: 'agentMessage', phase: 'final_answer', text: '' } } });
    // Split inside a JSON escape: clients must decode source progressively, not
    // show the raw envelope or mix the commentary into the final draft.
    const split = text.indexOf('\\n') + 1;
    send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'draft-test', delta: text.slice(0, split) } });
    setTimeout(() => {
      send({ method: 'item/agentMessage/delta', params: { threadId: thread, itemId: 'draft-test', delta: text.slice(split) } });
      setTimeout(() => {
        send({ method: 'item/completed', params: { threadId: thread, item: { id: 'draft-test', type: 'agentMessage', phase: 'final_answer', text } } });
        send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'completed' } } });
      }, 150);
    }, 150);
  }
  if (message.method === 'turn/interrupt') { send({ id: message.id, result: {} }); send({ method: 'turn/completed', params: { threadId: thread, turn: { status: 'interrupted' } } }); }
});
