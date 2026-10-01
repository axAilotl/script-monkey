import { MAX_SOURCE } from './model.js';

export function metadata(source: string): Record<string, string[]> {
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) throw new Error('A userscript needs a // ==UserScript== metadata block.');
  const result: Record<string, string[]> = {};
  for (const line of block[1]!.split('\n')) {
    const entry = line.match(/^\s*\/\/\s+@(\S+)\s+(.*)$/);
    if (entry) (result[entry[1]!] ??= []).push(entry[2]!.trim());
  }
  return result;
}

export function validateSource(source: string): void {
  if (!source || source.length > MAX_SOURCE) throw new Error('Script is empty or exceeds 240 KB.');
  const meta = metadata(source);
  if (!meta.name?.[0] || !meta.namespace?.[0]) throw new Error('Script needs @name and @namespace.');
  if (!meta.match?.length && !meta.include?.length) throw new Error('Script needs @match or @include.');
}

export function siteOrigin(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Choose a regular http or https website.');
  return parsed.origin;
}

export function template(origin: string, name: string): string {
  const url = new URL(siteOrigin(origin));
  const safeName = name.replace(/[\r\n]/g, ' ').trim();
  return `// ==UserScript==\n// @name         ${safeName}\n// @namespace    script-monkey.local\n// @version      0.1.0\n// @description  Personal website customization\n// @match        ${url.origin}/*\n// @grant        none\n// @run-at       document-idle\n// ==/UserScript==\n\n(() => {\n  'use strict';\n  // Describe your change in the sidebar.\n})();\n`;
}

export function sameIdentity(first: string, second: string): boolean {
  const a = metadata(first), b = metadata(second);
  return a.name?.[0] === b.name?.[0] && a.namespace?.[0] === b.namespace?.[0];
}
