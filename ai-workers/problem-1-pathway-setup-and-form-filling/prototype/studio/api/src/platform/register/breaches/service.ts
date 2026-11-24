// PF-21c (map row 86; SA-11 §3.7, SA-11-14, SA-11-24, SA-11-25, SA-11-35, BR-11; SA7-D74 (b)): ExpatReady's breach register
// and the "Security incident notice" to each affected firm's Owner and Admins.
// Who: the Platform Owner opens, changes and notifies (system/breach:manage); the Auditor reads (system/breach:read); every
// other person, a firm's staff included, gets 403 (PF-4s's system guard first, this service again). The database refuses
// every register call inside a firm's session (the definers' system-only check, migration 20261123210000_pf21c_breaches).
// Recording is unconditional (BR-11): a breach is RECORDED by hand, or a DRAFT pre-filled from a PF-23 integrity alert
// (never sent by itself); whether firms are told is a recorded decision with who and why. Kept 7 years: nothing deletes.
// The notice (SA-11-25): one per breach and firm, in that firm's own transaction (its Owner and Admins read there, under
// its walls), through MessagePort (PF-19b) from the newest published platform template "platform.security_incident_notice"
// (Sample words until counsel's; Unconfirmed: no counsel). The outbox rows, the notice row, its NOTICE_SENT event and one
// line on the firm's own trail (AuditPort) commit together or not at all; the worker sends after the commit. A second
// send to the same firm waits on the first's lock and is refused (409), and its message keys repeat the first's rows,
// so no person is mailed twice. The record's own changes are its insert-only events plus PF-4s's line per call
// (plat_system_audit); a firm's trail gets a line only when the firm is told (a firm never sees an investigation note).
// The firm decides about its clients (SA-11-25); ExpatReady mails only its own users, the firm's staff accounts.
// AUD-3a: the audit line's actor is the staff member's own word, `ourstaff:<id>` (OUR_STAFF), the request's actor, as
// PF-21b's holds; with no staff member it stays `system:platform.register.breach`. Their id stays in its detail too.
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { AlertDetail } from "../../../../../ports/alert.ts";
import { fillFields, type MessagePort, type MessageWordsPort } from "../../../../../ports/messages.ts";
import { firmNames, staffNames } from "../names.ts";
import { Db } from "../../../core.ts";
import { auditEvent } from "../../audit/audit-event.ts";
import { withFirm } from "../../firm-scope.ts";
import { requestHash } from "../../idempotency.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import { forbidden, problem } from "../../identity/keys.ts";

type Tx = Prisma.TransactionClient;
/** SA-07 Appendix A "ExpatReady's data-incident (breach) register": the Platform Owner manages (SA7-D74 (b)). */
export const BREACH_MANAGE_KEY = "system/breach:manage";
/** The same row: the Auditor reads only (the key's name is this row's mapping, SA-07 §10). */
export const BREACH_READ_KEY = "system/breach:read";
export const BREACH_ACTOR = "system:platform.register.breach";
/** AUD-3a: the line's actor, our staff member's own word when there is one. */
const actorOf = (staffId?: string) => (staffId ? `ourstaff:${staffId}` : BREACH_ACTOR);
export const BREACH_AUDIT = Symbol("Breaches.audit");
export const BREACH_MESSAGES = Symbol("Breaches.messages");
/** PF-21rs R0 (QA-757): the words each notice was sent with, read back through the messages module (never its outbox). */
export const BREACH_WORDS = Symbol("Breaches.words");
/** Said on a notice whose stored words cannot be read back (missing, or changed since it was written). */
export const WORDS_UNREADABLE = "The words sent could not be read back: the stored message is missing or has changed since it was sent.";
/** SA-05 Appendix B.6's ExpatReady-owned email (seeded version 1 with Sample words; the Platform Owner publishes more). */
export const NOTICE_TEMPLATE_KEY = "platform.security_incident_notice";
/** Sample list of affected data categories (SA-11-24 names the field, not its list). */
export const BREACH_CATEGORIES = ["identity_documents", "contact_details", "immigration_records", "financial_details", "sign_in_credentials", "messages_and_files", "other"] as const;
const CATEGORY_WORDS: Record<(typeof BREACH_CATEGORIES)[number], string> = { identity_documents: "identity documents", contact_details: "contact details", immigration_records: "immigration records",
  financial_details: "financial details", sign_in_credentials: "sign-in credentials", messages_and_files: "messages and files", other: "other data" };
