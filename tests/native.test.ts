import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { NativeDecoder, writeNative } from '../src/companion/native.js';
import { parseManagerSource } from '../src/companion/manager.js';

test('native messages survive fragmented UTF-8 frames and large export chunking', () => {
  const buffers: Buffer[] = [];
  const output = new Writable({ write(chunk, _encoding, callback) { buffers.push(Buffer.from(chunk)); callback(); } });
  const value = { id: 'one', result: 'source 🐒 '.repeat(130_000) };
  writeNative(output, value);
  const decoder = new NativeDecoder();
  let assembled = '', finished: unknown;
  decoder.on('message', message => { assembled += message.data; if (message.last) finished = JSON.parse(assembled); });
  for (const buffer of buffers) {
    assert.ok(buffer.readUInt32LE(0) < 1024 * 1024);
    decoder.push(buffer.subarray(0, 7)); decoder.push(buffer.subarray(7, 101)); decoder.push(buffer.subarray(101));
  }
  assert.deepEqual(finished, value);
});

test('invalid native frame size fails immediately', () => {
  const header = Buffer.alloc(4); header.writeUInt32LE(70 * 1024 * 1024);
  assert.throws(() => new NativeDecoder().push(header), /size/);
});

test('MCP source normalization strips only its final timestamp trailer', () => {
  const source = '// ==UserScript==\n// Content includes --- and Last modified: internally\n';
  const result = parseManagerSource(`${source}\n\n---\nLast modified: 2026-10-01T12:00:00.000Z`);
  assert.equal(result.source, source);
  assert.equal(result.lastModified, 1790856000000);
  assert.throws(() => parseManagerSource('{"number":405,"message":"Not allowed"}'), /did not return source/);
});

test('ordinary manager scripts may omit a namespace without losing their identity', async () => {
  const { validateSource, sameIdentity } = await import('../src/shared/userscript.js');
  const script = '//==UserScript==\n// @name Shortcut\n// @match https://example.com/*\n//==/UserScript==\n';
  assert.doesNotThrow(() => validateSource(script));
  assert.equal(sameIdentity(script, script.replace('@name Shortcut', '@name Other')), false);
  assert.equal(sameIdentity(script, script.replace('@name Shortcut', '@namespace \n// @name Shortcut')), true);
});
