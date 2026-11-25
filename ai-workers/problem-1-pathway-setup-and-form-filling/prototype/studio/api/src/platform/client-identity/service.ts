// PF-4p part 1 (R1.62, map row 62; P-584 (4); AG-15-3, AG-15-38, AG16-23; SA-2-35): who a client's token is, and what a
// client reads of their own. The client guard (guard.ts) asks this service who a bearer token is; the rest runs as the
// account's firm under PF-12's wall (the account's firm through the narrow definer lookup platform_client_account_firm).
// A client sees only their own firm and their own records: the cases whose case-side client names their front-office
// person (case_client.fo_person_id), nothing about answers, documents or filings (CaseSummaryPort's shape, contract §3.5).
// Another client's case, a malformed id and a missing one are the same 404, byte for byte.
// Sessions: one column per account (sessions_ended_at); a sign-in starts after the last sign-in and the last ending, so a
// session that started at or before an ending is refused at its next request (sign-out here; suspend, revoke: part 2).
// Configuration: the local stand-in runs when PLATFORM_IDENTITY=local (local.ts); otherwise every client token is refused
// until the client Cognito pool is wired (PF-4b's construct). Two-step is never forced for clients (AG16-23).
import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { Db } from "../../core.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { platformConfig } from "../config/settings.ts";
import { enterFirm, firmScope, notInFirm, withFirm } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS, parseInput, strict } from "../http/input.ts";
import { problem, unauthorized } from "../identity/keys.ts";
import { IdentityRefused, PlatformClock, type IdentityPort } from "../identity/port.ts";
import { IDENTITY_PORT } from "../identity/service.ts";
import { logPort } from "../observability/log.ts";
import { firmAllows } from "./firm-allows.ts";
import { clientActorWord, type ClientContext } from "./keys.ts";
import { CLIENT_LOCAL_TTL_SECONDS, ClientLocalIdentity } from "./local.ts";

type Tx = Prisma.TransactionClient;
export const CLIENT_IDENTITY_PORT = Symbol("ClientIdentityPort");
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ClientLocalSignInBody = strict({ firmKey: z.string().max(100), email: z.string().max(320) });
const UNKNOWN = "No client portal account signs in with that firm and email.";
export const PAUSED = "Your access to the portal is paused. Contact your firm.";
const ENDED = "This portal account is closed. Contact your firm.";
const FIRM_CLOSED = "This firm's portal is closed. Sign-in is no longer possible.";
/** The port this server's configuration names: the stand-in with PLATFORM_IDENTITY=local; otherwise one that refuses every
 *  client token, saying so (the client Cognito pool is not wired yet). */
export function clientIdentityPortFromConfig(clock: PlatformClock): IdentityPort {
  const c = platformConfig().identity;
  if (c.via === "local") return new ClientLocalIdentity(c.localSecret ? c.localSecret.reveal() : null, () => clock.now());
  return { via: "cognito", async verify() { throw new IdentityRefused("Client sign-in is not set up on this server yet.", "SIGN_IN_NOT_SET_UP"); } };
}
/** An account's status as the words a client reads (401 at sign-in and at every request). */
function refuseStatus(status: string): never {
  if (status === "SUSPENDED") return problem(401, "Access paused", PAUSED, { code: "CLIENT_PAUSED" });
  if (status === "REVOKED") return problem(401, "Account closed", ENDED, { code: "CLIENT_REVOKED" });
  return problem(401, "Not active yet", "This portal account is not active yet. Open the invitation your firm sent you.", { code: "CLIENT_NOT_ACTIVE" });
}
/** The email as stored: NFC, lower case, no space of any kind at either end (the database check refuses any inside). */
const EDGE_SPACE = new Set([..." \t\n\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u2028\u2029\u202f\u205f\u3000\ufeff"]);
const normalEmail = (v: string) => { const c = [...v.normalize("NFC")]; let i = 0, j = c.length; while (i < j && EDGE_SPACE.has(c[i])) i++; while (j > i && EDGE_SPACE.has(c[j - 1])) j--; return c.slice(i, j).join("").toLowerCase(); };   // a scan, not a regex (CodeQL: polynomial regex on input)
@Injectable()
export class ClientIdentity {
  constructor(@Inject(Db) private readonly db: Db, @Inject(CLIENT_IDENTITY_PORT) readonly port: IdentityPort, @Inject(PlatformClock) private readonly clock: PlatformClock,
    /** The firm staff's port, when this app serves it: only to prove the two are never one (P-584 (4)). */
    @Optional() @Inject(IDENTITY_PORT) firmPort?: IdentityPort) {
    if (firmPort && firmPort === port) throw new Error("PF-4p: clients' sign-in and the firm staff's must be two ports (P-584 (4))");
  }

