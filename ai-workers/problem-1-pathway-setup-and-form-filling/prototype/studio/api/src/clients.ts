// CS-K1 part 1 (map row 72; brief design/build-lead-c-briefs/CS-K1.md; contract v0.1 §5, P-588 (2), AG-7-75 §7): the
// case side's client record. One helper makes a client inside the caller's transaction (the opening's, runtime.ts
// createCase); one finds a client of a firm; the read service answers the two routes (features/clients.ts) behind PF-4's
// guard. A client is the firm's own: its firm key is the staff session's (or the opener's), and another firm's client is
// 404, never 403 (BR-20). The database keeps the rest: the number from case_client_counter, the text and kind checks, the
// firm id (CS-W1's fill) and the firm-matched keys from runtime_case (migration 20261118230000_csk1_case_client).
// No front-office code is read or written here (contract §1 rule 4): fo_person_id and fo_company_id stay empty in part 1.
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Db, Workspace } from "./core.ts";
import { problem, type StaffContext } from "./platform/identity/keys.ts";
import { INVISIBLE } from "../../contracts/runtime.ts";

type Tx = Prisma.TransactionClient;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAGE = 50;
const INVISIBLE_G = new RegExp(INVISIBLE.source, "g");

/** "Client code" (AG-7-75 §7): CL- and the firm's running number, five digits (CL-00001); more past 99999. */
export const clientCode = (n: number) => `CL-${String(n).padStart(5, "0")}`;
export type ClientLine = { id: string; number: string; display_name: string; display_kind: "PERSON" | "COMPANY" };
const line = (c: { id: string; clientNumber: number; displayName: string; displayKind: string }): ClientLine =>
  ({ id: c.id, number: clientCode(c.clientNumber), display_name: c.displayName, display_kind: c.displayKind as ClientLine["display_kind"] });

/** A new client of a firm, inside the caller's transaction: the firm's next number (a rolled-back caller gives it back),
 *  COMPANY when the combination's Pathway is CORPORATE, else PERSON. The name is the principal's display name. */
export async function newClient(tx: Tx, a: { workspaceId: string; firmKey: string; combinationId: string; displayName: string; createdBy: string }) {
  const [{ n, kind }] = await tx.$queryRaw<{ n: number; kind: string }[]>`
    select case_client_next_number(${a.workspaceId}::uuid, ${a.firmKey}) as n, case_client_kind_of(${a.combinationId}::uuid) as kind`;
  return tx.caseClient.create({ data: { workspaceId: a.workspaceId, firmKey: a.firmKey, clientNumber: Number(n), displayName: a.displayName.trim().slice(0, 200), displayKind: kind, createdBy: a.createdBy } });
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
  async list(ctx: StaffContext, query: unknown, page: unknown) {
    const firmKey = await this.firm(ctx);
    const p = Math.max(1, Math.min(10_000, Number.parseInt(typeof page === "string" ? page : "1", 10) || 1));
    if (!firmKey) return { clients: [], page: p, page_size: PAGE, total: 0 };
    // Review m3, breaker 7a/7b: control and invisible characters dropped (a NUL was a 500), LIKE's wildcards and escape
    // taken literally (a "%" matched every client of the firm).
    const q = typeof query === "string" ? query.replace(INVISIBLE_G, "").replace(/[\t\n\r]/g, " ").trim().slice(0, 200) : "";
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const code = /^(?:cl-?)?0*(\d{1,9})$/i.exec(q);
    const where: Prisma.CaseClientWhereInput = { workspaceId: await this.ws.id(), firmKey,
      ...(q ? { OR: [{ displayName: { contains: like, mode: "insensitive" } }, ...(code ? [{ clientNumber: Number(code[1]) }] : [])] } : {}) };
    const [rows, total] = await Promise.all([
      this.db.caseClient.findMany({ where, orderBy: [{ clientNumber: "desc" }], skip: (p - 1) * PAGE, take: PAGE }),
      this.db.caseClient.count({ where }),
    ]);
    return { clients: rows.map(line), page: p, page_size: PAGE, total };
  }

  /** GET /api/runtime/clients/:id: one client of the firm with its cases' ids and numbers; another firm's is 404. */
  async one(ctx: StaffContext, id: string) {
    const firmKey = await this.firm(ctx);
    if (!firmKey) return notFound();
    const c = await clientOfFirm(this.db, { workspaceId: await this.ws.id(), firmKey, id });
    if (!c) return notFound();
    const cases = await this.db.case.findMany({ where: { clientId: c.id, firmKey }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, caseNumber: true } });
    return { ...line(c), created_at: c.createdAt, cases: cases.map((k) => ({ id: k.id, case_number: k.caseNumber })) };
  }
}
