import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import type { ManagerScript, ManagerSource } from '../shared/model.js';

type ToolResult = { isError?: boolean; content?: unknown };
function textResult(result: ToolResult): string {
  const content = z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()).parse(result.content);
  const text = content.filter(item => item.type === 'text').map(item => item.text ?? '').join('\n');
  if (result.isError || /^Error\b/.test(text)) throw new Error(text || 'The manager bridge returned an error.');
  return text;
}
export function parseManagerSource(text: string): ManagerSource {
  const trailer = text.match(/\n\n---\nLast modified: ([^\n]+)$/);
  if (!trailer || trailer.index === undefined) throw new Error(`Manager did not return source: ${text.slice(0, 300)}`);
  const lastModified = Date.parse(trailer[1]!);
  if (!Number.isFinite(lastModified) || lastModified <= 0) throw new Error('Manager returned no usable modification time.');
  return { source: text.slice(0, trailer.index), lastModified };
}

const scriptSchema = z.object({ name: z.string(), namespace: z.string(), path: z.string() }).passthrough();
export class Tampermonkey {
  private client?: Client;
  private starting?: Promise<Client>;
  constructor(private readonly bridgePath: string) {}
  private connect(): Promise<Client> {
    if (this.client) return Promise.resolve(this.client);
    if (!this.starting) this.starting = (async () => {
      const client = new Client({ name: 'script-monkey', version: '0.1.0' });
      const transport = new StdioClientTransport({ command: process.execPath, args: [this.bridgePath], stderr: 'pipe' });
      // Bridge diagnostics never go onto the native messaging stdout stream.
      transport.stderr?.on('data', () => {});
      client.onclose = () => { this.client = undefined; this.starting = undefined; };
      try { await client.connect(transport); this.client = client; return client; }
      catch (error) { await client.close().catch(() => {}); this.starting = undefined; throw error; }
    })();
    return this.starting;
  }
  private async call(name: string, args: Record<string, unknown> = {}) {
    const client = await this.connect();
    return textResult(z.object({ isError: z.boolean().optional(), content: z.unknown() }).parse(await client.callTool({ name, arguments: args })));
  }
  async pair(): Promise<string> {
    const text = await this.call('tampermonkey_get_connection_code');
    const code = text.match(/Connection code:\s*(\S+)/)?.[1];
    if (!code) throw new Error('No connection code returned by Tampermonkey MCP.');
    return code;
  }
  async list(): Promise<ManagerScript[]> {
    const raw = JSON.parse(await this.call('tampermonkey_list')) as unknown;
    return z.object({ list: z.array(scriptSchema) }).parse(raw).list.map(item => ({ name: item.name, namespace: item.namespace, path: item.path }));
  }
  async read(path: string): Promise<ManagerSource> {
    return parseManagerSource(await this.call('tampermonkey_get', { path }));
  }
  async patch(path: string, source: string, lastModified: number) {
    const result = await this.call('tampermonkey_patch', { path, value: source, lastModified });
    if (result !== 'Script updated successfully') throw new Error(`Manager update failed: ${result.slice(0, 400)}`);
  }
  async close() { await this.client?.close(); }
}
