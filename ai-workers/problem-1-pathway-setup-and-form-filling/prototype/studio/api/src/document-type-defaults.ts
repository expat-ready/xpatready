// CS-D7c (map row 70; AG-9-12, AG-9-29, AG-9-64; P-170, AGENTS rule 4): a document type's translation, notarisation and
// validity defaults: translation_rule (NOT_REQUIRED | REQUIRED_IF_NOT_EN_FR), notarisation_rule (NOT_REQUIRED |
// REQUIRED), has_expiry and max_age_days, all null = not set (the type behaves as before). Library data read by every
// case whose release names the type (CS-D7 seeds a document's flags from them), so it changes only as a library change,
// the same path as the type's provider roles (document-providers.ts, C6.14): the author proposes the four values with the
// official words they come from (quote and source file, read at source by whoever enters them) and a reason; a second
// person approves on To review (never the proposer, P-253); at approval the type gets a draft version with them (checked
// again first), published with the next release that carries it. A value with no citation is refused here, and the
// database refuses any non-draft version that carries one without it (document_type_defaults_cited_check). A release
// whose types carry no defaults is byte-identical to before (engine/snapshot.ts). No AI (US$0).
//   GET  /api/library/document-types/:key/defaults   { key, name, defaults, open, uses, help }
//   POST /api/library/document-types/:key/defaults   { translation_rule, notarisation_rule, has_expiry, max_age_days, source_quote, source_file, reason } → the waiting change
import { Body, Controller, Get, Headers, HttpException, Inject, Injectable, Param, Post } from "@nestjs/common";
import { Prisma, type LibraryChange } from "@prisma/client";
import { z } from "zod";
import { INVISIBLE, UNSTORABLE } from "../../contracts/documents.ts";
import { ACTORS, actorOf, Audit, Db, need, readerOf, revise, strip, Workspace, type Actor } from "./core.ts";
import { lockItem, refuseRetired } from "./library-items.ts";

type H = string | undefined;
type Tx = Prisma.TransactionClient;
export const DEFAULTS_KIND = "document_defaults", DEFAULTS_ACTION = "SET_DEFAULTS";
export const TRANSLATION_RULES = ["NOT_REQUIRED", "REQUIRED_IF_NOT_EN_FR"] as const;
export const NOTARISATION_RULES = ["NOT_REQUIRED", "REQUIRED"] as const;
const OPEN = ["WAITING", "RETURNED", "APPROVED"];
const problem = (status: number, title: string, detail: string, extra: Record<string, unknown> = {}) =>
  new HttpException({ type: `https://expatready.local/problems/${title.toLowerCase().replace(/[^a-z]+/g, "-")}`, title, status, detail, ...extra }, status);
const lockKey = (workspaceId: string, key: string) => `${DEFAULTS_KIND}:${workspaceId}:${key}`;
const KEY = /^[a-z0-9][a-z0-9_.:-]{0,119}$/i;
const REASON = "Say why (3 to 300 characters): for example where the official page says it.";
/** Free text that can be stored: no control character or half an emoji; invisible characters do not count. */
const text = (what: string, min: number, max: number) => z.string({ message: `${what} (${min} to ${max} characters).` })
  .refine((x) => !UNSTORABLE.test(x), `${what.split(":")[0]} has a character that cannot be stored (a control character or half of an emoji). Retype it.`)
  .transform((x) => x.replace(INVISIBLE, "").trim()).pipe(z.string().min(min, `${what} (${min} to ${max} characters).`).max(max, `${what} (${min} to ${max} characters).`));
