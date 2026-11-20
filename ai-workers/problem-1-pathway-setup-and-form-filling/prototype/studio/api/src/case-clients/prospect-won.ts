// FO-8 (map row 72; brief design/build-lead-c-briefs/FO-8.md; P-560; case-side contract v0.1 §4, §5; front-office
// contracts §2.6): the case side takes `prospect.won`.
//   * onProspectWon: one won prospect makes one client (a person, or a company with its contact person), in one
//     transaction: the client row, one audit line, then `client.created` last. Idempotent on the prospect id: a second
//     delivery finds the client and writes nothing (the database's unique key on the prospect id backs it).
//   * catchUpProspectsWon: every `prospect.won` in the outbox with no client yet; one that fails is named and the rest
//     still run. There is no general dispatcher (the FO-1a pattern, front-office/firm-seed.ts).
//   * The "Open a case?" offer is not a table: it is the client made here while it has no case, pre-filled from the
//     newest `prospect.won` of its prospect (the outbox row is kept) and withdrawn while a later `prospect.unconverted`
//     stands. openCaseFromOffer opens it through Runtime.createCase, on a staff member's call only; payment is no condition.
// The representative is read from the signed retainer version's merge values (written once, never changed), never from
// the retainer row or the payload's copy of it (Lead B rev 16.13, FO-5f question 1).
//   Run the catch-up: tsx api/src/case-clients/prospect-won.ts
import { Prisma, type PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import type { AuditPort } from "../../../ports/audit.ts";
import { CaseOpenedPayload, ClientCreatedPayload, EVENT, ProspectWonPayload } from "../../../ports/events.ts";
import type { FoPersonPort } from "../../../ports/fo-person.ts";

type Tx = Prisma.TransactionClient;
type Reader = Pick<Tx, "caseClient" | "moduleEvent" | "case" | "foRetainerVersion" | "platformStaff" | "configRelease">;
export const PROSPECT_WON_ACTOR = "system:prospect.won";
/** The merge value that names a version's representative by id (front-office/retainers/service.ts REPRESENTATIVE_ID). */
const REPRESENTATIVE_ID = "representative.staff_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const code = (n: number) => `CL-${String(n).padStart(5, "0")}`;   // clients.ts clientCode (not imported: that file loads the API's core)

export type ProspectWonDeps = { workspaceId: string; foPerson: FoPersonPort<Tx>; audit: AuditPort<Tx> };
export type WonEvent = { type: string; firmId: string; payload?: unknown };
export type WonResult = { prospectId: string; clientId: string; clientNumber: string; made: boolean };

const NOT_SERVED = new Set(["DELETED", "ABANDONED"]);
/** A name cut to `max` whole characters as a person reads them (a letter keeps its accent, an emoji stays whole), counted
 *  in code points (the database's and the person port's count) or, with `units`, in UTF-16 units (the opening's count). */
function cut(v: string, max: number, units = false): string {
  let out = "", n = 0;
  for (const { segment } of new Intl.Segmenter().segment(v.trim())) {
    n += units ? segment.length : [...segment].length;
    if (n > max) break;
    out += segment;
  }
  return out.trim();
}
const kindOf = (p: ProspectWonPayload) => (p.subject.subject === "PERSON" ? "PERSON" : "COMPANY");
const WON_OR_UNDONE = [EVENT.PROSPECT_WON, EVENT.PROSPECT_UNCONVERTED];

/** The client's subject as the event names it: the front office's person or company (through its port), the name, and
 *  for a company its contact person, linked by id and never copied (A44; AG-2-77 rule 7): the primary contact first. */
async function subjectOf(tx: Tx, deps: ProspectWonDeps, firmId: string, p: ProspectWonPayload) {
  const base = { firmId, actor: PROSPECT_WON_ACTOR, prospectId: p.prospect_id };
  if (p.subject.subject === "PERSON") {
    const displayName = cut([p.answers["person.given_names"], p.answers["person.family_name"]].map((x) => x?.trim()).filter(Boolean).join(" "), 200);
    if (!displayName) throw new Error(`prospect.won: prospect ${p.prospect_id} names no person`);
    return { displayName, displayKind: "PERSON", foPersonId: (await deps.foPerson.ensureForClient(tx, { ...base, displayName })).foPersonId, foCompanyId: null, contact: Prisma.DbNull };
  }
  const displayName = cut(p.subject.company.name, 200), c = p.subject.contacts.find((x) => x.primaryContact) ?? p.subject.contacts[0];
  return { displayName, displayKind: "COMPANY", foPersonId: null, foCompanyId: (await deps.foPerson.ensureCompanyForClient(tx, { ...base, name: displayName })).foCompanyId, contact: { contactPersonId: c.personId, roles: c.roles } };
}

async function makeClient(tx: Tx, deps: ProspectWonDeps, firmId: string, delivered: ProspectWonPayload): Promise<WonResult | null> {
  const firm = await tx.platformFirm.findUnique({ where: { id: firmId }, select: { key: true, status: true } });
  // The outbox row's firm decides: a payload that names another firm, or a key that is not this firm's, makes nothing.
  const ofFirm = (p: ProspectWonPayload) => {
    if (p.firm_id.toLowerCase() !== firmId.toLowerCase()) throw new Error(`prospect.won: the payload names firm ${p.firm_id}, the event is firm ${firmId}'s`);
    if (!firm || firm.key !== p.firm_key) throw new Error(`prospect.won: "${p.firm_key}" is not the key of firm ${firmId}`);
  };
  ofFirm(delivered);
  if (NOT_SERVED.has(firm!.status)) return null;   // a deleted or abandoned firm gets no new client
  // One delivery at a time per prospect: a second waits here, then finds the first's client.
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`prospect-won:${delivered.prospect_id}`}))`;
  // The delivery is only a signal: what is made comes from the outbox's own newest row for this prospect (insert-only,
  // so never a forged or stale copy), and only while that row is a `prospect.won` (an Undo convert since then: nothing).
  const last = await tx.moduleEvent.findFirst({ where: { firmId, subjectId: delivered.prospect_id, type: { in: WON_OR_UNDONE } }, orderBy: { seq: "desc" } });
  if (last?.type !== EVENT.PROSPECT_WON) return null;
  const p = ProspectWonPayload.parse(last.payload);
  ofFirm(p);
  const where = { workspaceId: deps.workspaceId, firmKey: p.firm_key, prospectId: p.prospect_id };
  const held = await tx.caseClient.findFirst({ where });
  if (held) {
    // Won again as the other type (Undo convert, Change type, Convert): a client with no case yet follows the prospect.
    // The firm's opening lock first (createCase holds it to its commit): no case can be opened on the client meanwhile.
    const kind = kindOf(p);
    if (held.displayKind !== kind) await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`case-open:${p.firm_key}`}))`;
    if (held.displayKind !== kind && !(await tx.case.count({ where: { clientId: held.id } }))) {
      const { displayName, displayKind, foPersonId, foCompanyId, contact } = await subjectOf(tx, deps, firmId, p);
      await tx.caseClient.update({ where: { id: held.id }, data: { displayName, displayKind, foPersonId, foCompanyId, contact } });
      await deps.audit.record(tx, { firmId, actor: PROSPECT_WON_ACTOR, action: "client.subject_changed", entity: "fo_prospect", entityKey: p.prospect_id,
        summary: `The prospect was won again as ${kind === "PERSON" ? "a person" : "a company"}; client ${code(held.clientNumber)} follows it.`, detail: { clientId: held.id, prospectId: p.prospect_id, kind },
        before: { displayName: held.displayName, displayKind: held.displayKind, foPersonId: held.foPersonId, foCompanyId: held.foCompanyId }, after: { displayName, displayKind, foPersonId, foCompanyId } });
    }
    return { prospectId: p.prospect_id, clientId: held.id, clientNumber: code(held.clientNumber), made: false };
  }
  const subject = await subjectOf(tx, deps, firmId, p);
  const [{ n }] = await tx.$queryRaw<{ n: number }[]>`select case_client_next_number(${deps.workspaceId}::uuid, ${p.firm_key}) as n`;
  const client = await tx.caseClient.create({ data: { ...where, firmId, clientNumber: Number(n), ...subject, fileOwner: p.owner_staff_id, createdBy: PROSPECT_WON_ACTOR } });
  const clientNumber = code(client.clientNumber);
  // The line sits on the prospect (the audit port takes area entities only until AUD-1 moves the case side onto it).
  await deps.audit.record(tx, { firmId, actor: PROSPECT_WON_ACTOR, action: EVENT.CLIENT_CREATED, entity: "fo_prospect", entityKey: p.prospect_id,
    summary: `The won prospect became client ${clientNumber}; "Open a case?" is offered.`, detail: { clientId: client.id, clientNumber, prospectId: p.prospect_id, kind: client.displayKind, wonVia: p.won_via },
    before: null, after: { clientNumber, displayName: client.displayName, displayKind: client.displayKind, foPersonId: client.foPersonId, foCompanyId: client.foCompanyId, fileOwner: client.fileOwner } });
  await tx.moduleEvent.create({ data: { firmId, type: EVENT.CLIENT_CREATED, subjectId: client.id, payload: ClientCreatedPayload.parse({ firm_id: firmId, prospect_id: p.prospect_id, client_id: client.id, client_number: clientNumber }) } });
  return { prospectId: p.prospect_id, clientId: client.id, clientNumber, made: true };
}

