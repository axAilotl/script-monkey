import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { HostEvent, Page, Request } from '../shared/model.js';
import { metadata, sameIdentity, siteOrigin, validateSource } from '../shared/userscript.js';
import { Workspace, hash } from './store.js';
import { Tampermonkey } from './manager.js';
import { Codex } from './codex.js';

type Manager = Pick<Tampermonkey, 'pair' | 'list' | 'read' | 'patch' | 'close'>;
export class Controller {
  private generating = false;
  private pageUrl = '';
  private pageCalls = new Map<string, { resolve: (page: Page) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private agent: Codex;
  private server?: Server;
  private artifacts = new Map<string, string>();
  constructor(readonly store: Workspace, private readonly manager: Manager, private readonly emit: (event: HostEvent) => void) {
    this.agent = new Codex(store.root, selector => this.inspect(selector), text => emit({ event: 'progress', text }));
  }
  private inspect(selector: string): Promise<Page> {
    const callId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pageCalls.delete(callId); reject(new Error('Page inspection timed out. Keep the target tab open.')); }, 30_000);
      this.pageCalls.set(callId, { resolve, reject, timer });
      this.emit({ event: 'inspect', callId, selector, url: this.pageUrl });
    });
  }
  private async checkReadback(id: string, revisionId: string, path: string, expected: string) {
    const current = await this.manager.read(path);
    if (hash(current.source) !== hash(expected)) throw new Error('Stored source differs from this revision. It has not been verified as installed.');
    const project = await this.store.project(id);
    await this.store.update({ ...project, appliedRevisionId: revisionId, manager: { path, ...current } });
    await this.store.event(id, 'installed', 'Exact source read back from Tampermonkey. Page behavior still needs testing.', revisionId);
    return this.store.view(id);
  }
  private async installUrl(source: string) {
    if (!this.server) {
      this.server = createServer((request, response) => {
        const value = this.artifacts.get(request.url ?? '');
        const address = this.server!.address();
        const host = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
        if (request.headers.host !== host || !value || !['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(request.method === 'HEAD' ? undefined : value);
      });
      await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(0, '127.0.0.1', () => { this.server!.off('error', reject); resolve(); }); });
    }
    const path = `/${randomUUID()}/customization.user.js`;
    this.artifacts.set(path, source);
    if (this.artifacts.size > 100) this.artifacts.delete(this.artifacts.keys().next().value!);
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('No install server address.');
    return { url: `http://127.0.0.1:${address.port}${path}` };
  }
  async handle(request: Request): Promise<unknown> {
    if (request.method === 'page-result') {
      const pending = this.pageCalls.get(request.callId);
      if (pending) {
        clearTimeout(pending.timer); this.pageCalls.delete(request.callId);
        if (request.page && request.page.url === this.pageUrl) pending.resolve(request.page);
        else pending.reject(new Error(request.error ?? 'The target page navigated. Inspect it again before continuing.'));
      }
      return null;
    }
    if (request.method === 'cancel') { await this.agent.cancel(); return null; }
    if (this.generating && !['status', 'project', 'projects'].includes(request.method)) throw new Error('Wait for the current Codex task or cancel it first.');
    switch (request.method) {
      case 'status': {
        await this.store.list();
        let codex: unknown;
        try { codex = await this.agent.account(); } catch (error) { codex = { error: String(error) }; }
        return { workspace: this.store.root, codex, warnings: this.store.warnings, generating: this.generating, manager: 'Tampermonkey via its official Editors bridge; Violentmonkey via file handoff' };
      }
      case 'pair': return { code: await this.manager.pair() };
      case 'manager-list': return this.manager.list();
      case 'projects': {
        const projects = await this.store.list();
        if (this.store.warnings.length) this.emit({ event: 'progress', text: this.store.warnings.join('\n') });
        return projects;
      }
      case 'project': return this.store.view(request.projectId);
      case 'create': return this.store.create(request.origin, request.name, request.source);
      case 'manager-import': {
        const known = (await this.store.list()).find(project => project.manager?.path === request.path);
        const current = await this.manager.read(request.path);
        if (known) {
          await this.store.update({ ...known, manager: { path: request.path, ...current } });
          return this.store.save(known.id, current.source, 'Refreshed current source from Tampermonkey. Earlier drafts remain in history.');
        }
        const name = metadata(current.source).name?.[0] ?? 'Imported script';
        return this.store.create(request.origin, name, current.source, { path: request.path, ...current });
      }
      case 'save': return this.store.save(request.projectId, request.source, request.note);
      case 'generate': {
        const project = await this.store.project(request.projectId);
        if (siteOrigin(request.page.url) !== project.origin) throw new Error('This project belongs to another website. Select a matching project.');
        const revision = await this.store.revision(project.id, project.currentRevisionId!);
        this.generating = true; this.pageUrl = request.page.url;
        try {
          await this.store.event(project.id, 'user', request.prompt);
          const result = await this.agent.generate(project, request.prompt, request.page, revision.source, async threadId => this.store.update({ ...await this.store.project(project.id), threadId }), request.model);
          validateSource(result.source);
          if (project.manager && !sameIdentity(project.manager.source, result.source)) throw new Error('Codex changed the installed script identity. Save a personal fork instead of overwriting it.');
          const view = await this.store.save(project.id, result.source, result.explanation);
          await this.store.event(project.id, 'assistant', result.explanation, view.project.currentRevisionId);
          return this.store.view(project.id);
        } catch (error) { await this.store.event(project.id, 'error', String(error)); throw error; }
        finally { this.generating = false; this.pageUrl = ''; }
      }
      case 'apply': {
        const project = await this.store.project(request.projectId);
        const revision = await this.store.revision(project.id, request.revisionId);
        if (!project.manager) throw new Error('Install this script through your manager, then verify its installation before using direct updates.');
        if (!sameIdentity(project.manager.source, revision.source)) throw new Error('Changing @name or @namespace requires a separate installation.');
        const current = await this.manager.read(project.manager.path);
        if (current.source !== project.manager.source || current.lastModified !== project.manager.lastModified) throw new Error('Conflict: the script changed in Tampermonkey. Import its current source before replacing it.');
        await this.store.event(project.id, 'applying', 'Saved revision ready; updating Tampermonkey.', revision.id);
        await this.manager.patch(project.manager.path, revision.source, current.lastModified);
        return this.checkReadback(project.id, revision.id, project.manager.path, revision.source);
      }
      case 'verify-install': {
        const project = await this.store.project(request.projectId);
        const revision = await this.store.revision(project.id, request.revisionId);
        const meta = metadata(revision.source);
        const matches = (await this.manager.list()).filter(item => item.name === meta.name?.[0] && item.namespace === (meta.namespace?.[0] ?? ''));
        if (matches.length !== 1) throw new Error('Could not identify exactly one installed script. Check @name/@namespace and complete the manager install screen.');
        return this.checkReadback(project.id, revision.id, matches[0]!.path, revision.source);
      }
      case 'install-url': return this.installUrl((await this.store.revision(request.projectId, request.revisionId)).source);
      case 'restore': {
        const revision = await this.store.revision(request.projectId, request.revisionId);
        return this.store.save(request.projectId, revision.source, `Restored draft from ${revision.createdAt}. Apply it to restore installed code.`);
      }
      case 'record-check': {
        const project = await this.store.project(request.projectId);
        await this.store.revision(project.id, request.revisionId);
        if (siteOrigin(request.page.url) !== project.origin) throw new Error('Inspect the project website before recording a check.');
        await this.store.event(project.id, 'check', JSON.stringify({ note: request.note, url: request.page.url, title: request.page.title, selectors: request.page.selectors, text: request.page.text.slice(0, 5000) }), request.revisionId);
        return this.store.view(project.id);
      }
      case 'export': return this.store.backup(request.projectId);
      case 'import-backup': return this.store.restore(request.backup);
    }
  }
  async close() {
    this.agent.close(); await this.manager.close(); this.server?.close();
    for (const call of this.pageCalls.values()) { clearTimeout(call.timer); call.reject(new Error('Disconnected.')); }
    this.pageCalls.clear();
  }
}