export const DefaultsBody = z.strictObject({
  translation_rule: z.enum(TRANSLATION_RULES, { message: "translation_rule is NOT_REQUIRED, REQUIRED_IF_NOT_EN_FR or null (not set)." }).nullable(),
  notarisation_rule: z.enum(NOTARISATION_RULES, { message: "notarisation_rule is NOT_REQUIRED, REQUIRED or null (not set)." }).nullable(),
  has_expiry: z.boolean({ message: "has_expiry is true, false or null (not set)." }).nullable(),
  max_age_days: z.number({ message: "max_age_days is a whole number of days from 1 to 36500, or null (not set)." }).int("max_age_days is a whole number of days.").min(1, "max_age_days is at least 1 day.").max(36500, "max_age_days is at most 36500 days.").nullable(),
  source_quote: text("The official words: quote the page that says it", 3, 2000).optional(),
  source_file: text("The official source: the page's file or address", 3, 300).optional(),
  reason: text(REASON.replace(" (3 to 300 characters)", ""), 3, 300),
});
export type TypeDefaults = { translation_rule: string | null; notarisation_rule: string | null; has_expiry: boolean | null; max_age_days: number | null; source_quote: string | null; source_file: string | null };
type Row = { translationRule: string | null; notarisationRule: string | null; hasExpiry: boolean | null; maxAgeDays: number | null; defaultsSourceQuote: string | null; defaultsSourceFile: string | null };
export const defaultsOf = (r: Row): TypeDefaults => ({ translation_rule: r.translationRule, notarisation_rule: r.notarisationRule, has_expiry: r.hasExpiry, max_age_days: r.maxAgeDays, source_quote: r.defaultsSourceQuote, source_file: r.defaultsSourceFile });
const columns = (d: TypeDefaults) => ({ translationRule: d.translation_rule, notarisationRule: d.notarisation_rule, hasExpiry: d.has_expiry, maxAgeDays: d.max_age_days, defaultsSourceQuote: d.source_quote, defaultsSourceFile: d.source_file });
export const anySet = (d: Pick<TypeDefaults, "translation_rule" | "notarisation_rule" | "has_expiry" | "max_age_days">) => d.translation_rule !== null || d.notarisation_rule !== null || d.has_expiry !== null || d.max_age_days !== null;
const FIELDS = ["translation_rule", "notarisation_rule", "has_expiry", "max_age_days", "source_quote", "source_file"] as const;
/** Field by field: a change's stored before/after come back from jsonb with its own key order. */
const same = (a: TypeDefaults, b: TypeDefaults) => FIELDS.every((k) => (a[k] ?? null) === (b[k] ?? null));
const copyType = (r: Record<string, unknown>) => { const x = strip(r); for (const k of ["readerProfile", "suppliesAbout", "sets"]) if (x[k] === null) x[k] = Prisma.DbNull; return x; };
const RULE_WORDS: Record<string, string> = { NOT_REQUIRED: "not required", REQUIRED_IF_NOT_EN_FR: "required when not in English or French", REQUIRED: "required" };
/** The four values in words, for To review, History and the audit line. */
export function defaultsWords(d: TypeDefaults) {
  if (!anySet(d)) return "not set (behaves as before)";
  return [`translation ${d.translation_rule ? RULE_WORDS[d.translation_rule] : "not set"}`, `notarisation ${d.notarisation_rule ? RULE_WORDS[d.notarisation_rule] : "not set"}`,
    d.has_expiry === null ? "expiry not set" : d.has_expiry ? "has an expiry date" : "no expiry date", d.max_age_days === null ? "no age limit set" : `no older than ${d.max_age_days} day${d.max_age_days === 1 ? "" : "s"}`].join("; ");
}

async function typeOf(db: Pick<Db, "documentType"> | Tx, workspaceId: string, key: string) {
  const rows = await db.documentType.findMany({ where: { workspaceId, documentTypeKey: key }, orderBy: { version: "desc" } });
  return { rows, current: rows.find((r) => r.status === "DRAFT") ?? rows.find((r) => r.status === "PUBLISHED") ?? null };
}
export async function openDefaultsChange(db: Pick<Db, "libraryChange"> | Tx, workspaceId: string, key: string) {
  return db.libraryChange.findFirst({ where: { workspaceId, kind: DEFAULTS_KIND, key, status: { in: OPEN } }, orderBy: { proposedAt: "desc" } });
}

@Injectable()
export class DocumentTypeDefaults {
  constructor(@Inject(Db) private readonly db: Db, @Inject(Workspace) private readonly ws: Workspace, @Inject(Audit) private readonly audit: Audit) {}

  private uses(workspaceId: string, key: string) {
    return this.db.documentRequirement.findMany({ where: { workspaceId, documentTypeKey: key, status: { not: "RETIRED" } }, distinct: ["combinationId"], select: { combinationId: true } }).then((x) => x.length);
  }

  async view(key: string) {
    if (!KEY.test(key)) throw problem(404, "Not in the library", `${key} is not a document type.`);
    const workspaceId = await this.ws.id();
    const { current } = await typeOf(this.db, workspaceId, key);
    if (!current) throw problem(404, "Not in the library", "That document type is not in the shared library (it may have been deleted or reset).");
    const o = await openDefaultsChange(this.db, workspaceId, key);
    return { key, name: current.name, defaults: defaultsOf(current), words: defaultsWords(defaultsOf(current)), uses: await this.uses(workspaceId, key),
      open: o ? { id: o.id, status: o.status as "WAITING" | "RETURNED" | "APPROVED", by: ACTORS.find((a) => a.id === o.proposedBy)?.name ?? "A person", byId: o.proposedBy, reason: o.reason ?? "", note: o.decisionNote, change: defaultsView(o) } : null,
      help: "Each value set needs the official words it comes from (quote and source). A case's documents of this type start from these flags; staff can change them on the document." };
  }