/** The PF-23 alerts that can open a draft breach: the integrity and security ones (SA-11 BR-2, BR-5). */
export const BREACH_ALERT_KINDS = ["audit_chain_break", "audit_write_failed"] as const;

export type BreachCaller = { staffId: string; keys: readonly string[] };
export type BreachNotice = { id: string; firmId: string; channel: string; recipients: { staffId: string; roles: string[]; outboxId: string; state: string }[]; templateVersionId: string; sentBy: string; sentAt: string };
/** PF-21rs R0: a read for our console names each firm and staff actor (null when not found). */
export type NamedNotice = BreachNotice & { firmName: string | null; sentByName: string | null };
export type NamedBreach = Omit<BreachView, "notices"> & { firms: { id: string; name: string | null }[]; openedByName: string | null; decidedByName: string | null; notices: NamedNotice[] };
export type BreachView = {
  id: string; status: "DRAFT" | "RECORDED"; source: "MANUAL" | "ALERT"; sourceAlert: unknown; discoveredAt: string; description: string; affectedFirms: string[];
  scope: "UNDER_INVESTIGATION" | "KNOWN"; dataCategories: string[]; rootCause: string | null; containment: string | null; decision: "UNDECIDED" | "NOTIFY_FIRMS" | "NO_NOTICE";
  decisionReason: string | null; decidedBy: string | null; decidedAt: string | null; otherNotifications: string | null; openedBy: string; createdAt: string; updatedAt: string; notices: BreachNotice[];
};

/** Ordinary text: control characters (C0 but tab and line breaks, C1) and the invisible direction marks are refused. */
const plain = (max: number, need: string) => z.string().trim().min(1, need).max(max, `At most ${max} characters.`)
  .refine((r) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/.test(r), "Write it as ordinary text.")
  // Break B6: a lone surrogate (half a character) is refused, never stored as U+FFFD; and the text shows something.
  .refine((r) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(r), "Write it as ordinary text.")
  .refine((r) => /[^\s\u200b-\u200d\u2060\ufeff\u00ad]/.test(r), need);
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid").transform((s) => s.toLowerCase());
const Firms = z.array(Uuid).max(200).refine((a) => new Set(a).size === a.length, "Name each firm once.");
const Categories = z.array(z.enum(BREACH_CATEGORIES)).max(BREACH_CATEGORIES.length).refine((a) => new Set(a).size === a.length, "Name each category once.");
const When = z.iso.datetime({ offset: true, error: "A time with its zone." }).transform((v) => new Date(v))
  .refine((d) => d.getUTCFullYear() >= 2000, "A time after the year 2000.").refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "Not in the future.");
