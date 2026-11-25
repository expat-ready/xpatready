// CS-K1 part 1 (map row 72; brief design/build-lead-c-briefs/CS-K1.md; contract v0.1 §5, P-588 (2), AG-7-75 §7): the
// case side's client record. One helper makes a client inside the caller's transaction (the opening's, runtime.ts
// createCase); one finds a client of a firm; the read service answers the two routes (features/clients.ts) behind PF-4's
// guard. A client is the firm's own: its firm key is the staff session's (or the opener's), and another firm's client is
// 404, never 403 (BR-20). The database keeps the rest: the number from case_client_counter, the text and kind checks, the
// firm id (CS-W1's fill) and the firm-matched keys from runtime_case (migration 20261118230000_csk1_case_client).
// No front-office code is read or written here (contract §1 rule 4): part 2 links a client to its front-office party
// only through FoPersonPort (linkClient), in the caller's transaction.
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Db, Workspace } from "./core.ts";
import { problem, type StaffContext } from "./platform/identity/keys.ts";
import { ClientListQuery, ClientOfferView, INVISIBLE } from "../../contracts/runtime.ts";
import { OFFER_REFUSED, offerOf, principalNameOf } from "./case-clients/prospect-won.ts"; // CS-K1s
import { FoPersonInvalidInput, hasWord, type FoPersonPort } from "../../ports/fo-person.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAGE = 50;
const INVISIBLE_G = new RegExp(INVISIBLE.source, "g");

/** "Client code" (AG-7-75 §7): CL- and the firm's running number, five digits (CL-00001); more past 99999. */
export const clientCode = (n: number) => `CL-${String(n).padStart(5, "0")}`;
export type ClientLine = { id: string; number: string; display_name: string; display_kind: "PERSON" | "COMPANY" };
const line = (c: { id: string; clientNumber: number; displayName: string; displayKind: string }): ClientLine =>
  ({ id: c.id, number: clientCode(c.clientNumber), display_name: c.displayName, display_kind: c.displayKind as ClientLine["display_kind"] });

// The front office's text rule (ports/fo-person.ts) refuses control, format and filler characters a case name may hold
// (breaker F1: a Persian name's U+200C, a soft hyphen, an emoji's joiner): its copy of the name drops them, and a name
// with no letter or digit left ("!!") is named by the client code.
const NOT_KEPT = /[\p{Cc}\p{Cf}\u034f\u115f\u1160\u3164\uffa0]/gu;
const partyName = (name: string, number: number) => { const v = name.normalize("NFC").replace(NOT_KEPT, "").replace(/\s+/gu, " ").trim(); return hasWord(v) ? [...v].slice(0, 200).join("") : `Client ${clientCode(number)}`; };

/** CS-K1 part 2: the front office's party for a client of `firmId`, through the port in the caller's transaction: a
 *  PERSON client a new fo_person, a COMPANY client a new fo_company (never a contact person). */
async function partyFor(tx: Tx, foPerson: FoPersonPort<Tx>, c: { firmId: string; displayName: string; displayKind: string; clientNumber: number }, actor: string) {
  const base = { firmId: c.firmId, actor };
  const ask = async (name: string) => c.displayKind === "COMPANY" ? { foCompanyId: (await foPerson.ensureCompanyForClient(tx, { ...base, name })).foCompanyId }
    : { foPersonId: (await foPerson.ensureForClient(tx, { ...base, displayName: name })).foPersonId };
  // Review m8: a name the port's text rule still refuses (an unassigned mark, combining marks only) is named by the client
  // code. The port refuses before it writes anything, so the transaction carries on.
  try { return await ask(partyName(c.displayName, c.clientNumber)); }
  catch (e) { if (e instanceof FoPersonInvalidInput) return ask(`Client ${clientCode(c.clientNumber)}`); throw e; }
}

/** A new client of a firm, inside the caller's transaction: the firm's next number (a rolled-back caller gives it back),
 *  COMPANY when the combination's Pathway is CORPORATE, else PERSON. The name is the principal's display name. CS-K1
 *  part 2: born linked to its front-office party (the firm is the key's platform firm, CS-W1's lookup; none yet: none). */