  async propose(actor: Actor, key: string, body: unknown) {
    need(actor, "author"); // the author proposes; a second person approves (P-253)
    if (!KEY.test(key)) throw problem(404, "Not in the library", `${key} is not a document type.`);
    const b = DefaultsBody.safeParse(body);
    if (!b.success) throw problem(400, "Check the defaults", b.error.issues[0]?.message ?? REASON);
    const set = anySet(b.data);
    // AGENTS rule 4 (P-170): a value set carries its official words; clearing every value needs none (and keeps none).
    if (set && (!b.data.source_quote || !b.data.source_file)) throw problem(400, "Cite the official source", "Each value set needs the official words it comes from: give source_quote (the page's words) and source_file (the page or file). Nothing was proposed.", { code: "DEFAULTS_UNCITED" });
    const after: TypeDefaults = { translation_rule: b.data.translation_rule, notarisation_rule: b.data.notarisation_rule, has_expiry: b.data.has_expiry, max_age_days: b.data.max_age_days, source_quote: set ? b.data.source_quote! : null, source_file: set ? b.data.source_file! : null };
    const workspaceId = await this.ws.id();
    const { rows, current } = await typeOf(this.db, workspaceId, key);
    if (rows.length) await refuseRetired(this.db, workspaceId, "document_type", [key]);
    if (!current) throw problem(404, "Not in the library", "That document type is not in the shared library (it may have been deleted or reset).");
    const before = defaultsOf(current);
    if (same(before, after)) throw problem(409, "Nothing changes", `"${current.name}" already has exactly these defaults in the library.`);
    const uses = await this.uses(workspaceId, key);
    const c = await this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext($1))`, lockKey(workspaceId, key));
      const open = await openDefaultsChange(tx, workspaceId, key);
      if (open) throw problem(409, "Already waiting", open.status === "APPROVED" ? `A change of "${current.name}"'s defaults is approved and waits for the next release. To change it again first, its proposer withdraws it (the defaults go back to what they were).` : `A change of "${current.name}"'s defaults already waits on To review.`);
      return tx.libraryChange.create({ data: { workspaceId, kind: DEFAULTS_KIND, key, label: `${current.name} · ${defaultsWords(after)}, for every combination`.slice(0, 300), action: DEFAULTS_ACTION, reason: b.data.reason, status: "WAITING", proposedBy: actor.id,
        matches: { document: current.name, before, after, uses } as unknown as Prisma.InputJsonValue } });
    });
    await this.audit.log(workspaceId, actor.id, "proposed", "document type", key, `${actor.name} proposed "${current.name}"'s defaults: ${defaultsWords(after)} (was ${defaultsWords(before)}; used by ${uses}); waits for a second person. Why: ${b.data.reason}`.slice(0, 600));
    return { id: c.id, status: c.status, label: c.label, change: defaultsView(c) };
  }
}

/** What the second person compares on To review: before → after in words, the official words and the reason. */
export function defaultsView(c: Pick<LibraryChange, "matches" | "reason">) {
  const m = (c.matches ?? {}) as { document?: string; before?: TypeDefaults; after?: TypeDefaults; uses?: number };
  const none: TypeDefaults = { translation_rule: null, notarisation_rule: null, has_expiry: null, max_age_days: null, source_quote: null, source_file: null };
  const before = m.before ?? none, after = m.after ?? none;
  return { document: m.document ?? "", before: defaultsWords(before), after: defaultsWords(after), values: after, quote: after.source_quote, source: after.source_file, uses: m.uses ?? 0, reason: c.reason ?? "" };
}
/** The one line To review and History read. */
export function defaultsChangeWords(v: ReturnType<typeof defaultsView>) {
  return `${v.document}'s defaults, for every combination: ${v.before} → ${v.after} (used by ${v.uses} combination${v.uses === 1 ? "" : "s"}; goes out with each one's next release).${v.quote ? ` Official words (${v.source}): "${v.quote}"` : ""} Reason: ${v.reason}`;
}

