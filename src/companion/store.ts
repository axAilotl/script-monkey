import { mkdir, readFile, writeFile, rename, open, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Event, ManagerBinding, Project, ProjectView, Revision } from '../shared/model.js';
import { MAX_SOURCE } from '../shared/model.js';
import { siteOrigin, template, validateSource } from '../shared/userscript.js';

const uuid = z.uuid();
export const hash = (source: string) => createHash('sha256').update(source).digest('hex');
const now = () => new Date().toISOString();
const revisionSchema = z.object({ id: uuid, source: z.string().max(MAX_SOURCE), note: z.string().max(8000), createdAt: z.string(), hash: z.string() });
const backupSchema = z.object({
  format: z.literal('script-monkey'), version: z.literal(1),
  project: z.object({ name: z.string().min(1).max(200), origin: z.url(), currentRevisionId: uuid.optional() }),
  revisions: z.array(revisionSchema).min(1).max(1000),
  events: z.array(z.object({ at: z.string(), type: z.string(), text: z.string().max(60_000), revisionId: uuid.optional() })).max(5000),
});

/** Files, rather than the browser profile, are the authoritative project record. */
export class Workspace {
  readonly root: string;
  warnings: string[] = [];
  constructor(root: string) { this.root = resolve(root); }
  private directory(id: string) { return join(this.root, 'projects', uuid.parse(id)); }
  private async atomic(path: string, value: unknown) {
    const tmp = `${path}.${randomUUID()}.tmp`;
    const file = await open(tmp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value, null, 2)); await file.sync(); }
    finally { await file.close(); }
    await rename(tmp, path);
  }
  async create(origin: string, name: string, source?: string, manager?: ManagerBinding): Promise<ProjectView> {
    const project: Project = { schemaVersion: 1, id: randomUUID(), origin: siteOrigin(origin), name, createdAt: now(), ...(manager ? { manager } : {}) };
    source ??= template(origin, name, `script-monkey.local/${project.id}`);
    validateSource(source);
    await mkdir(join(this.directory(project.id), 'revisions'), { recursive: true, mode: 0o700 });
    await this.atomic(join(this.directory(project.id), 'project.json'), project);
    return this.save(project.id, source, manager ? 'Original imported from Tampermonkey' : 'Initial script');
  }
  async project(id: string): Promise<Project> {
    const value = JSON.parse(await readFile(join(this.directory(id), 'project.json'), 'utf8')) as Project;
    if (value.id !== id || value.schemaVersion !== 1) throw new Error('Invalid project record.');
    return value;
  }
  async update(project: Project) { await this.atomic(join(this.directory(project.id), 'project.json'), project); }
  async revision(id: string, revisionId: string): Promise<Revision> {
    const value = revisionSchema.parse(JSON.parse(await readFile(join(this.directory(id), 'revisions', `${uuid.parse(revisionId)}.json`), 'utf8')));
    if (value.id !== revisionId || hash(value.source) !== value.hash) throw new Error('Revision checksum failed; the saved file may be damaged.');
    return value;
  }
  async save(id: string, source: string, note: string): Promise<ProjectView> {
    validateSource(source);
    const project = await this.project(id);
    const revision: Revision = { id: randomUUID(), source, note, createdAt: now(), hash: hash(source) };
    await this.atomic(join(this.directory(id), 'revisions', `${revision.id}.json`), revision);
    // The immutable revision lands before updating the pointer. A crash cannot destroy older code.
    await writeFile(join(this.directory(id), 'current.user.js'), source, { mode: 0o600 });
    await this.update({ ...project, currentRevisionId: revision.id });
    await this.event(id, 'revision', note, revision.id);
    return this.view(id);
  }
  async event(id: string, type: string, text: string, revisionId?: string) {
    await this.project(id);
    const file = await open(join(this.directory(id), 'conversation.jsonl'), 'a', 0o600);
    try { await file.writeFile(`${JSON.stringify({ at: now(), type, text, ...(revisionId ? { revisionId } : {}) })}\n`); await file.sync(); }
    finally { await file.close(); }
  }
  async view(id: string): Promise<ProjectView> {
    const project = await this.project(id);
    const names = await readdir(join(this.directory(id), 'revisions'));
    const warnings: string[] = [];
    const revisions: Revision[] = [];
    for (const name of names.filter(name => name.endsWith('.json'))) {
      try { revisions.push(await this.revision(id, name.slice(0, -5))); }
      catch (error) {
        if (name === `${project.currentRevisionId}.json`) throw error;
        warnings.push(`Damaged historical revision ${name} was skipped. Its file remains on disk.`);
      }
    }
    if (!revisions.some(revision => revision.id === project.currentRevisionId)) throw new Error('The current source revision is missing. Preserve this project folder and restore a backup.');
    let events: Event[] = [];
    try {
      const lines = (await readFile(join(this.directory(id), 'conversation.jsonl'), 'utf8')).split('\n');
      events = lines.flatMap(line => { try { return line ? [JSON.parse(line) as Event] : []; } catch { return []; } });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    revisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { project, revisions, events, ...(warnings.length ? { warnings } : {}) };
  }
  async list(): Promise<Project[]> {
    const dir = join(this.root, 'projects');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const names = await readdir(dir);
    this.warnings = [];
    const projects: Project[] = [];
    for (const name of names.filter(name => uuid.safeParse(name).success)) {
      try { projects.push(await this.project(name)); }
      catch { this.warnings.push(`Project ${name} has an invalid or missing record and was skipped. Its folder remains on disk.`); }
    }
    return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async backup(id: string) {
    const { project, revisions, events, warnings } = await this.view(id);
    if (warnings?.length) throw new Error('Some historical revisions are damaged. Copy the project folder on disk to preserve all files before repairing or exporting.');
    // A restored project gets a new identity and is not automatically bound to an old manager installation.
    const backup = { format: 'script-monkey', version: 1, project: { name: project.name, origin: project.origin, currentRevisionId: project.currentRevisionId }, revisions, events };
    if (!backupSchema.safeParse(backup).success || Buffer.byteLength(JSON.stringify(backup, null, 2)) > 32 * 1024 * 1024) throw new Error('This project exceeds the portable backup limit (32 MB, 1,000 revisions, or 5,000 events). Copy its project folder on disk to preserve the complete history.');
    return backup;
  }
  async restore(backup: unknown): Promise<ProjectView> {
    const value = backupSchema.parse(backup);
    const seen = new Set<string>();
    for (const revision of value.revisions) {
      validateSource(revision.source);
      if (hash(revision.source) !== revision.hash || seen.has(revision.id)) throw new Error('Backup revision checksum or identity is invalid.');
      seen.add(revision.id);
    }
    const current = value.project.currentRevisionId ?? value.revisions[0]!.id;
    if (!seen.has(current)) throw new Error('Backup refers to a missing revision.');
    const project: Project = { schemaVersion: 1, id: randomUUID(), name: value.project.name, origin: siteOrigin(value.project.origin), createdAt: now(), currentRevisionId: current };
    await mkdir(join(this.directory(project.id), 'revisions'), { recursive: true, mode: 0o700 });
    for (const revision of value.revisions) await this.atomic(join(this.directory(project.id), 'revisions', `${revision.id}.json`), revision);
    await writeFile(join(this.directory(project.id), 'conversation.jsonl'), value.events.map(event => JSON.stringify(event)).join('\n') + '\n', { mode: 0o600 });
    await writeFile(join(this.directory(project.id), 'current.user.js'), value.revisions.find(item => item.id === current)!.source, { mode: 0o600 });
    await this.update(project);
    await this.event(project.id, 'restored', 'Restored from a portable backup. Reconnect its manager script before applying.');
    return this.view(project.id);
  }
}