export async function newClient(tx: Tx, a: { workspaceId: string; firmKey: string; combinationId: string; displayName: string; createdBy: string }, foPerson: FoPersonPort<Tx>, actor: string) {
  const [{ n, kind, firm }] = await tx.$queryRaw<{ n: number; kind: string; firm: string | null }[]>`
    select case_client_next_number(${a.workspaceId}::uuid, ${a.firmKey}) as n, case_client_kind_of(${a.combinationId}::uuid) as kind, case_lookup.case_firm_id_of_key(${a.firmKey})::text as firm`;
  const displayName = a.displayName.trim().slice(0, 200), clientNumber = Number(n);
  const ids = firm ? await partyFor(tx, foPerson, { firmId: firm, displayName, displayKind: kind, clientNumber }, actor) : {};
  return tx.caseClient.create({ data: { workspaceId: a.workspaceId, firmKey: a.firmKey, clientNumber, displayName, displayKind: kind, createdBy: a.createdBy, ...ids } });
}

type Linkable = { id: string; firmId: string | null; displayName: string; displayKind: string; clientNumber: number; foPersonId: string | null; foCompanyId: string | null };
/** CS-K1 part 2 (P-607): links a client to the front office's party through the port, in the caller's transaction: a
 *  PERSON client to a new fo_person, a COMPANY client to a new fo_company (never a contact person). The firm is the
 *  client's own firm_id (CS-W1), never one from a request; a client with no platform firm yet is left as it is. The link
 *  is written only while both ids are empty (a second caller writes nothing and its port call rolls back with it). */
export async function linkClient(tx: Tx, foPerson: FoPersonPort<Tx>, c: Linkable, actor: string): Promise<boolean> {
  if (!c.firmId || c.foPersonId || c.foCompanyId) return false;
  const data = await partyFor(tx, foPerson, { ...c, firmId: c.firmId }, actor);
  const n = await tx.caseClient.updateMany({ where: { id: c.id, firmId: c.firmId, foPersonId: null, foCompanyId: null }, data: { ...data, foLinkPending: false } });
  if (!n.count) throw new Error(`linkClient: client ${c.id} was linked meanwhile`);   // rolls the port's new party back with the caller
  return true;
}

/** A client of this firm in this workspace, or null (an id of another firm, or not an id at all, is null alike). */
export async function clientOfFirm(q: Pick<Tx, "caseClient">, a: { workspaceId: string; firmKey: string; id: unknown }) {
  if (typeof a.id !== "string" || !UUID.test(a.id)) return null;
  return q.caseClient.findFirst({ where: { id: a.id, workspaceId: a.workspaceId, firmKey: a.firmKey } });
}

/** The client line a case read shows (runtime.ts get). */
export async function clientLineOf(q: Pick<Tx, "caseClient">, clientId: string): Promise<ClientLine | null> {
  const c = await q.caseClient.findUnique({ where: { id: clientId } });
  return c ? line(c) : null;
}

const notFound = (): never => problem(404, "Not found", "No such client.", { code: "NOT_FOUND" });

@Injectable()
export class Clients {
  constructor(@Inject(Db) private readonly db: Db, @Inject(Workspace) private readonly ws: Workspace) {}

  /** The session's firm key, only while it names the session's platform firm (as case-close.ts locked()). */
  private async firm(ctx: StaffContext) {
    const f = await this.db.platformFirm.findUnique({ where: { key: ctx.firmKey }, select: { id: true } }).catch(() => null);
    return f && f.id === ctx.firmId ? ctx.firmKey : null;
  }

  /** GET /api/runtime/clients?query=&page=: the firm's clients by name or client code, 50 a page, newest number first. */
  async list(ctx: StaffContext, input: unknown) {
    // CS-V1 (STANDARDS §6): the query is read through its schema (contracts/runtime.ts ClientListQuery).
    // R1.10 A5 (W5): an unknown query key is refused 400 and named (the contract's object, read strict here).
    const r = ClientListQuery.strict().safeParse(input ?? {});
    if (!r.success && r.error.issues[0]?.code === "unrecognized_keys") { const k = String((r.error.issues[0] as { keys: string[] }).keys[0]).slice(0, 64); return problem(400, "Check the details", `${k} is not a field of the client search.`, { code: "INVALID", fields: { [k]: "This field is not allowed here." } }); }
    if (!r.success) { const i = r.error.issues[0], field = String(i.path[0] ?? "query"); return problem(400, "Check the details", i.message, { code: "INVALID", fields: { [field]: i.message } }); }
    const { query, page } = r.data;
    const firmKey = await this.firm(ctx);
    const p = Math.max(1, Math.min(10_000, Number.parseInt(page ?? "1", 10) || 1));
    if (!firmKey) return { clients: [], page: p, page_size: PAGE, total: 0 };
    // Review m3, breaker 7a/7b: control and invisible characters dropped (a NUL was a 500), LIKE's wildcards and escape
    // taken literally (a "%" matched every client of the firm).
    const q = typeof query === "string" ? query.replace(INVISIBLE_G, "").replace(/[\t\n\r]/g, " ").trim().slice(0, 200) : "";
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const code = /^(?:cl-?)?0*(\d{1,9})$/i.exec(q);
    const where: Prisma.CaseClientWhereInput = { workspaceId: await this.ws.id(), firmKey,
      ...(q ? { OR: [{ displayName: { contains: like, mode: "insensitive" } }, ...(code ? [{ clientNumber: Number(code[1]) }] : [])] } : {}) };
    const [rows, total] = await Promise.all([
      // CS-K1s: each client's number of cases (the list's "Cases" column), counted in the client's own firm.
      this.db.caseClient.findMany({ where, orderBy: [{ clientNumber: "desc" }], skip: (p - 1) * PAGE, take: PAGE, include: { _count: { select: { cases: { where: { firmKey } } } } } }),
      this.db.caseClient.count({ where }),
    ]);
    return { clients: rows.map((c) => ({ ...line(c), cases: c._count.cases })), page: p, page_size: PAGE, total };
  }