/** The subscriber: a `prospect.won` event (module_event's envelope) makes that prospect's client, once. Any other event
 *  type is ignored (null), as is a won event that no longer stands (undone since) or a firm no longer served. At least
 *  once is safe: a repeat changes nothing. */
export async function onProspectWon(db: PrismaClient, event: WonEvent, deps: ProspectWonDeps): Promise<WonResult | null> {
  if (event.type !== EVENT.PROSPECT_WON) return null;
  const p = ProspectWonPayload.parse(event.payload);
  return db.$transaction((tx) => makeClient(tx, deps, event.firmId, p), { timeout: 15_000, maxWait: 10_000 });
}

export type WonCatchUp = { results: WonResult[]; failed: { prospectId: string; firmId: string; error: string }[] };

/** Catch-up over the outbox: every prospect with a `prospect.won` and no client (or a client with no case that no longer matches who was won), whose Convert still stands and whose
 *  firm is still served, so a missed or failed delivery is made good by the next run. One prospect that fails is named and the others still run. */
export async function catchUpProspectsWon(db: PrismaClient, deps: ProspectWonDeps,
  /** CS-K1 part 2: how each prospect runs (the app's poller: as its own firm, withFirm); a suite or the tool runs it as is.
   *  It may answer null: the prospect is not tried this run (the poller's backoff after a failure, PF-12b). */
  each: <T>(firmId: string, fn: () => Promise<T>, prospectId: string) => Promise<T | null> = (_f, fn) => fn()): Promise<WonCatchUp> {
  const rows = await db.$queryRaw<{ firm_id: string; prospect_id: string; payload: unknown }[]>`
    select distinct on (e.firm_id, e.subject_id) e.firm_id::text as firm_id, e.subject_id as prospect_id, e.payload
      from module_event e join platform_firm f on f.id = e.firm_id
     where e.type = ${EVENT.PROSPECT_WON} and f.status::text not in ('DELETED', 'ABANDONED')
       and not exists (select 1 from module_event u where u.firm_id = e.firm_id and u.subject_id = e.subject_id and u.type = ${EVENT.PROSPECT_UNCONVERTED} and u.seq > e.seq)
       and not exists (select 1 from module_event n where n.firm_id = e.firm_id and n.subject_id = e.subject_id and n.type = ${EVENT.PROSPECT_WON} and n.seq > e.seq)
       and not exists (select 1 from case_client c where c.firm_id = e.firm_id and c.workspace_id = ${deps.workspaceId}::uuid and c.prospect_id::text = e.subject_id
             -- a client with no case whose kind is no longer the won subject's is taken again: it follows the prospect
             and (c.display_kind = case when e.payload->'subject'->>'subject' = 'PERSON' then 'PERSON' else 'COMPANY' end or exists (select 1 from runtime_case r where r.client_id = c.id)))
     order by e.firm_id, e.subject_id, e.seq desc`;
  const out: WonCatchUp = { results: [], failed: [] };
  for (const r of rows) {
    try { const made = await each(r.firm_id, () => onProspectWon(db, { type: EVENT.PROSPECT_WON, firmId: r.firm_id, payload: r.payload }, deps), r.prospect_id); if (made) out.results.push(made); }   // made null: not tried this run (PF-12b backoff)
    catch (e) { out.failed.push({ prospectId: r.prospect_id, firmId: r.firm_id, error: String(e).slice(0, 300) }); }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ "Open a case?"
export type Offer = { clientId: string; prospectId: string; displayName: string; state: "OPEN" | "USED" | "WITHDRAWN" | "CHANGED"; combinationId: string | null; representativeActorId: string | null;
  /** CS-K1s: how the prospect was won (the newest prospect.won's won_via; null while withdrawn). */
  wonVia: ProspectWonPayload["won_via"] | null };

/** The principal applicant's name the offer pre-fills: the client's name within the opening's limits (2 to 120 UTF-16
 *  units); null when it falls outside them (the opening then asks for one). One rule for the read and the opening. */
export const principalNameOf = (displayName: string) => { const name = cut(displayName, 120, true); return name.length >= 2 ? name : null; };

/** The offer of a client made from a won prospect (null: the client came from no prospect). Read where it is used, so
 *  it is always the prospect's newest state: USED once the client has a case, WITHDRAWN while the Convert stands undone,
 *  CHANGED while the prospect was won again as the other type and the client has not followed it yet. */
export async function offerOf(q: Reader, client: { id: string; firmId: string | null; prospectId: string | null; displayName: string; displayKind: string }, exceptCase?: string): Promise<Offer | null> {
  if (!client.prospectId || !client.firmId) return null;
  const firmId = client.firmId;
  const last = await q.moduleEvent.findFirst({ where: { firmId, subjectId: client.prospectId, type: { in: WON_OR_UNDONE } }, orderBy: { seq: "desc" } });
  const won = last?.type === EVENT.PROSPECT_WON ? ProspectWonPayload.safeParse(last.payload) : null;
  const used = await q.case.count({ where: { clientId: client.id, ...(exceptCase ? { id: { not: exceptCase } } : {}) } });
  // The representative: the signed version's own merge values (the paper copy's, else the sent version that was signed).
  let representativeActorId: string | null = null;
  if (won?.success && won.data.retainer_id) {
    const versions = await q.foRetainerVersion.findMany({ where: { firmId, retainerId: won.data.retainer_id }, orderBy: { n: "desc" }, select: { mergeValues: true, endReason: true, endedAt: true, sentAt: true } });
    const signed = versions.find((v) => v.endReason === "SIGNED_OFFLINE") ?? versions.find((v) => v.sentAt && !v.endedAt);
    const staffId = (signed?.mergeValues as Record<string, unknown> | undefined)?.[REPRESENTATIVE_ID];
    if (typeof staffId === "string" && UUID.test(staffId)) representativeActorId = (await q.platformStaff.findFirst({ where: { firmId, id: staffId }, select: { actorId: true } }))?.actorId ?? null;
  }
  // The combination the lead was interested in, only while it can open a case (released, not retired: contracts §2.6).
  const wanted = won?.success ? won.data.interested_in?.combinationId ?? null : null;
  const combinationId = wanted && (await q.configRelease.findFirst({ where: { combinationId: wanted, combination: { retiredAt: null } }, select: { id: true } })) ? wanted : null;
  return { clientId: client.id, prospectId: client.prospectId, displayName: client.displayName, state: used ? "USED" : !won?.success ? "WITHDRAWN" : kindOf(won.data) !== client.displayKind ? "CHANGED" : "OPEN", combinationId, representativeActorId, wonVia: won?.success ? won.data.won_via : null };
}

export const OFFER_REFUSED = {
  NO_OFFER: "This client did not come from a won prospect, so there is no \"Open a case?\" offer for it. Open a case for the client instead.",
  USED: "A case was already opened from this offer. Open another case for the client instead.",
  WITHDRAWN: "The Convert to client was undone, so there is no case to open from it. Convert the prospect again first.",
  CHANGED: "This prospect was won again as another type and its client has not been updated yet. It updates by itself within a few seconds; try again then. Nothing was opened.",
} as const;

/** What the opening needs from the API (runtime.ts gives its own): the session's client lookup, the case opening with
 *  a step inside its transaction, and how to refuse. */
export type OpenDoor<A> = {
  db: Reader & Pick<Tx, "platformFirm">; workspaceId: string;
  actorOf(actorId: string | null): A | null;
  createCase(actor: A, body: unknown, inTx: (tx: Tx, opened: { id: string; caseNumber: string; combinationId: string }) => Promise<void>): Promise<unknown>;
  clientTypeOf(tx: Tx, combinationId: string): Promise<"INDIVIDUAL" | "CORPORATE">;
  audit: AuditPort<Tx>;
  problem(status: number, title: string, detail: string, extra?: Record<string, unknown>): never;
};

/** POST /api/runtime/clients/:id/open-case: the staff member's click. The offer's values pre-fill the opening (the body
 *  may choose otherwise, and gives what the offer cannot: the client login, the case officers); the case opens through
 *  Runtime.createCase with the client given, and `case.opened` and its audit line are written in that transaction. The
 *  offer is checked again inside it (openings of a firm run one at a time), so two clicks at once open one case. */
export async function openCaseFromOffer<A>(door: OpenDoor<A>, ctx: { staffId: string; firmId: string; firmKey: string }, id: string, body: unknown) {
  const notFound = (): never => door.problem(404, "Not found", "No such client.", { code: "NOT_FOUND" });
  const refuse = (o: Offer | null) => { const why = !o ? "NO_OFFER" : o.state === "OPEN" ? null : o.state; if (why) door.problem(409, "Not possible now", OFFER_REFUSED[why], { code: `OFFER_${why}` }); return o!; };
  if (typeof id !== "string" || !UUID.test(id)) return notFound();
  const firm = await door.db.platformFirm.findUnique({ where: { key: ctx.firmKey }, select: { id: true } }).catch(() => null);
  if (!firm || firm.id !== ctx.firmId) return notFound();
  const find = (q: Reader) => q.caseClient.findFirst({ where: { id, workspaceId: door.workspaceId, firmKey: ctx.firmKey } });
  const client = (await find(door.db)) ?? notFound();
  const offer = refuse(await offerOf(door.db, client));
  const staff = await door.db.platformStaff.findFirst({ where: { firmId: ctx.firmId, id: ctx.staffId }, select: { actorId: true } });
  const actor = door.actorOf(staff?.actorId ?? null) ?? door.problem(409, "Not possible now", "Your sign-in is not linked to a case user yet, so a case cannot be opened from here.", { code: "NO_CASE_USER" });
  const b = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const { clientId: _c, idempotencyKey: _k, ...given } = b;
  const name = principalNameOf(client.displayName);   // the opening's own limits (2 to 120): a name outside them is asked for
  const request = { ...given, clientId: client.id, combinationId: given.combinationId ?? offer.combinationId ?? undefined,
    principal: given.principal ?? (name ? { displayName: name } : undefined), representative: given.representative ?? offer.representativeActorId ?? undefined };
  return door.createCase(actor, request, async (tx, opened) => {
    const now = (await find(tx)) ?? notFound();
    // The client followed its prospect while this call waited: what was pre-filled is no longer the client's.
    refuse(now.displayKind !== client.displayKind || now.displayName !== client.displayName ? { ...offer, state: "CHANGED" } : await offerOf(tx, now, opened.id));
    const clientType = await door.clientTypeOf(tx, opened.combinationId);
    await door.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: EVENT.CASE_OPENED, entity: "fo_prospect", entityKey: offer.prospectId, caseId: opened.id,
      summary: `A case was opened from the "Open a case?" offer.`, detail: { clientId: client.id, caseId: opened.id, caseNumber: opened.caseNumber, prospectId: offer.prospectId },
      before: null, after: { caseId: opened.id, caseNumber: opened.caseNumber, clientId: client.id, combinationId: opened.combinationId ?? null } });
    await tx.moduleEvent.create({ data: { firmId: ctx.firmId, type: EVENT.CASE_OPENED, subjectId: opened.id,
      payload: CaseOpenedPayload.parse({ firm_id: ctx.firmId, prospect_id: offer.prospectId, client_id: client.id, case_id: opened.id, case_number: opened.caseNumber, client_type: clientType }) } });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { auditEvent } = await import("../platform/audit/audit-event.ts");
  const { foPersonPort } = await import("../front-office/people/fo-person-port.ts");
  const url = process.env.DATABASE_URL ?? "postgresql://xr_studio@127.0.0.1:54329/xr_studio_demo";   // as core.ts DATABASE_URL
  const key = process.env.STUDIO_WORKSPACE_KEY?.trim() || "demo";                                     // as core.ts WORKSPACE_KEY
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }) });
  try {
    const ws = await db.workspace.findUnique({ where: { key }, select: { id: true } });
    if (!ws) throw new Error(`no workspace "${key}" yet: start the app once first`);
    const r = await catchUpProspectsWon(db, { workspaceId: ws.id, foPerson: foPersonPort, audit: auditEvent });
    console.log(JSON.stringify(r));
    if (r.failed.length) process.exitCode = 1;
  } catch (e) {
    console.log(JSON.stringify({ error: String(e).slice(0, 1000) }));   // never an unhandled rejection: JSON on stdout, exit code 1
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
