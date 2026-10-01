import type { Page } from '../shared/model.js';

/** Self-contained so Chrome can serialize this packaged function for injection. */
export function inspectPage(selector = ''): Page {
  const selected = selector ? document.querySelector(selector) : document.body;
  if (!selected) throw new Error(`No element matches ${selector}.`);
  const clone = selected.cloneNode(true) as Element;
  clone.querySelectorAll('script,style,noscript,iframe,input[type="password"],input[type="hidden"]').forEach(element => element.remove());
  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || ['value', 'nonce', 'integrity'].includes(attribute.name)) element.removeAttribute(attribute.name);
    }
    if (['TEXTAREA', 'INPUT'].includes(element.tagName)) element.textContent = '';
  }
  const selectors: string[] = [];
  for (const element of selected.querySelectorAll('button,a,[role="button"],[role="menuitem"],summary')) {
    if (!(element as HTMLElement).getClientRects().length) continue;
    const label = (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 150);
    selectors.push(`${element.tagName.toLowerCase()}${element.id ? `#${CSS.escape(element.id)}` : ''}: ${label}`);
    if (selectors.length >= 100) break;
  }
  return {
    url: location.href, title: document.title.slice(0, 1000),
    text: (selected instanceof HTMLElement ? selected.innerText : selected.textContent ?? '').slice(0, 30_000),
    html: clone.outerHTML.slice(0, 50_000), selectors,
  };
}
