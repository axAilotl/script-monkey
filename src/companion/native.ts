import { EventEmitter } from 'node:events';
import type { Writable } from 'node:stream';

export class NativeDecoder extends EventEmitter {
  private buffer = Buffer.alloc(0);
  push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (!length || length > 64 * 1024 * 1024) throw new Error('Invalid native message size.');
      if (this.buffer.length < length + 4) return;
      const message = JSON.parse(this.buffer.subarray(4, length + 4).toString('utf8')) as unknown;
      this.buffer = this.buffer.subarray(length + 4);
      this.emit('message', message);
    }
  }
}
export function writeNative(output: Writable, value: unknown) {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 900_000) {
    // Chrome limits host-to-browser frames to 1 MiB. Assemble larger exports in the worker.
    const token = crypto.randomUUID();
    const size = 100_000;
    for (let offset = 0; offset < json.length; offset += size) writeNative(output, { chunk: token, data: json.slice(offset, offset + size), last: offset + size >= json.length });
    return;
  }
  const body = Buffer.from(json), header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  output.write(Buffer.concat([header, body]));
}
