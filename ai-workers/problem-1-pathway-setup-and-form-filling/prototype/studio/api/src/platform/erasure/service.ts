// PF-21d part 1 (map row 85; SA-11-16, SA-11-18, SA-11-28, SA-11-40; brief product/screens/PF-21d/brief.md): an approved
// "delete my data" request on the register of requests made to ExpatReady (PF-21b part 3) carried out.
// * Approve (our staff, system/compliance:dsr-manage): a DELETION naming a person record that exists in that firm
//   (SA-11-40: one person, never a family member) is scheduled for approval day + 7 (Toronto; SA-11-16 (a), a code
//   constant): "Erasing on <date>". Cancel before then stops it. Each is a step and one line in our staff's trail.
// * The daily job (platform.register.erasure_daily, 07:40 Toronto, on PF-14's runner) takes each order due:
//   - the "Data erasure" switch off → nothing erased, one ERASURE_SKIPPED step (not one a day); the order waits;
//   - else, in the order's firm scope and one transaction: LegalHoldPort first (SA-11-18: a held person → no eraser is
//     called; the request reads HELD with each hold's reason and stays scheduled, so the run after the release erases);
//     then every registered eraser (ports/erasure.ts). One eraser failing rolls back the whole order: nothing erased, the
//     job fails and the next run retries it (never a false "done", SA-11-40 Failure).
//   - each module's result is a step; all ERASED or NOTHING → COMPLETED; any KEPT (a floor, SA-11-16 (c)) → HELD,
//     partial, with what was kept and why (SA-11-28: never a false COMPLETED).
// Notes hold ids, counts and class names only (BR-16). The deletion-outcome email is part 3 (tech lead, #3189). Legal
// reading Unconfirmed: no counsel.
import { HttpException, Inject, Injectable, Optional } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { EraseOutcome, ErasureOrder, type ErasurePort } from "../../../../ports/erasure.ts";
import type { LegalHoldPort } from "../../../../ports/legal-hold.ts";
import { Db } from "../../core.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../http/input.ts";
import { PlatformClock } from "../identity/port.ts";
import { forbidden, problem } from "../identity/keys.ts";
import { withFirm } from "../firm-scope.ts";
import { logPort } from "../observability/log.ts";
import { DSR_KEY, type CallLine, type RequestCaller } from "../register/requests/service.ts";
import { SystemIdentity } from "../system-identity/service.ts";
import { DATA_ERASURE_SWITCH, PlatSwitches } from "../switches/service.ts";
import { ErasureRegistry } from "./registry.ts";

type Tx = Prisma.TransactionClient;
/** SA-11-16 (a): the recovery window, counted from approval (a code constant). */
export const ERASURE_WINDOW_DAYS = 7;
export const ERASURE_QUEUE = "platform.register.erasure_daily", ERASURE_CRON = "40 7 * * *", ERASURE_ZONE = "America/Toronto";
export const ERASURE_ACTOR = "system:platform.register.erasure";
/** The hold check the job asks (the process's PgLegalHolds; a test gives its own). */
export const ERASURE_HOLDS = Symbol("Erasure.holds");
/** Does this person record exist in this firm? (front office's fo_person, in the firm's scope; a test gives its own.) */
export const ERASURE_PERSON_CHECK = Symbol("Erasure.personCheck");
export type PersonCheck = (firmId: string, personId: string) => Promise<boolean>;
export type ErasureView = { requestId: string; status: string; eraseOn: string | null };
export type RunResult = { erased: string[]; partial: string[]; held: string[]; skipped: string[]; failed: number };

const NoteBody = z.strictObject({ note: z.string().trim().min(1).max(2000)
  .refine((r) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/.test(r), "Write it as ordinary text.").optional() });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (): never => problem(404, "Not found", "No such request.", { code: "NOT_FOUND" });
const codeOf = (e: unknown) => e instanceof HttpException ? String((e.getResponse() as { code?: unknown })?.code ?? `HTTP_${e.getStatus()}`) : "ERROR";
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000));
/** An eraser's failure, named by its module only (its message may hold data; it goes to the log, never a step). */
class EraserFailed extends Error { constructor(readonly module: string, readonly cause: unknown) { super(`eraser ${module} failed`); } }

const foPersonCheck = (db: PrismaClient): PersonCheck => (firmId, personId) => withFirm(firmId, async () =>
  (await db.$queryRaw<{ hit: boolean }[]>`SELECT EXISTS (SELECT 1 FROM fo_person p WHERE p.id = ${personId}::uuid AND p.firm_id = ${firmId}::uuid) AS hit`)[0].hit);