/** At approval (lifecycle afterApprove): the type gets a draft version with the defaults, checked again first. */
export async function applyDefaults(db: Db, audit: Audit, actor: Actor, seen: LibraryChange) {
  const c = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext($1))`, lockKey(seen.workspaceId, seen.key));
    const c = await tx.libraryChange.findUnique({ where: { id: seen.id } });
    if (c?.status !== "APPROVED") return null;
    const m = c.matches as { before?: TypeDefaults; after?: TypeDefaults };
    await lockItem(tx, c.workspaceId, "document_type", [c.key]);
    const { rows, current } = await typeOf(tx, c.workspaceId, c.key);
    if (!current || !m.after) throw problem(409, "Not in the library", "The document type is no longer in the library, so nothing was changed. Return the change.");
    await refuseRetired(tx, c.workspaceId, "document_type", [c.key]);
    if (anySet(m.after) && (!m.after.source_quote || !m.after.source_file)) throw problem(409, "Cite the official source", "This change carries a value without its official words, so nothing was changed. Return it; the author proposes it again with the citation.");
    if (!m.before || !same(defaultsOf(current), m.before)) throw problem(409, "Changed since", "This document type's defaults changed after it was proposed, so nothing was changed. Return it; the author proposes it again.");
    await revise(tx.documentType, rows, columns(m.after), actor.id, copyType);
    return c;
  }, { timeout: 30_000, maxWait: 10_000 });
  if (!c) throw problem(409, "Changed meanwhile", "This change was withdrawn at the same moment, so nothing was applied. Refresh to see it.");
  await audit.log(c.workspaceId, actor.id, "approved", "document type", c.key, `${actor.name} approved: ${c.label ?? c.key}. Every combination that names it has the defaults in its draft now; they go out with each one's next release.`.slice(0, 600));
}

/** An approved change no release has carried yet is withdrawn by its proposer: the type's draft goes back to the defaults
 *  it had (refused when the draft changed since). Called by withdrawChange (library-changes.ts) in its transaction. */
export async function withdrawApprovedDefaults(tx: Tx, actor: Actor, c: LibraryChange, why: string) {
  await tx.$executeRawUnsafe(`select pg_advisory_xact_lock(hashtext($1))`, lockKey(c.workspaceId, c.key));
  const now = await tx.libraryChange.findUnique({ where: { id: c.id } });
  if (now?.status !== "APPROVED") throw problem(409, "Already decided", `This change is already ${String(now?.status ?? "gone").toLowerCase()}. Refresh to see it.`);
  const m = c.matches as { before?: TypeDefaults; after?: TypeDefaults };
  const draft = (await tx.documentType.findMany({ where: { workspaceId: c.workspaceId, documentTypeKey: c.key, status: "DRAFT" }, orderBy: { version: "desc" }, take: 1 }))[0];
  if (!draft || !m.after || !m.before || !same(defaultsOf(draft), m.after)) throw problem(409, "Changed since", "This document type's defaults changed after this was approved, so nothing was withdrawn. Refresh to see it.");
  await tx.documentType.update({ where: { id: draft.id }, data: { ...columns(m.before), updatedBy: actor.id } });
  const note = `${c.decisionNote ? `Approved: ${c.decisionNote.replace(/\.$/, "")}. ` : ""}Withdrawn by ${actor.name}: ${why}`.slice(0, 300);
  const done = await tx.libraryChange.updateMany({ where: { id: c.id, status: "APPROVED" }, data: { status: "WITHDRAWN", decisionNote: note } });
  if (!done.count) throw problem(409, "Already decided", "Someone released or withdrew this at the same moment. Refresh to see it.");
  await new Audit(tx as never).log(c.workspaceId, actor.id, "withdrawn", "document type", c.key, `${actor.name} withdrew the approved change "${c.label ?? c.key}"; its defaults went back to what they were. Why: ${why}`.slice(0, 600), { change: c.id });
}

/** At a release (publishLibraryChanges): an approved change whose type the release published with these defaults is released. */
export async function releaseDefaults(tx: Tx, workspaceId: string, pack: number) {
  const out: { kind: string; key: string; label: string; action: string }[] = [];
  for (const c of await tx.libraryChange.findMany({ where: { workspaceId, kind: DEFAULTS_KIND, status: "APPROVED" } })) {
    if (await tx.documentType.count({ where: { workspaceId, documentTypeKey: c.key, status: "DRAFT" } })) continue;
    const pub = (await tx.documentType.findMany({ where: { workspaceId, documentTypeKey: c.key, status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 }))[0];
    const after = (c.matches as { after?: TypeDefaults }).after;
    if (!pub || !after || !same(defaultsOf(pub), after)) continue;
    await tx.libraryChange.update({ where: { id: c.id }, data: { status: "RELEASED", releasedIn: pack } });
    out.push({ kind: c.kind, key: c.key, label: c.label ?? c.key, action: c.action });
  }
  return out;
}

@Controller("api/library/document-types")
export class DocumentTypeDefaultsController {
  constructor(@Inject(DocumentTypeDefaults) private readonly s: DocumentTypeDefaults) {}
  @Get(":key/defaults") view(@Headers("x-actor") a: H, @Param("key") key: string) { readerOf(a); return this.s.view(key); }
  @Post(":key/defaults") propose(@Headers("x-actor") a: H, @Param("key") key: string, @Body() b: unknown) { return this.s.propose(actorOf(a), key, b); }
}