/** The guard's written reason (@SystemReason): checked and recorded there; carried in every change's body. */
const Why = { reason: z.string().max(500).optional() };
const OpenBody = z.strictObject({
  ...Why, discoveredAt: When, description: plain(4000, "Describe the breach."), affectedFirms: Firms.optional(), dataCategories: Categories.optional(),
  rootCause: plain(4000, "Give the root cause, or leave it out.").optional(), containment: plain(4000, "Give the containment, or leave it out.").optional(),
  otherNotifications: plain(4000, "Give the other notifications, or leave it out.").optional(),
});
const AlertBody = z.strictObject({ ...Why, alert: z.strictObject({ kind: z.enum(BREACH_ALERT_KINDS), detail: AlertDetail, raisedAt: When }) });
const ChangeBody = z.strictObject({
  ...Why, status: z.literal("RECORDED").optional(), description: plain(4000, "Describe the breach.").optional(), affectedFirms: Firms.optional(), dataCategories: Categories.optional(),
  rootCause: plain(4000, "Give the root cause.").nullable().optional(), containment: plain(4000, "Give the containment.").nullable().optional(),
  otherNotifications: plain(4000, "Give the other notifications.").nullable().optional(),
  decision: z.enum(["UNDECIDED", "NOTIFY_FIRMS", "NO_NOTICE"]).optional(), decisionReason: plain(2000, "Say why.").optional(),
}).refine((b) => Object.keys(b).some((k) => k !== "reason"), { message: "Change at least one field.", path: ["body"] })
  .refine((b) => b.decision === undefined || b.decision === "UNDECIDED" || b.decisionReason !== undefined, { message: "Say why (the decision names who and why).", path: ["decisionReason"] })
  // Review m2: a draft from an alert carries our internal words; confirming it needs the description the firms will read.
  .refine((b) => b.status !== "RECORDED" || b.description !== undefined, { message: "Confirm the description with the record (the firms' notice quotes it).", path: ["description"] })
  .refine((b) => b.decisionReason === undefined || (b.decision !== undefined && b.decision !== "UNDECIDED"), { message: "A reason goes with a decision to notify or not.", path: ["decisionReason"] });
const NoticeBody = z.strictObject({ ...Why, firmId: Uuid });
export const LIST_MAX = 500;
const ListQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(LIST_MAX).optional() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(e: z.ZodError): never { return problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "BREACH_FIELDS", fields: fieldsOf(e) }); }
const notFound = (): never => problem(404, "Not found", "No such breach.", { code: "NOT_FOUND" });
const refusedByDb = (e: unknown): never => {
  const s = String(e);
  if (/plat_breach: no such firm/.test(s)) problem(404, "Not found", "No such firm.", { code: "FIRM_NOT_FOUND" });
  if (/a firm that was sent a notice stays/.test(s)) problem(409, "Firm was notified", "A firm that was sent a notice stays among the affected firms.", { code: "NOTIFIED_FIRM_KEPT" });
  if (/notices were sent, so the decision stays/.test(s)) problem(409, "Notices were sent", "Notices were sent, so the decision, its reason and who made it stay as they are.", { code: "DECISION_KEPT" });
  if (/plat_breach_open: key reused/.test(s)) problem(FIELD_ERROR_STATUS, "Idempotency-Key reused", "This Idempotency-Key was used for another request; nothing was recorded. Use a new key for a new breach.", { code: "IDEMPOTENCY_KEY_REUSED" });
  throw e;
};

/** One breach as plat_breach_json returns it (snake case, times as text). */
type Row = {
  id: string; status: BreachView["status"]; source: BreachView["source"]; source_alert: unknown; discovered_at: string; description: string; affected_firms: string[] | null; data_categories: string[] | null;
  root_cause: string | null; containment: string | null; decision: BreachView["decision"]; decision_reason: string | null; decided_by: string | null; decided_at: string | null;
  other_notifications: string | null; opened_by: string; created_at: string; updated_at: string;
  notices?: { id: string; firm_id: string; channel: string; recipients: BreachNotice["recipients"]; template_version_id: string; sent_by: string; sent_at: string }[];
};
/** plat_breach_notice_ready's answer. */
type Ready = { state: "READY" | "NOT_FOUND" | "DRAFT" | "NOT_DECIDED_TO_NOTIFY" | "NOT_AFFECTED" | "ALREADY_SENT"; discovered_at: string; description: string; data_categories: string[]; containment: string | null };
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
function viewOf(r: Row): BreachView {
  const firms = (r.affected_firms ?? []) as string[];
  return {
    id: r.id, status: r.status, source: r.source, sourceAlert: r.source_alert ?? null, discoveredAt: iso(r.discovered_at)!, description: r.description, affectedFirms: firms,
    scope: firms.length === 0 ? "UNDER_INVESTIGATION" : "KNOWN", dataCategories: r.data_categories ?? [], rootCause: r.root_cause ?? null, containment: r.containment ?? null,
    decision: r.decision, decisionReason: r.decision_reason ?? null, decidedBy: r.decided_by ?? null, decidedAt: iso(r.decided_at), otherNotifications: r.other_notifications ?? null,
    openedBy: r.opened_by, createdAt: iso(r.created_at)!, updatedAt: iso(r.updated_at)!,
    notices: (r.notices ?? []).map((n) => ({ id: n.id, firmId: n.firm_id, channel: n.channel, recipients: n.recipients, templateVersionId: n.template_version_id, sentBy: n.sent_by, sentAt: iso(n.sent_at)! })),
  };
}

