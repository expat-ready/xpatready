// FO-2 (contracts §2.1, §7; AG-02): what the sales files share: the answers, the text and contact rules, who sees what,
// and how a change is written down (one audit line through AuditPort, then the outbox row last: §0.5, PF-3 m8).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { EventName } from "../../../../ports/events.ts";
import { DUTY_KEYS, problem, type StaffContext } from "../../platform/identity/keys.ts";
import { EVERYONE_SEES_ALL, readSetting } from "../../platform/settings.ts";

export type Tx = Prisma.TransactionClient;

export const unprocessable = (detail: string, fields: Record<string, string> = {}, extra: Record<string, unknown> = {}): never =>
  problem(422, "Check the details", detail, { code: "INVALID", fields, ...extra });
export const conflict = (detail: string, code = "STATE", extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
export const notFound = (what = "lead"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LINE_BREAK = /[\n\r\u2028\u2029]/;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** One trimmed text field, or null when empty and not required. Refused: not text, longer than `max`, no letter or digit,
 *  a control character (a line break only where `multiline`). Stored as plain text, never run (AG-2-49 rule 5). */
export function text(v: unknown, o: { field: string; what: string; max: number; required?: boolean; multiline?: boolean }): string | null {
  const bad = (m: string) => unprocessable(`${o.what}: ${m}`, { [o.field]: m });
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) return o.required ? bad("this is required.") : null;
  if (typeof v !== "string") return bad("must be text.");
  const t = v.normalize("NFC").trim();
  if (t.length > o.max) return bad(`at most ${o.max} characters.`);
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

/** A phone in E.164 when it can be read (a number with its +country, or a 10-digit North American number, the firm's one
 *  country being Canada, FD-68: Sample rule until PF's phone library), else kept as typed and marked unreadable: an
 *  enquiry is never dropped over a phone format (AG-2-84 rule 5); staff see "Fix number". */
export function phone(v: unknown, field = "phone"): { phone: string; readable: boolean } | null {
  const t = text(v, { field, what: "Phone", max: 40 });
  if (t === null) return null;
  const digits = t.replace(/[\s().-]/g, "");
  if (/^\+[1-9][0-9]{6,14}$/.test(digits)) return { phone: digits, readable: true };
  if (/^1?[2-9][0-9]{9}$/.test(digits)) return { phone: `+1${digits.slice(-10)}`, readable: true };
  return { phone: t, readable: false };
}

export const actorOf = (ctx: StaffContext) => `staff:${ctx.staffId}`;

/** Who sees which leads (contracts §2.1 "Visibility"; AG-2-13c rules 6, 9): Owners and Admins see all; others see all when
 *  the firm's "everyone sees all" is on and they hold the view.all key, else their own. Unassigned leads are seen by
 *  people who may see all (the view.all key) or assign. */
export async function visibilityOf(db: Tx | PrismaClient, ctx: StaffContext) {
  const admin = DUTY_KEYS.firm_admin.every((k) => ctx.keys.includes(k));
  const everyone = (await readSetting<boolean>(db, ctx.firmId, EVERYONE_SEES_ALL.key)) === true;
  const seesAll = admin || (everyone && ctx.keys.includes("agent/prospect:view.all"));
  const seesUnassigned = seesAll || ctx.keys.includes("agent/prospect:view.all") || ctx.keys.includes("agent/prospect:assign");
  return { seesAll, seesUnassigned };
}
export type Visibility = Awaited<ReturnType<typeof visibilityOf>>;
/** Whether a lead (its owner) is visible: all, the viewer's own, or an unassigned one when Unassigned leads are visible. */
export const sees = (v: Visibility, ctx: StaffContext, ownerStaffId: string | null) =>
  v.seesAll || ownerStaffId === ctx.staffId || (ownerStaffId === null && v.seesUnassigned);

/** One change written down: the audit line (fail-closed) and then the outbox row, last in the transaction. */
export async function written(tx: Tx, audit: AuditPort<Tx>, c: {
  firmId: string; actor: string; action: string; entity: string; entityKey: string; summary: string;
  detail?: Record<string, string | number | boolean | null>; event?: { type: EventName; subjectId: string; payload: object };
}) {
  await audit.record(tx, { firmId: c.firmId, actor: c.actor, action: c.action, entity: c.entity, entityKey: c.entityKey, summary: c.summary, detail: c.detail ?? {} });
  if (c.event) await tx.moduleEvent.create({ data: { firmId: c.firmId, type: c.event.type, subjectId: c.event.subjectId, payload: c.event.payload as Prisma.InputJsonValue } });
}