  /** The guard's work: a bearer token → the client, or a 401 at once (unknown, not active, session ended, firm closed). */
  async authenticate(token: string | undefined): Promise<ClientContext> {
    if (!token) return unauthorized("Sign in to your client portal first.", "NOT_SIGNED_IN");
    let id;
    try { id = await this.port.verify(token); } catch (e) { if (e instanceof IdentityRefused) return unauthorized(e.detail, e.code); throw e; }
    const accountId = "staffId" in id.lookup && UUID.test(id.lookup.staffId) ? id.lookup.staffId.toLowerCase() : null;
    const firmId = accountId && (await this.db.$queryRaw<{ f: string | null }[]>`select platform_client_account_firm(${accountId}::uuid) as f`)[0]?.f;
    if (!accountId || !firmId) return unauthorized(UNKNOWN, "UNKNOWN_CLIENT");
    return withFirm(firmId, async () => {
      const a = await this.db.platClientAccount.findFirst({ where: firmScope(firmId, { id: accountId }) });
      const firm = await this.db.platformFirm.findUnique({ where: { id: firmId }, select: { key: true, status: true } });
      if (!a || !firm) return unauthorized(UNKNOWN, "UNKNOWN_CLIENT");
      if (firm.status === "DELETED") return problem(401, "Portal closed", FIRM_CLOSED, { code: "FIRM_CLOSED" });
      if (a.status !== "ACTIVE") return refuseStatus(a.status);
      if (a.sessionsEndedAt && id.authTime * 1000 <= a.sessionsEndedAt.getTime()) return unauthorized("This session was ended. Sign in again.", "SESSION_ENDED");
      if (!(await firmAllows(firmId, "portal.read"))) return problem(403, "Not available", "This isn't available right now. Contact your firm.", { code: "FIRM_NOT_AVAILABLE" });
      return { accountId: a.id, firmId, firmKey: firm.key, personId: a.personId, email: a.email, authTime: id.authTime, via: id.via };
    });
  }