@Injectable()
export class Breaches {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(BREACH_MESSAGES) private readonly messages: MessagePort<Tx>, @Inject(BREACH_WORDS) private readonly words: MessageWordsPort, @Inject(BREACH_AUDIT) private readonly audit: AuditPort<Tx> = auditEvent) {}

  private may(c: BreachCaller, key: string) {
    if (!c || !c.keys.includes(key)) forbidden(key === BREACH_READ_KEY ? "Only ExpatReady's Platform Owner and Auditor read the breach register." : "Only ExpatReady's Platform Owner records breaches and sends their notices.", "MISSING_PERMISSION");
  }

  /** POST /api/system/register/breaches: records a breach by hand (RECORDED). 201 with it. */
  async open(c: BreachCaller, body: unknown, key: string): Promise<BreachView & { repeated?: true }> {
    this.may(c, BREACH_MANAGE_KEY);
    const p = OpenBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    const b = p.data;
    return this.insert(key, body, { status: "RECORDED", source: "MANUAL", alert: null, discoveredAt: b.discoveredAt, description: b.description, firms: b.affectedFirms ?? [], categories: b.dataCategories ?? [],
      rootCause: b.rootCause ?? null, containment: b.containment ?? null, other: b.otherNotifications ?? null, by: `staff:${c.staffId}` });
  }

  /** POST /api/system/register/breaches/from-alert { alert: { kind, detail, raisedAt } }: a DRAFT pre-filled from a PF-23
   *  integrity or security alert. Nothing is sent: a draft can get no notice until our staff confirm it and decide. */
  async fromAlert(c: BreachCaller, body: unknown, key: string): Promise<BreachView & { repeated?: true }> {
    this.may(c, BREACH_MANAGE_KEY);
    const p = AlertBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    const a = p.data.alert, firm = a.detail.firmId && UUID.test(a.detail.firmId) ? a.detail.firmId.toLowerCase() : null;
    const what = a.kind === "audit_chain_break" ? "the activity log's hash chain did not verify" : "an activity log line could not be written after its retries";
    // Break B7: the alert's ids stay in source_alert only, never in the words a firm may later read.
    const description = `Draft from an alert (${a.kind}, rule ${a.detail.rule}): ${what}. Write the description firms will read, then confirm; nothing has been sent.`;
    const draft = (firms: string[]) => this.insert(key, body, { status: "DRAFT", source: "ALERT", alert: { kind: a.kind, detail: a.detail, raisedAt: a.raisedAt.toISOString() }, discoveredAt: a.raisedAt, description,
      firms, categories: [], rootCause: null, containment: null, other: null, by: `staff:${c.staffId}` });
    // The alert's firm, when it names one that exists; otherwise the scope is under investigation (BR-11: still recorded).
    if (!firm) return draft([]);
    return draft([firm]).catch((e: { getResponse?: () => unknown }) => { if ((e?.getResponse?.() as { code?: string } | undefined)?.code === "FIRM_NOT_FOUND") return draft([]); throw e; });
  }

  /** Break B4 (STANDARDS §4): the same Idempotency-Key and body by the same person answers the first breach (`repeated`). */
  private async insert(key: string, body: unknown, b: { status: string; source: string; alert: unknown; discoveredAt: Date; description: string; firms: string[]; categories: string[]; rootCause: string | null; containment: string | null; other: string | null; by: string }): Promise<BreachView & { repeated?: true }> {
    const hash = requestHash(body);
    const [row] = await this.db.$queryRaw<{ b: Row & { repeated?: boolean } }[]>`SELECT plat_breach_open(${b.status}, ${b.source}, ${b.alert === null ? null : JSON.stringify(b.alert)}::jsonb, ${b.discoveredAt}::timestamptz, ${b.description},
      ${b.firms}::uuid[], ${b.categories}::text[], ${b.rootCause}, ${b.containment}, ${b.other}, ${b.by}, ${key}, ${hash}) AS b`.catch(refusedByDb);
    const v = viewOf(row.b);
    return row.b.repeated ? { ...v, repeated: true } : v;
  }


  /** PATCH /api/system/register/breaches/:id: changes the given fields; `status: "RECORDED"` confirms a draft; a decision
   *  names why. 200 with the breach. */
  async change(c: BreachCaller, id: string, body: unknown): Promise<BreachView> {
    this.may(c, BREACH_MANAGE_KEY);
    if (!UUID.test(id)) notFound();
    const p = ChangeBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    const b = p.data, patch: Record<string, unknown> = {};
    if (b.status) patch.status = b.status;
    if (b.description !== undefined) patch.description = b.description;
    if (b.affectedFirms !== undefined) patch.affected_firms = b.affectedFirms;
    if (b.dataCategories !== undefined) patch.data_categories = b.dataCategories;
    if (b.rootCause !== undefined) patch.root_cause = b.rootCause;
    if (b.containment !== undefined) patch.containment = b.containment;
    if (b.otherNotifications !== undefined) patch.other_notifications = b.otherNotifications;
    if (b.decision !== undefined) { patch.decision = b.decision; patch.decision_reason = b.decision === "UNDECIDED" ? null : b.decisionReason; }
    const [row] = await this.db.$queryRaw<{ b: Row | null }[]>`SELECT plat_breach_change(${id.toLowerCase()}::uuid, ${JSON.stringify(patch)}::jsonb, ${`staff:${c.staffId}`}) AS b`.catch(refusedByDb);
    if (!row.b) notFound();
    return viewOf(row.b!);
  }

  /** GET /api/system/register/breaches?limit= (1-500): newest discovered first; `truncated` says more exist. */
  async list(c: BreachCaller, query: unknown): Promise<{ breaches: NamedBreach[]; truncated: boolean }> {
    this.may(c, BREACH_READ_KEY);
    const q = ListQuery.safeParse(query ?? {});
    if (!q.success) fields(q.error);
    const limit = q.data.limit ?? LIST_MAX;
    const rows = await this.db.$queryRaw<{ b: Row }[]>`SELECT b FROM plat_breach_list(NULL, ${limit + 1}::int) b`;
    return { breaches: await this.named(rows.slice(0, limit).map((r) => viewOf(r.b))), truncated: rows.length > limit };
  }

  /** GET /api/system/register/breaches/:id: the breach, its notices and its events. */
  async one(c: BreachCaller, id: string): Promise<Omit<NamedBreach, "notices"> & { notices: (NamedNotice & { subject: string | null; text: string | null; wordsNote: string | null })[];
    events: { seq: number; kind: string; at: string; actor: string; actorName: string | null; detail: unknown }[] }> {
    this.may(c, BREACH_READ_KEY);
    if (!UUID.test(id)) notFound();
    const [row] = await this.db.$queryRaw<{ b: Row }[]>`SELECT b FROM plat_breach_list(${id.toLowerCase()}::uuid, 1) b`;
    if (!row) notFound();
    const events = await this.db.$queryRaw<{ seq: bigint; kind: string; at: Date; actor: string; detail: unknown }[]>`SELECT seq, kind, at, actor, detail FROM plat_breach_events(${id.toLowerCase()}::uuid)`;
    const [b] = await this.named([viewOf(row.b)]), people = await staffNames(this.db, events.map((e) => e.actor));
    // QA-757: the words each firm was sent, from its first recipient's stored message (one firm's recipients share them).
    // Break m2 (#3492): one notice at a time (each read is its firm's own short transaction), never all of a 200-firm
    // breach at once against the pool.
    const notices: (NamedNotice & { subject: string | null; text: string | null; wordsNote: string | null })[] = [];
    for (const n of b.notices) {
      const w = n.recipients[0] ? await this.words.storedWords(n.firmId, n.recipients[0].outboxId) : null;
      notices.push({ ...n, subject: w?.subject ?? null, text: w?.text ?? null, wordsNote: w ? null : WORDS_UNREADABLE });
    }
    return { ...b, notices, events: events.map((e) => ({ seq: Number(e.seq), kind: e.kind, at: e.at.toISOString(), actor: e.actor, actorName: people.get(e.actor) ?? null, detail: e.detail })) };
  }

  /** PF-21rs R0: names for the ids a read returns (firms by REGISTER_FIRM_NAMES' one firm-less line; our staff's own plane). */
  private async named(views: BreachView[]): Promise<NamedBreach[]> {
    const firms = await firmNames(this.db, views.flatMap((v) => [...v.affectedFirms, ...v.notices.map((n) => n.firmId)]));
    const people = await staffNames(this.db, views.flatMap((v) => [v.openedBy, v.decidedBy, ...v.notices.map((n) => n.sentBy)]));
    return views.map((v) => ({ ...v, firms: v.affectedFirms.map((f) => ({ id: f, name: firms.get(f) ?? null })), openedByName: people.get(v.openedBy) ?? null,
      decidedByName: v.decidedBy ? people.get(v.decidedBy) ?? null : null, notices: v.notices.map((n) => ({ ...n, firmName: firms.get(n.firmId) ?? null, sentByName: people.get(n.sentBy) ?? null })) }));
  }

  /** POST /api/system/register/breaches/:id/notices { firmId }: the "Security incident notice" to that firm's active Owner
   *  and Admins (SA-11-25), recorded on the breach. 201 with the notice; 409 for a draft, an undecided or "no notice"
   *  breach, a firm already notified, or a firm with no active Owner or Admin; 422 for a firm the breach does not name. */
  async notify(c: BreachCaller, id: string, body: unknown): Promise<BreachNotice> {
    this.may(c, BREACH_MANAGE_KEY);
    if (!UUID.test(id)) notFound();
    const p = NoticeBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    const breach = id.toLowerCase(), firm = p.data.firmId, by = `staff:${c.staffId}`;
    const sent = await withFirm(firm, () => this.db.$transaction(async (tx) => {
      const [{ r }] = await tx.$queryRaw<{ r: Ready }[]>`SELECT plat_breach_notice_ready(${breach}::uuid, ${firm}::uuid) AS r`;
      if (r.state === "NOT_FOUND") notFound();
      if (r.state === "DRAFT") problem(409, "Still a draft", "Confirm the breach record before any notice is sent.", { code: "BREACH_DRAFT" });
      if (r.state === "NOT_DECIDED_TO_NOTIFY") problem(409, "No decision to notify", "Record the decision to notify firms, with why, before any notice is sent.", { code: "NOT_DECIDED_TO_NOTIFY" });
      if (r.state === "NOT_AFFECTED") problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "This breach does not name that firm.", { code: "BREACH_FIELDS", fields: { firmId: "This breach does not name that firm." } });
      if (r.state === "ALREADY_SENT") problem(409, "Already notified", "This firm was already sent this breach's notice; nothing was sent again.", { code: "ALREADY_NOTIFIED" });
      const [f] = await tx.$queryRaw<{ name: string }[]>`SELECT operating_name AS name FROM platform_firm WHERE id = ${firm}::uuid`;
      if (!f) problem(404, "Not found", "No such firm.", { code: "FIRM_NOT_FOUND" });
      const [v] = await tx.$queryRaw<{ id: string; subject: string | null; body: string }[]>`SELECT v.id::text AS id, v.subject, v.body FROM msg_template_version v JOIN msg_template t ON t.id = v.template_id
        WHERE t.owner = 'PLATFORM' AND t.firm_id IS NULL AND v.firm_id IS NULL AND t.key = ${NOTICE_TEMPLATE_KEY} AND t.channel = 'EMAIL' AND t.language = 'en' ORDER BY v.version DESC LIMIT 1`;
      if (!v) problem(409, "No published notice", "The Security incident notice has no published version.", { code: "NO_TEMPLATE" });
      const people = await tx.$queryRaw<{ id: string; email: string; roles: string[] }[]>`SELECT s.id::text AS id, s.email, array_agg(DISTINCT g.role::text ORDER BY g.role::text) AS roles
        FROM platform_staff s JOIN platform_role_grant g ON g.staff_id = s.id AND g.firm_id = s.firm_id AND g.ended_at IS NULL AND g.role IN ('OWNER', 'ADMIN')
        WHERE s.firm_id = ${firm}::uuid AND s.status = 'ACTIVE' GROUP BY s.id, s.email ORDER BY s.id`;
      if (people.length === 0) problem(409, "Nobody to notify", "The firm has no active Owner or Admin; nothing was sent or recorded.", { code: "NO_RECIPIENTS" });
      const cats = r.data_categories.map((k) => CATEGORY_WORDS[k as keyof typeof CATEGORY_WORDS] ?? k);
      const values = { firm_name: f.name, discovered_on: `${new Date(r.discovered_at).toISOString().slice(0, 16).replace("T", " ")} UTC`, description: r.description, data_categories: cats.length ? cats.join(", ") : "not yet known",
        containment: r.containment ?? "Our investigation is continuing.", breach_ref: breach };
      const words = { subject: fillFields(v.subject ?? "", values), text: fillFields(v.body, values) };
      const recipients: BreachNotice["recipients"] = [];
      for (const s of people) {
        const out = await this.messages.send(tx, { firmId: firm, person: { kind: "STAFF", id: s.id }, channel: "EMAIL", class: "TRANSACTIONAL", address: s.email, content: words, idempotencyKey: `breach-notice:${breach}:${s.id}` });
        recipients.push({ staffId: s.id, roles: s.roles, outboxId: out.outboxId, state: out.state });
      }
      // Break B2: a notice nobody can receive (every address suppressed) is not recorded as sent; nothing is kept, so it
      // can be sent once an address works again.
      if (recipients.every((x) => x.state === "SUPPRESSED")) problem(409, "Nobody can receive it", "Every Owner and Admin address of this firm is suppressed (bounced or complained); nothing was sent or recorded.", { code: "NOT_DELIVERABLE" });
      const [n] = await tx.$queryRaw<{ id: string; sent_at: Date }[]>`SELECT id::text AS id, sent_at FROM plat_breach_notice_record(${breach}::uuid, ${firm}::uuid, ${JSON.stringify(recipients)}::jsonb, ${v.id}::uuid, ${by})`;
      await this.audit.record(tx, { firmId: firm, actor: actorOf(c.staffId), action: "platform.breach.notice_sent", entity: "plat_breach_notice", entityKey: n.id,
        summary: `ExpatReady sent its Security incident notice about a security incident discovered ${values.discovered_on} to this firm's Owner and Admins (${recipients.length}). The firm decides whether and how to tell its clients.`,
        detail: { breachId: breach, recipients: recipients.length, templateVersionId: v.id, by, staffId: c.staffId }, before: null,
        after: { breachId: breach, channel: "EMAIL", recipients: recipients.map((x) => x.staffId), templateVersionId: v.id, sentBy: by, sentAt: n.sent_at.toISOString() } });
      return { id: n.id, firmId: firm, channel: "EMAIL", recipients, templateVersionId: v.id, sentBy: by, sentAt: n.sent_at.toISOString() };
    }, { maxWait: 10_000, timeout: 60_000 })).catch((e: unknown) => {
      // Break B1: a change that withdrew the firm or the decision won the race: nothing was recorded or sent.
      if (/plat_breach_notice_allowed|a firm that was sent a notice stays|notices were sent, so the decision stays/.test(String(e)))
        problem(409, "The breach changed", "The breach changed while the notice was being sent; nothing was sent. Open it again.", { code: "BREACH_CHANGED" });
      throw e;
    });
    // After the commit: the worker sends; a dispatch that fails is left to the outbox sweep (never sent twice).
    await this.messages.dispatch(firm, sent.recipients.filter((x) => x.state === "QUEUED").map((x) => x.outboxId)).catch(() => undefined);
    return sent;
  }
}
