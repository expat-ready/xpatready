// PF-4c part 1 (AG-1-69; SA-3-39, SA-3-5) and part 1b (P-727): the batch invite's rows. One form of 1-50 rows (name,
// email, roles); no file upload of any kind. This file reads and flags the rows without the database: a bad email or role
// list, a name that is not plain text, an Owner row and the same email twice in the form each become that row's flag,
// never a 400 for the whole form. The service (PlatformIdentity.inviteBatch) adds the checks that need the database (role
// rules, already staff, already invited) through the same row check the single invite uses, then one seat check for the
// valid rows (the rows past the limit are flagged OVER_SEAT_LIMIT), all inside one locked transaction; the rows with no
// flag are sent. The name is only the email's greeting: the batch never stores it (part 1's rule; the single invite's
// displayName is PF-4dn's, and the batch does not pass it).
// A row with a field we do not know ("nmae") is the body's problem, not the row's data (PF-28's one input rule): the whole
// form is refused 422 ROWS_FLAGGED with those rows and `fields`, and nothing is sent, so a typo never sends an invitation
// without what the sender meant to give.
import { HttpException } from "@nestjs/common";
import type { PlatformRole } from "@prisma/client";
import { problem } from "./keys.ts";
import { emailOf, rolesOf } from "./service.ts";

export const BATCH_MAX_ROWS = 50;   // P-727: 1-50 rows
export type RowFlag = { code: string; detail: string };
export type BatchRow = { row: number; name: string | null; email: string | null; roles: PlatformRole[] | null; flags: RowFlag[] };

/** The words of a refusal thrown by a shared check (problem()), as a row's flag. Anything else is not a row problem. */
export function flagOf(e: unknown, code?: string): RowFlag {
  if (!(e instanceof HttpException)) throw e;
  const r = e.getResponse() as { code?: string; detail?: string };
  return { code: code ?? r.code ?? "ROW_REFUSED", detail: r.detail ?? "This row cannot be sent." };
}

/** A name with nothing to read (spaces, marks or fillers only) is no name (review m3, break 5), as with reasons. */
const VISIBLE = (s: string) => s.replace(/[\s\p{Z}\p{Cf}\p{M}\u115f\u1160\u3164\uffa0]/gu, "").length > 0;

/** The greeting's name: optional; 1-100 characters after trimming, no control, format or line-break character (it goes
 *  into an email's text, so it can never add a line or a header). */
function nameOf(v: unknown): string | null {
  if (v === undefined || v === null || (typeof v === "string" && !VISIBLE(v) && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v))) return null;
  if (typeof v !== "string") return problem(400, "Check the name", "The name is text.", { code: "INVALID_NAME" });
  const t = v.trim();
  if (!VISIBLE(t) || [...t].length > 100 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v)) return problem(400, "Check the name", "Give the person's name in 1 to 100 characters, on one line.", { code: "INVALID_NAME" });
  try { encodeURIComponent(t); } catch { return problem(400, "Check the name", "The name has a broken character. Type it again.", { code: "INVALID_NAME" }); }
  return t;
}

const OWNER_WORDS = "Invite an Owner on their own: it needs a reason and Confirm it's you.";
/** Break 3: an inviter who is not an Owner is told the rule that applies to them (the single invite answers OWNER_ONLY). */
const OWNER_ONLY_WORDS = "Only an Owner gives the Owner role. Ask an Owner to invite this person.";

/** Reads the form's rows: 1-50 rows or 422 ROWS_COUNT (with `fields`); a row with an unknown field 422 ROWS_FLAGGED;
 *  every other problem is a flag on its row. */
const ROW_KEYS = ["name", "email", "roles"];
export function batchRowsOf(body: { rows?: unknown }, actorIsOwner: boolean): BatchRow[] {
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > BATCH_MAX_ROWS)
    return problem(422, "Check the rows", `Send 1 to ${BATCH_MAX_ROWS} people in one form (rows). Nothing was sent.`, { code: "ROWS_COUNT", maxRows: BATCH_MAX_ROWS, fields: { rows: `Give 1 to ${BATCH_MAX_ROWS} rows.` } });
  const seen = new Set<string>();
  const read = rows.map((raw, i) => {
    const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as { name?: unknown; email?: unknown; roles?: unknown };
    const out: BatchRow = { row: i + 1, name: null, email: null, roles: null, flags: [] };
    // PF-28 part 2a (review m1): a misspelt field on a row ("nmae") is named on that row, never silently dropped (and the
    // form is refused below).
    const unknown = Object.keys(r).filter((k) => !ROW_KEYS.includes(k)).map((k) => k.slice(0, 64));
    if (unknown.length) out.flags.push({ code: "UNKNOWN_FIELD", detail: `This row has ${unknown.length === 1 ? "a field" : "fields"} not allowed here: ${unknown.slice(0, 5).join(", ")}. Use name, email and roles.` });
    try { out.name = nameOf(r.name); } catch (e) { out.flags.push(flagOf(e)); }
    try { out.email = emailOf(r.email); } catch (e) { out.flags.push(flagOf(e, "INVALID_EMAIL")); }
    try { out.roles = rolesOf(r.roles); } catch (e) { out.flags.push(flagOf(e, "INVALID_ROLES")); }
    if (out.roles?.includes("OWNER")) out.flags.push({ code: "OWNER_BY_SINGLE_INVITE", detail: actorIsOwner ? OWNER_WORDS : OWNER_ONLY_WORDS });
    // emailOf keeps one spelling per address (lower case, no spaces or invisible characters), so case and spacing cannot
    // hide a duplicate. Flagged on the second and later rows.
    if (out.email) { if (seen.has(out.email)) out.flags.push({ code: "DUPLICATE_IN_FORM", detail: "This email is already on an earlier row of this form." }); seen.add(out.email); }
    return out;
  });
  const typos = read.filter((r) => r.flags.some((f) => f.code === "UNKNOWN_FIELD"));
  if (typos.length) problem(422, "Check the rows", `${typos.length === 1 ? "A row has" : `${typos.length} rows have`} a field not allowed here. Use name, email and roles. Nothing was sent.`,
    { code: "ROWS_FLAGGED", rows: typos.map((r) => ({ row: r.row, flags: r.flags.filter((f) => f.code === "UNKNOWN_FIELD") })), fields: Object.fromEntries(typos.map((r) => [`rows.${r.row - 1}`, "This row has a field not allowed here."])) });
  return read;
}

/** The words on a row past the seat limit (P-727): the rows before it took the plan's last seats. */
export function overSeatWords(limit: number, planName: string | null): string {
  if (planName === null) return "Your firm has no live subscription, so nobody can be added.";
  return `No seat left for this person: your plan (${planName}) has ${limit} ${limit === 1 ? "seat" : "seats"}, all taken by your staff, pending invitations and the rows above. Remove someone or upgrade your plan, then send this row again.`;
}
