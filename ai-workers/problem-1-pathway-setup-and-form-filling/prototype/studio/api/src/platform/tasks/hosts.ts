// PF-29b (R1.75; concept screens/tk-tasks/concept.md r2.1 BR-1, BR-3; AG-13-67; BR-21): the task hosts. A task sits on a
// record a module owns (a person on the front office, a case, a case client) or on the firm itself. The module that owns a
// host type registers it here at start-up (as modules register their notification labeller, notifications/labels.ts), so
// the task area imports no module's tables or rules: the host says, for a reader and some ids, which ones the reader may
// see now by its own view rule, and for those its words, page, type label and office zone. An id it leaves out is one
// the reader may not see: the task then shows as "Restricted" to its assignee or maker, and is absent for anyone else.
// A host that throws sees nothing (logged by host type only), so a task list never fails because one module did.
import { Injectable, Logger } from "@nestjs/common";
import type { StaffContext } from "../identity/keys.ts";

export const HOST_TYPES = ["fo_person", "case", "case_client", "firm"] as const;
export type HostType = (typeof HOST_TYPES)[number];
export const CONTEXT_TYPES = ["LEAD", "PROSPECT", "CASE"] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];
/** A host as one reader may see it: its words (a lead's name and number), its app page, its type label (Individual or
 *  Corporate for a client or case, null for a lead), and the record's office zone (IANA) for due times, when it has one. */
export type HostView = { label: string; url: string; typeLabel: string | null; zone: string | null };
/** The ids a host is asked about: the record and the context it was made in (a prospect's task made while it was a lead). */
export type HostRef = { id: string; contextType: ContextType | null; contextId: string | null };
/** One module's host: the reader and some records of its type (all in the reader's firm) → the ones the reader may see. */
export type TaskHost = (reader: StaffContext, refs: HostRef[]) => Promise<Map<string, HostView>>;

/** An app path only: one leading slash, never "//" (a browser reads //host as another site; PF-18n break m3). */
const PAGE = /^\/(?!\/)[A-Za-z0-9/_-]{1,200}$/;
/** The key a host answer is filed under: the record and its context (one person can be a lead and a prospect). */
export const refKey = (r: HostRef) => `${r.id}|${r.contextType ?? ""}|${r.contextId ?? ""}`;

/** The firm itself: every staff member of the firm sees it (a task with no record, AG-13-1). */
const FIRM_HOST: TaskHost = async (_reader, refs) => new Map(refs.map((r) => [refKey(r), { label: "Firm", url: "/tasks", typeLabel: null, zone: null }]));

@Injectable()
export class TaskHosts {
  private readonly hosts = new Map<HostType, TaskHost>([["firm", FIRM_HOST]]);
  private readonly log = new Logger("tasks");
  /** One host per type: a second registration for a type is refused (one module owns each). */
  register(type: HostType, host: TaskHost): void {
    if (!(HOST_TYPES as readonly string[]).includes(type)) throw new Error(`TaskHosts: ${type} is no host type`);
    if (this.hosts.has(type)) throw new Error(`TaskHosts: ${type} already has its host`);
    this.hosts.set(type, host);
  }
  has(type: string): type is HostType { return this.hosts.has(type as HostType); }
  /** What this reader may see of these records, keyed `<type>|refKey`. A type with no host sees nothing. */
  async see(reader: StaffContext, items: ({ type: string } & HostRef)[]): Promise<Map<string, HostView>> {
    const out = new Map<string, HostView>();
    const byType = new Map<string, HostRef[]>();
    for (const i of items) if (this.has(i.type)) (byType.get(i.type) ?? byType.set(i.type, []).get(i.type)!).push({ id: i.id, contextType: i.contextType, contextId: i.contextId });
    await Promise.all([...byType].map(async ([type, refs]) => {
      const asked = new Set(refs.map(refKey));
      try {
        const got = await this.hosts.get(type as HostType)!(reader, refs);
        // Only asked records with a well-formed answer (a host can never add another record or an outside link).
        for (const [k, v] of got) {
          if (asked.has(k) && typeof v.label === "string" && v.label.length > 0 && v.label.length <= 200 && PAGE.test(v.url)) {
            out.set(`${type}|${k}`, { label: v.label, url: v.url, typeLabel: typeof v.typeLabel === "string" ? v.typeLabel.slice(0, 40) : null, zone: typeof v.zone === "string" ? v.zone : null });
          }
        }
      } catch {
        this.log.warn(`tasks: the ${type} host failed; its tasks show as Restricted`);
      }
    }));
    return out;
  }
}
