import { z } from 'zod';

export const MAX_SOURCE = 240_000;
export const pageSchema = z.object({
  url: z.url().max(4000), title: z.string().max(1000),
  text: z.string().max(30_000), html: z.string().max(50_000),
  selectors: z.array(z.string().max(1000)).max(100),
});
export type Page = z.infer<typeof pageSchema>;
export const sourceSchema = z.string().min(1).max(MAX_SOURCE);
const id = z.uuid();
export const requestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('status') }),
  z.object({ method: z.literal('pair') }),
  z.object({ method: z.literal('manager-list') }),
  z.object({ method: z.literal('manager-import'), path: z.string().max(1000), origin: z.url() }),
  z.object({ method: z.literal('projects') }),
  z.object({ method: z.literal('project'), projectId: id }),
  z.object({ method: z.literal('create'), origin: z.url(), name: z.string().min(1).max(200), source: sourceSchema.optional() }),
  z.object({ method: z.literal('save'), projectId: id, source: sourceSchema, note: z.string().max(4000) }),
  z.object({ method: z.literal('generate'), projectId: id, prompt: z.string().min(1).max(8000), page: pageSchema, model: z.string().min(1).max(200).optional() }),
  z.object({ method: z.literal('cancel') }),
  z.object({ method: z.literal('apply'), projectId: id, revisionId: id }),
  z.object({ method: z.literal('verify-install'), projectId: id, revisionId: id }),
  z.object({ method: z.literal('install-url'), projectId: id, revisionId: id }),
  z.object({ method: z.literal('restore'), projectId: id, revisionId: id }),
  z.object({ method: z.literal('record-check'), projectId: id, revisionId: id, page: pageSchema, note: z.string().max(4000) }),
  z.object({ method: z.literal('export'), projectId: id }),
  z.object({ method: z.literal('import-backup'), backup: z.unknown() }),
  z.object({ method: z.literal('page-result'), callId: id, page: pageSchema.optional(), error: z.string().max(4000).optional() }),
]);
export type Request = z.infer<typeof requestSchema>;
export type ManagerScript = { name: string; namespace: string; path: string };
export type ManagerSource = { source: string; lastModified: number };
export type ManagerBinding = ManagerSource & { path: string };
export type Revision = { id: string; source: string; note: string; createdAt: string; hash: string };
export type Event = { at: string; type: string; text: string; revisionId?: string };
export type Project = {
  schemaVersion: 1; id: string; name: string; origin: string; createdAt: string;
  currentRevisionId?: string; appliedRevisionId?: string; threadId?: string;
  manager?: ManagerBinding;
};
export type ProjectView = { project: Project; revisions: Revision[]; events: Event[]; warnings?: string[] };
export type HostEvent = { event: 'progress'; text: string } | { event: 'inspect'; callId: string; selector: string; url: string };
export type Reply = { id: string; result?: unknown; error?: string } | HostEvent;
