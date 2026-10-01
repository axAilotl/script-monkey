import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, mkdir, copyFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { NativeDecoder } from '../src/companion/native.js';
const run = promisify(execFile);

test('installer finds terminal Codex and native helper uses it with a restricted browser PATH', async t => {
  const root = await mkdtemp(join(tmpdir(), 'script-monkey-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'bin'); await mkdir(bin);
  await copyFile(resolve('tests/fixtures/codex.mjs'), join(bin, 'codex')); await chmod(join(bin, 'codex'), 0o700);
  const launcher = join(root, 'launch.sh');
  await run(process.execPath, ['scripts/setup.mjs', '--host-dir', join(root, 'hosts'), '--launcher', launcher, '--workspace', join(root, 'workspace')], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  assert.ok((await readFile(launcher, 'utf8')).includes(join(bin, 'codex')));
  // Keep node for the subprocess fixture's shebang, but remove the CLI's bin directory.
  const nodePath = process.execPath.slice(0, process.execPath.lastIndexOf('/'));
  const host = spawn(launcher, [], { env: { ...process.env, PATH: `${nodePath}:/usr/bin:/bin` }, stdio: 'pipe' });
  t.after(() => host.kill());
  const result = new Promise<any>((resolve, reject) => {
    const decoder = new NativeDecoder(); decoder.on('message', resolve);
    host.stdout.on('data', chunk => decoder.push(chunk)); host.on('error', reject);
  });
  const body = Buffer.from(JSON.stringify({ id: crypto.randomUUID(), request: { method: 'status' } })), header = Buffer.alloc(4);
  header.writeUInt32LE(body.length); host.stdin.write(Buffer.concat([header, body]));
  const reply = await Promise.race([result, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Native setup test timed out')), 10_000); timer.unref(); })]);
  assert.equal(reply.result.codex.account.type, 'chatgpt');
  assert.equal(reply.result.codex.configuredModel, 'fixture-model');
});