@Injectable()
export class Erasure {
  private readonly personCheck: PersonCheck;
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SystemIdentity) private readonly identity: Pick<SystemIdentity, "audit">,
    @Inject(PlatformClock) private readonly clock: PlatformClock, @Inject(PlatSwitches) private readonly switches: PlatSwitches,
    @Inject(ErasureRegistry) private readonly registry: ErasurePort<Tx>, @Inject(ERASURE_HOLDS) private readonly holds: LegalHoldPort<Tx>,
    @Optional() @Inject(ERASURE_PERSON_CHECK) personCheck?: PersonCheck) {
    this.personCheck = personCheck ?? foPersonCheck(db);
  }
  private allowed(c: RequestCaller) {
    if (!c || !c.keys.includes(DSR_KEY)) forbidden("Only ExpatReady staff who manage the register of requests made to ExpatReady can do this.", "MISSING_PERMISSION");
  }
  private today() { return new Date(this.clock.now()).toLocaleDateString("en-CA", { timeZone: ERASURE_ZONE }); }
  private async change(line: CallLine | null, target: Record<string, unknown>, fn: (tx: Tx) => Promise<void>): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await fn(tx);
        if (line) await this.identity.audit({ ...line, target: { ...line.target, ...target }, outcome: "ALLOWED", code: null }, tx);
      });
    } catch (e) {
      if (line) await this.identity.audit({ ...line, outcome: "REFUSED", code: codeOf(e) });
      throw e;
    }
  }
  /** GET /api/system/erasure/requests/:id: the request's status and its "Erasing on" day (null when none is scheduled). */
  async read(c: RequestCaller, id: string): Promise<ErasureView> {
    this.allowed(c);
    if (!UUID.test(id)) notFound();
    const [r] = await this.db.$queryRaw<{ status: string; erase_on: Date | null }[]>`SELECT * FROM plat_data_request_erasure_of(${id.toLowerCase()}::uuid)`;
    if (!r) notFound();
    return { requestId: id.toLowerCase(), status: r.status, eraseOn: r.erase_on ? dayOf(r.erase_on) : null };
  }
  /** POST /api/system/erasure/requests/:id/approve: 200 "Erasing on <date>"; 422 not a deletion of a known person in that
   *  firm; 409 already scheduled or completed. */
  async approve(c: RequestCaller, line: CallLine | null, id: string): Promise<ErasureView> {
    this.allowed(c);
    const eraseOn = addDays(this.today(), ERASURE_WINDOW_DAYS);
    await this.change(line, { requestId: id.toLowerCase(), eraseOn }, async (tx) => {
      if (!UUID.test(id)) notFound();
      const [r] = await tx.$queryRaw<{ type: string; firm_id: string | null; person_id: string | null }[]>`SELECT type, firm_id::text AS firm_id, person_id::text AS person_id
        FROM plat_data_request_list(null, ${id.toLowerCase()}::uuid, null, 1)`;
      if (!r) notFound();
      const unfit = (detail: string, code: string) => problem(FIELD_ERROR_STATUS, "Cannot approve this erasure", detail, { code });
      if (r.type !== "DELETION") unfit("Only a deletion request can be erased.", "NOT_DELETION");
      if (!r.firm_id || !r.person_id) unfit("The request names no person record (SA-11-40: one person, chosen by staff).", "NO_PERSON");
      if (!(await this.personCheck(r.firm_id!, r.person_id!))) unfit("That person record is not in that firm; nothing was scheduled.", "PERSON_NOT_IN_FIRM");
      const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_data_request_erasure_approve(${id.toLowerCase()}::uuid, ${eraseOn}::date, ${`staff:${c.staffId}`}) AS out`;
      if (out === "NOT_FOUND") notFound();
      if (out === "ALREADY") problem(409, "Already scheduled", "An erasure is already scheduled for this request.", { code: "ALREADY_SCHEDULED" });
      if (out !== "APPROVED") problem(409, "Not allowed", "This request can no longer be erased (it is completed).", { code: "APPROVE_REFUSED" });
    });
    return this.read(c, id);
  }
  /** POST /api/system/erasure/requests/:id/cancel { note? }: 200; 409 when no erasure is scheduled (cancelled, or done). */
  async cancel(c: RequestCaller, line: CallLine | null, id: string, body: unknown): Promise<ErasureView> {
    this.allowed(c);
    await this.change(line, { requestId: id.toLowerCase() }, async (tx) => {
      if (!UUID.test(id)) notFound();
      const p = NoteBody.safeParse(body ?? {});
      if (!p.success) problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "ERASURE_FIELDS", fields: fieldsOf(p.error) });
      const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_data_request_erasure_cancel(${id.toLowerCase()}::uuid, ${p.data.note ?? null}, ${`staff:${c.staffId}`}) AS out`;
      if (out === "NOT_FOUND") notFound();
      if (out !== "CANCELLED") problem(409, "Nothing to cancel", "No erasure is scheduled for this request.", { code: "NOT_SCHEDULED" });
    });
    return this.read(c, id);
  }
  /** The daily job: every order due today; one order's failure never stops the rest. */
  async run(): Promise<RunResult> {
    const today = this.today(), out: RunResult = { erased: [], partial: [], held: [], skipped: [], failed: 0 };
    const due = await this.db.$queryRaw<{ id: string; firm_id: string; person_id: string }[]>`SELECT id::text AS id, firm_id::text AS firm_id, person_id::text AS person_id
      FROM plat_data_request_erasure_due(${today}::date, 501)`;
    if (!due.length) return out;
    const on = await this.switches.isOn(DATA_ERASURE_SWITCH);
    for (const d of due) {
      try {
        if (!on) {
          await this.db.$queryRaw`SELECT plat_data_request_erasure_step(${d.id}::uuid, 'ERASURE_SKIPPED', ${"The Data erasure switch is off; nothing was erased."}, ${ERASURE_ACTOR}, true)`;
          out.skipped.push(d.id); continue;
        }
        const k = await this.one(ErasureOrder.parse({ requestId: d.id, firmId: d.firm_id, personId: d.person_id }), today);
        out[k].push(d.id);
      } catch (e) {
        out.failed++;
        logPort.error("erasure_order_failed", e instanceof EraserFailed ? e.cause : e, { module: e instanceof EraserFailed ? e.module : "erasure" });
      }
    }
    return out;
  }
  private async one(order: ErasureOrder, today: string): Promise<"erased" | "partial" | "held"> {
    // SA-11-18, SA-11-40: the hold check and every eraser in the order's firm scope and one transaction (the shared hold
    // lock is kept until the erasers are done, so a hold placed meanwhile waits for this order).
    const done = await withFirm(order.firmId, () => this.db.$transaction(async (tx) => {
      const hold = await this.holds.isHeld(tx, order.firmId, [{ kind: "PERSON", id: order.personId }]);
      if (hold.held) return { kind: "held", held: hold.holds.map((h) => `hold ${h.holdId}: ${h.reason}`) } as const;
      const results: { module: string; r: EraseOutcome }[] = [];
      for (const e of this.registry.erasers()) {
        try { results.push({ module: e.module, r: EraseOutcome.parse(await e.erase(tx, order)) }); } catch (err) { throw new EraserFailed(e.module, err); }
      }
      return { kind: "ran", results } as const;
    }, { maxWait: 10_000, timeout: 120_000 }));
    return this.db.$transaction(async (tx) => {
      if (done.kind === "held") {
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_HELD', ${`On legal hold; nothing was erased. ${done.held.join("; ")}`.slice(0, 2000)}, ${ERASURE_ACTOR}, true)`;
        await tx.$queryRaw`SELECT plat_data_request_erasure_finish(${order.requestId}::uuid, 'BLOCKED', null, ${today}::date, ${ERASURE_ACTOR})`;
        return "held" as const;
      }
      for (const { module, r } of done.results)
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_RESULT', ${`${module}: ${r.outcome} — ${r.note}`}, ${ERASURE_ACTOR}, false)`;
      const kept = done.results.filter((x) => x.r.outcome === "KEPT");
      const actions = done.results.length ? done.results.map(({ module, r }) => `${module}: ${r.outcome} (${r.note})`).join("; ").slice(0, 2000) : "No module holds data for this person; nothing to erase.";
      await tx.$queryRaw`SELECT plat_data_request_erasure_finish(${order.requestId}::uuid, ${kept.length ? "PARTIAL" : "COMPLETED"}, ${actions}, ${today}::date, ${ERASURE_ACTOR})`;
      return kept.length ? "partial" as const : "erased" as const;
    });
  }
}