  /** The local stand-in's sign-in (POST /api/portal/session/local): firm key and email of an ACTIVE account. The password
   *  and the invitation are part 2's (activation); until then this door exists only on a local copy. */
  async localSignIn(input: unknown) {
    if (!(this.port instanceof ClientLocalIdentity)) return problem(403, "Not available", "The local client sign-in stand-in is off on this server (PLATFORM_IDENTITY is not local).", { code: "LOCAL_SIGN_IN_OFF" });
    const body = parseInput(ClientLocalSignInBody, input);
    if (!body.firmKey) return problem(FIELD_ERROR_STATUS, "Choose the firm", "Give the firm key.", { code: "FIRM_REQUIRED" });
    const firmId = (await this.db.$queryRaw<{ f: string | null }[]>`select platform_firm_of_key(${body.firmKey}) as f`)[0]?.f;
    if (!firmId) return unauthorized(UNKNOWN, "UNKNOWN_CLIENT");
    const firm = await withFirm(firmId, () => this.db.platformFirm.findUnique({ where: { id: firmId }, select: { id: true, key: true, status: true } }));
    if (!firm) return unauthorized(UNKNOWN, "UNKNOWN_CLIENT");
    if (firm.status === "DELETED") return problem(401, "Portal closed", FIRM_CLOSED, { code: "FIRM_CLOSED" });
    enterFirm(firm.id);   // PF-12: the rest of the sign-in runs as this firm
    const a = await this.db.platClientAccount.findFirst({ where: firmScope(firm.id, { email: normalEmail(body.email) }) });
    if (!a) { logPort.warn("client_sign_in_unknown", { firmId: firm.id }); return unauthorized(UNKNOWN, "UNKNOWN_CLIENT"); }   // no account, nothing to name on a line (an email never goes on one)
    if (a.status !== "ACTIVE") {
      await this.db.$transaction((tx) => this.line(tx, a, "platform.client.sign_in_refused", `a client's sign-in was refused (account ${a.status.toLowerCase().replace(/_/g, " ")})`, { status: a.status }, null, null));
      return refuseStatus(a.status);
    }
    const out = await this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ last: Date | null; ended: Date | null; status: string }[]>`select last_sign_in_at as last, sessions_ended_at as ended, status::text as status from platform_client_account where id = ${a.id}::uuid and firm_id = ${firm.id}::uuid for update`;
      if (!row) return { refused: "REVOKED" };
      if (row.status !== "ACTIVE") {   // suspended or revoked while signing in: its own words and its refused line (breaker m5)
        await this.line(tx, a, "platform.client.sign_in_refused", `a client's sign-in was refused (account ${row.status.toLowerCase().replace(/_/g, " ")})`, { status: row.status }, null, null);
        return { refused: row.status };
      }
      const at = Math.max(this.clock.now(), (row.last?.getTime() ?? 0) + 1, (row.ended?.getTime() ?? 0) + 1);
      await tx.platClientAccount.update({ where: { id: a.id }, data: { lastSignInAt: new Date(at) } });
      await this.line(tx, a, "platform.client.sign_in", "a client signed in to the portal (local stand-in)", { via: "local stand-in" }, { lastSignInAt: row.last?.toISOString() ?? null }, { lastSignInAt: new Date(at).toISOString() });
      return { at };
    });
    if ("refused" in out) return refuseStatus(out.refused);
    return { token: (this.port as ClientLocalIdentity).issue(a.id, { authTimeMs: out.at }), tokenType: "Bearer", expiresIn: CLIENT_LOCAL_TTL_SECONDS, firmKey: firm.key };
  }

  /** Sign out: every session of this account signed in until now ends (POST /api/portal/session/end). */
  async signOut(c: ClientContext) {
    await this.db.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ ended: Date | null; last: Date | null }[]>`select sessions_ended_at as ended, last_sign_in_at as last from platform_client_account where id = ${c.accountId}::uuid and firm_id = ${c.firmId}::uuid for update`;
      // At or after the newest sign-in too, so a session that started in this same millisecond ends as well (review m5).
      const at = new Date(Math.max(this.clock.now(), c.authTime * 1000, row?.last?.getTime() ?? 0));
      await tx.platClientAccount.update({ where: { id: c.accountId }, data: { sessionsEndedAt: at } });
      await this.line(tx, { id: c.accountId, firmId: c.firmId, personId: c.personId }, "platform.client.sign_out", "a client signed out of the portal", {}, { sessionsEndedAt: row?.ended?.toISOString() ?? null }, { sessionsEndedAt: at.toISOString() });
    });
    return { signedOut: true };
  }

  /** Who am I: the account, its firm's name and the person's own name. */
  async me(c: ClientContext) {
    const [p, f] = await Promise.all([
      this.db.foPerson.findFirst({ where: firmScope(c.firmId, { id: c.personId }), select: { givenNames: true, familyName: true } }),
      this.db.platformFirm.findUnique({ where: { id: c.firmId }, select: { key: true, operatingName: true } }),
    ]);
    return { accountId: c.accountId, email: c.email, name: [p?.givenNames, p?.familyName].filter(Boolean).join(" ") || null, firm: { key: f?.key ?? c.firmKey, name: f?.operatingName ?? null } };
  }

  /** The client's own cases, newest first: number, what it is, the stage as the client reads it, opened and closed. */
  async cases(c: ClientContext) {
    return (await this.ownCases(c)).map(view);
  }

  /** One of the client's own cases; anything else (another client's, another firm's, a malformed id) is the one 404. */
  async case(c: ClientContext, id: string) {
    if (!UUID.test(id)) return notInFirm("case");
    const [row] = await this.ownCases(c, id.toLowerCase());
    return row ? view(row) : notInFirm("case");
  }

  private async ownCases(c: ClientContext, caseId?: string) {
    const clients = await this.db.caseClient.findMany({ where: { firmId: c.firmId, foPersonId: c.personId }, select: { id: true } });
    if (!clients.length) return [];
    return this.db.case.findMany({
      where: { firmId: c.firmId, clientId: { in: clients.map((x) => x.id) }, ...(caseId ? { id: caseId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: { id: true, caseNumber: true, createdAt: true, closedAt: true, combination: { select: { label: true } }, stages: { where: { state: "CURRENT" }, select: { clientName: true }, take: 1 } },
    });
  }

  /** One audit line about a client's account, as the client (person:<id>, CLIENT; AG-15-38), in the caller's transaction. */
  private line(tx: Tx, a: { id: string; firmId: string; personId: string }, action: string, summary: string, detail: Record<string, string | null>, before: Record<string, string | null> | null, after: Record<string, string | null> | null) {
    return auditEvent.record(tx, { firmId: a.firmId, actor: clientActorWord(a.personId), action, entity: "platform_client_account", entityKey: a.id, summary, detail: { accountId: a.id, ...detail }, before, after });
  }
}
type CaseRow = { id: string; caseNumber: string; createdAt: Date; closedAt: Date | null; combination: { label: string }; stages: { clientName: string }[] };
const view = (r: CaseRow) => ({ caseId: r.id, caseNumber: r.caseNumber, title: r.combination.label, stage: r.stages[0]?.clientName ?? null, open: !r.closedAt, openedAt: r.createdAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null });
