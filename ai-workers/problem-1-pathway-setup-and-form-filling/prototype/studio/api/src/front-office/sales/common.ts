// FO-2 (contracts §2.1, §7; AG-02): what the sales files share: the answers, the text and contact rules, who sees what,
// and how a change is written down (one audit line through AuditPort, then the outbox row last: §0.5, PF-3 m8).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort, AuditValues } from "../../../../ports/audit.ts";
import type { EventName } from "../../../../ports/events.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { phoneE164Exact } from "../duplicates/phone.ts";
import { EVERYONE_SEES_ALL, readSetting } from "../../platform/settings.ts";

export type Tx = Prisma.TransactionClient;

export const unprocessable = (detail: string, fields: Record<string, string> = {}, extra: Record<string, unknown> = {}): never =>
  problem(422, "Check the details", detail, { code: "INVALID", fields, ...extra });
export const conflict = (detail: string, code = "STATE", extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
export const notFound = (what = "lead"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\u3164\ufeff\u{e0000}-\u{e007f}]/u;   // + invisible, direction and tag marks (break m4)
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** One trimmed text field, or null: not text, too long, no letter or digit, or a control mark → refused (AG-2-49 rule 5). */
export function text(v: unknown, o: { field: string; what: string; max: number; required?: boolean; multiline?: boolean }): string | null {
  const bad = (m: string) => unprocessable(`${o.what}: ${m}`, { [o.field]: m });
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return o.required ? bad("this is required.") : null;
  if (typeof v !== "string") return bad("must be text.");
  const t = v.normalize("NFC").trim();
  if ([...t].length > o.max) return bad(`at most ${o.max} characters.`);   // characters, not UTF-16 units (break m3)
  if (CONTROL.test(t) || (!o.multiline && LINE_BREAK.test(t))) return bad(o.multiline ? "remove control characters." : "one line, no control characters.");
  if (!HAS_WORD.test(t)) return o.required ? bad("this is required.") : null;
  return t;
}

/** An email kept in lower case (the fo_person check), or null. */
export function email(v: unknown, field = "email"): string | null {
  const t = text(v, { field, what: "Email", max: 254 });
  if (t === null) return null;
  const e = t.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(e)) return unprocessable("Email: not an email address.", { [field]: "Not an email address." });
  return e;
}

/** A typed phone at an arrival door (FO-9b, P-747): E.164 and readable when FO-9a's exact normaliser reads it
 *  (duplicates/phone.ts phoneE164Exact: libphonenumber-js, default region CA, nothing typed lost), else kept as typed
 *  and flagged unreadable, never refused and never dropped (AG-2-84 rule 5, "Fix number"). */
export function phone(v: unknown, field = "phone"): { phone: string; readable: boolean } | null {
  const t = text(v, { field, what: "Phone", max: 40 });
  if (t === null) return null;
  const e = phoneE164Exact(t);
  return e ? { phone: e, readable: true } : { phone: t, readable: false };
}

export const actorOf = (ctx: StaffContext) => `staff:${ctx.staffId}`;

/** Who sees which leads (AG-2-64 rules 2-3, SA-6-24, PF-6b ruling 4; FO-2v): the one own-versus-all rule retainers
 *  follow too: all with agent/prospect:view.all AND the firm's "everyone sees all" on, else their own; no role sees all
 *  regardless (no requirement backs an Owner/Admin override, QA-477). Unassigned leads with view.all or assign
 *  (AG-2-13c rule 6). One function serves the list, the read, the counts and every change path (AG-2-64 rule 3). */
export async function visibilityOf(db: Tx | PrismaClient, ctx: StaffContext) {
  const everyone = (await readSetting<boolean>(db, ctx.firmId, EVERYONE_SEES_ALL.key)) === true;
  const seesAll = everyone && ctx.keys.includes("agent/prospect:view.all");
  const seesUnassigned = seesAll || ctx.keys.includes("agent/prospect:view.all") || ctx.keys.includes("agent/prospect:assign");
  return { seesAll, seesUnassigned };
}
export type Visibility = Awaited<ReturnType<typeof visibilityOf>>;
/** Whether a lead (its owner) is visible: all, the viewer's own, or an unassigned one when Unassigned leads are visible. */
export const sees = (v: Visibility, ctx: StaffContext, ownerStaffId: string | null) =>
  v.seesAll || ownerStaffId === ctx.staffId || (ownerStaffId === null && v.seesUnassigned);

/** One lead change written down (entity fo_lead, named literally for check_case_feed's sweep): the audit line (fail-closed) and then the outbox row, last in the transaction.
 *  R1.8 (QA-594): before and after are required (null for a side that does not exist). */
export async function written(tx: Tx, audit: AuditPort<Tx>, c: {
  firmId: string; actor: string; action: string; entityKey: string; summary: string;
  detail?: Record<string, string | number | boolean | null>; event?: { type: EventName; subjectId: string; payload: object };
  before: AuditValues | null; after: AuditValues | null;
}) {
  await audit.record(tx, { firmId: c.firmId, actor: c.actor, action: c.action, entity: "fo_lead", entityKey: c.entityKey, summary: c.summary, detail: c.detail ?? {}, before: c.before, after: c.after });
  if (c.event) await tx.moduleEvent.create({ data: { firmId: c.firmId, type: c.event.type, subjectId: c.event.subjectId, payload: c.event.payload as Prisma.InputJsonValue } });
}
