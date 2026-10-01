import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { z } from 'zod';
import { Workspace } from './store.js';
import { Tampermonkey } from './manager.js';
import { Controller } from './controller.js';
import { NativeDecoder, writeNative } from './native.js';
import { requestSchema } from '../shared/model.js';

const index = process.argv.indexOf('--workspace');
const root = index >= 0 && process.argv[index + 1] ? resolve(process.argv[index + 1]!) : join(homedir(), 'Script Monkey');
const packetSchema = z.object({ id: z.uuid(), request: requestSchema });
const decoder = new NativeDecoder();
const controller = new Controller(new Workspace(root), new Tampermonkey(join(dirname(fileURLToPath(import.meta.url)), 'tampermonkey-mcp.mjs')), event => writeNative(process.stdout, event));
let queue: Promise<unknown> = Promise.resolve();
const run = async (value: unknown) => {
  const parsed = packetSchema.safeParse(value);
  if (!parsed.success) { writeNative(process.stdout, { id: typeof value === 'object' && value && 'id' in value ? value.id : '', error: 'Invalid request.' }); return; }
  const { id, request } = parsed.data;
  try { writeNative(process.stdout, { id, result: await controller.handle(request) }); }
  catch (error) { writeNative(process.stdout, { id, error: error instanceof Error ? error.message : String(error) }); }
};
decoder.on('message', (value: any) => {
  if (['page-result', 'cancel', 'status'].includes(value?.request?.method)) void run(value);
  else queue = queue.then(() => run(value), () => run(value));
});
process.stdin.on('data', chunk => { try { decoder.push(chunk); } catch (error) { process.stderr.write(`${String(error)}\n`); void shutdown(); } });
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; await controller.close().catch(() => {}); process.exit(0); }
process.stdin.on('end', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
