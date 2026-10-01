import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';
import { Tampermonkey } from '../src/companion/manager.js';
import { template } from '../src/shared/userscript.js';

test('official MCP process pairs, reads exact source and propagates optimistic-lock failures', async t => {
  const manager = new Tampermonkey(resolve('dist/companion/tampermonkey-mcp.mjs'));
  t.after(() => manager.close());
  const code = await manager.pair();
  const port = parseInt(code.slice(0, -2), 32) + 1024;
  const auth = code.at(-2), echo = code.at(-1);
  let source = template('https://example.com', 'Shortcut'), timestamp = 1790856000000;
  const socket = new WebSocket(`ws://localhost:${port}`);
  t.after(() => socket.terminate());
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.once('open', () => socket.send(JSON.stringify({ method: 'auth', token: auth })));
    socket.on('message', buffer => {
      const data = JSON.parse(buffer.toString());
      if (data.method === 'auth') { assert.equal(data.token, echo); socket.send(JSON.stringify({ method: 'authOK' })); setTimeout(resolve, 20); }
      else if (data.method === 'ping') socket.send(JSON.stringify({ method: 'pong' }));
      else {
        let response: unknown;
        if (data.action === 'list') response = { list: [{ name: 'Shortcut', namespace: 'script-monkey.local', path: 'uuid/source', requires: [] }] };
        else if (data.action === 'get') response = { value: source, lastModified: timestamp };
        else if (data.action === 'patch' && data.lastModified === timestamp) { source = data.value; timestamp++; response = {}; }
        else response = { error: { number: 409, message: 'Concurrent modification' } };
        socket.send(JSON.stringify({ id: data.messageId, response }));
      }
    });
  });
  assert.equal((await manager.list())[0]?.name, 'Shortcut');
  const current = await manager.read('uuid/source');
  assert.equal(current.source, source);
  await manager.patch('uuid/source', source.replace('0.1.0', '0.2.0'), current.lastModified);
  assert.match((await manager.read('uuid/source')).source, /0.2.0/);
  await assert.rejects(() => manager.patch('uuid/source', current.source, current.lastModified), /Concurrent modification/);
});