  /** GET /api/runtime/clients/:id: one client of the firm with its cases' ids and numbers; another firm's is 404. */
  async one(ctx: StaffContext, id: string) {
    const firmKey = await this.firm(ctx);
    if (!firmKey) return notFound();
    const c = await clientOfFirm(this.db, { workspaceId: await this.ws.id(), firmKey, id });
    if (!c) return notFound();
    const cases = await this.db.case.findMany({ where: { clientId: c.id, firmKey }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, caseNumber: true } });
    // CS-K1s: the file owner (FO-8 sets it from the won prospect's owner), a staff member of this firm, by name.
    const owner = c.fileOwner && UUID.test(c.fileOwner) ? await this.db.platformStaff.findFirst({ where: { firmId: ctx.firmId, id: c.fileOwner }, select: { id: true, displayName: true } }) : null;
    // CS-K1s (breaker M1): the signed-in staff member's own case-side person (the identity join's actor_id), so the page
    // opens this client's cases as them (the case pages read the simulated person), never as a person of another firm.
    const me = await this.db.platformStaff.findFirst({ where: { firmId: ctx.firmId, id: ctx.staffId }, select: { actorId: true } });
    // FO-13s part 2 (QA-610, R1.110): the front office's person (null for a company), so the page shows their identity checks.
    return { ...line(c), created_at: c.createdAt, fo_person_id: c.foPersonId ?? null, file_owner: owner ? { staff_id: owner.id, name: owner.displayName } : null, viewer_actor_id: me?.actorId ?? null, cases: cases.map((k) => ({ id: k.id, case_number: k.caseNumber })) };
  }

  /** CS-K1s: GET /api/runtime/clients/:id/offer: the client's "Open a case?" offer, read through FO-8's one rule (offerOf)
   *  with no second one: open, with what the opening would pre-fill, or gone with the opening's own words. Ids and names
   *  only, never the prospect's answers; another firm's client is 404, as the client read. */
  async offer(ctx: StaffContext, id: string): Promise<ClientOfferView> {
    const firmKey = await this.firm(ctx);
    if (!firmKey) return notFound();
    const c = await clientOfFirm(this.db, { workspaceId: await this.ws.id(), firmKey, id });
    if (!c) return notFound();
    const o = await offerOf(this.db, c);
    const gone = !o ? "NO_OFFER" : o.state === "OPEN" ? null : o.state;
    if (gone || !o) return ClientOfferView.parse({ offer: null, reason: gone ?? "NO_OFFER", detail: OFFER_REFUSED[gone ?? "NO_OFFER"] });
    const [combination, rep, prospect] = await Promise.all([
      o.combinationId ? this.db.combination.findUnique({ where: { id: o.combinationId }, select: { id: true, label: true } }) : null,
      o.representativeActorId ? this.db.platformStaff.findFirst({ where: { firmId: ctx.firmId, actorId: o.representativeActorId }, select: { id: true, displayName: true } }) : null,
      this.db.foProspect.findFirst({ where: { id: o.prospectId, firmId: ctx.firmId }, select: { number: true } }),
    ]);
    return ClientOfferView.parse({ offer: {
      combination: combination ? { id: combination.id, label: combination.label } : null,
      principalName: principalNameOf(c.displayName),
      representative: rep ? { staffId: rep.id, name: rep.displayName } : null,
      wonVia: o.wonVia ?? "CONVERTED", prospectNumber: prospect?.number || null,
    } });
  }
}
