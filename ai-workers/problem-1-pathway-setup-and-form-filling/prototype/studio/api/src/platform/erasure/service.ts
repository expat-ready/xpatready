// PF-21d part 1b (map row 85; SA-11-16, SA-11-18, SA-11-28, SA-11-40; brief product/screens/PF-21d/brief.md): an approved
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
/** `q` is the caller's client: the run passes its firm transaction, so the row lock (FOR SHARE) lasts until the erasers
 *  are done and a person merge (FO-9b locks the person FOR UPDATE NOWAIT) cannot land in between (review r4 M1). */
export type PersonCheck = (q: Pick<Tx, "$queryRaw">, firmId: string, personId: string) => Promise<boolean>;
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

const foPersonCheck: PersonCheck = async (q, firmId, personId) =>   // break m7: never a merged-away record
  (await q.$queryRaw<{ id: string }[]>`SELECT p.id::text AS id FROM fo_person p WHERE p.id = ${personId}::uuid AND p.firm_id = ${firmId}::uuid AND p.merged_into_id IS NULL FOR SHARE`).length === 1;

@Injectable()
export class Erasure {
  private readonly personCheck: PersonCheck;
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SystemIdentity) private readonly identity: Pick<SystemIdentity, "audit">,
    @Inject(PlatformClock) private readonly clock: PlatformClock, @Inject(PlatSwitches) private readonly switches: PlatSwitches,
    @Inject(ErasureRegistry) private readonly registry: ErasurePort<Tx>, @Inject(ERASURE_HOLDS) private readonly holds: LegalHoldPort<Tx>,
    @Optional() @Inject(ERASURE_PERSON_CHECK) personCheck?: PersonCheck) {
    this.personCheck = personCheck ?? foPersonCheck;
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
    await this.change(line, { requestId: id.toLowerCase(), eraseOn }, async (tx) => {   // the person's id joins the line below (SA-11-40 §9)
      if (!UUID.test(id)) notFound();
      const [r] = await tx.$queryRaw<{ type: string; firm_id: string | null; person_id: string | null }[]>`SELECT type, firm_id::text AS firm_id, person_id::text AS person_id
        FROM plat_data_request_list(null, ${id.toLowerCase()}::uuid, null, 1)`;
      if (!r) notFound();
      const unfit = (detail: string, code: string) => problem(FIELD_ERROR_STATUS, "Cannot approve this erasure", detail, { code });
      if (r.type !== "DELETION") unfit("Only a deletion request can be erased.", "NOT_DELETION");
      if (!r.firm_id || !r.person_id) unfit("The request names no person record; staff choose the one person it is about.", "NO_PERSON");
      if (!(await withFirm(r.firm_id!, () => this.db.$transaction((ftx) => this.personCheck(ftx, r.firm_id!, r.person_id!))))) unfit("That person record is not in that firm; nothing was scheduled.", "PERSON_NOT_IN_FIRM");
      if (line) line.target = { ...line.target, personId: r.person_id };
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
      const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_data_request_erasure_cancel(${id.toLowerCase()}::uuid, ${p.data.note ?? null}, ${`staff:${c.staffId}`}, ${this.today()}::date) AS out`;
      if (out === "NOT_FOUND") notFound();
      if (out === "RUNNING") problem(409, "Erasing now", "An erasure has started on this request and has not finished recording; it cannot be cancelled.", { code: "ERASURE_RUNNING" });
      if (out === "MAY_HAVE_ERASED") problem(409, "Cannot be cancelled", "An earlier run may already have erased this person's data, so the request cannot be withdrawn.", { code: "MAY_HAVE_ERASED" });
      if (out === "WINDOW_ENDED") problem(409, "Too late to cancel", "The 7-day window has ended; the erasure runs today.", { code: "WINDOW_ENDED" });
      if (out !== "CANCELLED") problem(409, "Nothing to cancel", "No erasure is scheduled for this request.", { code: "NOT_SCHEDULED" });
    });
    return this.read(c, id);
  }
  /** The daily job: every order due today; one order's failure never stops the rest. */
  async run(): Promise<RunResult> {
    const today = this.today(), out: RunResult = { erased: [], partial: [], held: [], skipped: [], failed: 0 };
    const due = await this.db.$queryRaw<{ id: string; firm_id: string; person_id: string }[]>`SELECT id::text AS id, firm_id::text AS firm_id, person_id::text AS person_id
      FROM plat_data_request_erasure_due(${today}::date, 501)`;
    for (const d of due) {
      try {
        const off = !(await this.switches.isOn(DATA_ERASURE_SWITCH));   // read per order (break m6): an emergency stop takes effect at the next order
        if (off || !this.registry.erasers().length) {   // review M1: no module registered yet → nothing erased, never a false COMPLETED
          const why = off ? "The Data erasure switch is off; this run erased nothing." : "No module has registered an eraser yet; this run erased nothing.";
          await this.db.$queryRaw`SELECT plat_data_request_erasure_step(${d.id}::uuid, 'ERASURE_SKIPPED', ${why}, ${ERASURE_ACTOR}, true, null::timestamptz)`;
          out.skipped.push(d.id); continue;
        }
        const k = await this.one(ErasureOrder.parse({ requestId: d.id, firmId: d.firm_id, personId: d.person_id }), today);
        out[k ?? "skipped"].push(d.id);   // part 2a item 4: an order another run still holds is counted as skipped, never silent
      } catch (e) {
        out.failed++;
        logPort.error("erasure_order_failed", e instanceof EraserFailed ? e.cause : e, { module: e instanceof EraserFailed ? e.module : "erasure" });
      }
    }
    return out;
  }
  /** One order under the job's claim (break B1, B2): claimed first (a cancel or a hand move is then refused), erased in the
   *  firm's scope, recorded under the same claim; an eraser failing gives the claim back. Null: not claimable now. */
  private async one(order: ErasureOrder, today: string): Promise<"erased" | "partial" | "held" | null> {
    const [got] = await this.db.$queryRaw<{ claim: Date; retaken: boolean }[]>`SELECT claim, retaken FROM plat_data_request_erasure_claim(${order.requestId}::uuid, ${today}::date)`;
    if (!got) return null;
    const { claim, retaken } = got;
    // Set inside the erasers' transaction once every eraser has returned: from then on the outcome is "erased, or not
    // known" (a COMMIT can succeed while its answer is lost, Lead 27). Only a throw before it is a certain rollback.
    const state = { erased: false };
    try { return await this.erase(order, today, claim, state, retaken); } catch (e) {
      if (state.erased || retaken) {   // review r6 M2: a retake may stand on an earlier run's unrecorded erasure
        // Lead 26, 27 on #3235: the erasers may have committed (the record failed, or COMMIT's answer was lost). The claim is
        // kept, so nobody can cancel a request whose data may be gone (cancel refuses any claim); a run after 30 minutes
        // retakes it and records the result.
        // R7-3: say which module failed, and "may": an earlier run may have erased, and this one may not have.
        const kept = e instanceof EraserFailed && !state.erased
          ? `${e.module}: FAILED on a run after an earlier one that may have erased; the claim is kept. The request cannot be cancelled; the next daily run records it.`
          : "The erasers may have run, but their result could not be recorded. The request cannot be cancelled; the next daily run records it.";
        await this.db.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_RESULT', ${kept}, ${ERASURE_ACTOR}, true, ${claim}::timestamptz)`.catch(() => undefined);
        throw e;
      }
      // Review M2 (SA-11-40 Failure): the request shows the failure as a step (the module's name only), then the claim goes
      // back with the order still scheduled. A stale claim is retaken after 30 minutes anyway.
      const what = e instanceof EraserFailed ? `${e.module}: FAILED — nothing was erased; the next run retries.` : "The erasure failed — nothing was recorded as erased; the next run retries.";
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_RESULT', ${what}, ${ERASURE_ACTOR}, false, ${claim}::timestamptz)`;
        await tx.$queryRaw`SELECT plat_data_request_erasure_release(${order.requestId}::uuid, ${claim}::timestamptz)`;
      }).catch(() => undefined);
      throw e;
    }
  }
  private async erase(order: ErasureOrder, today: string, claim: Date, state: { erased: boolean }, retaken: boolean): Promise<"erased" | "partial" | "held"> {
    // SA-11-18, SA-11-40: the hold check and every eraser in the order's firm scope and one transaction (the shared hold
    // lock is kept until the erasers are done, so a hold placed meanwhile waits for this order).
    const done = await withFirm(order.firmId, () => this.db.$transaction(async (tx) => {
      // Lead B 5 on #3235: the person may have been merged away (or left the firm) since approval. The run asks again;
      // gone → HELD with why, nothing erased. The merge is not followed: staff choose the person (SA-11-40 rule 6, AG16-44).
      if (!(await this.personCheck(tx, order.firmId, order.personId))) return { kind: "gone" } as const;   // in this transaction, locked (review r4 M1)
      const hold = await this.holds.isHeld(tx, order.firmId, [{ kind: "PERSON", id: order.personId }]);
      if (hold.held) return { kind: "held", held: hold.holds.map((h) => `hold ${h.holdId}: ${h.reason}`) } as const;
      const results: { module: string; r: EraseOutcome }[] = [];
      for (const e of this.registry.erasers()) {
        try { results.push({ module: e.module, r: EraseOutcome.parse(await e.erase(tx, order)) }); } catch (err) { throw new EraserFailed(e.module, err); }
        const { r } = results[results.length - 1];   // part 2a item 5: the mark commits exactly when the erasers do
        await tx.$queryRaw`SELECT plat_data_request_erasure_mark_add(${order.requestId}::uuid, ${claim}::timestamptz, ${e.module}, ${r.outcome}, ${r.note})`;
      }
      state.erased = true;   // from here a failure (COMMIT, its lost answer, the record) keeps the claim
      return { kind: "ran", results } as const;
    }, { maxWait: 10_000, timeout: 120_000 }));
    return this.db.$transaction(async (tx) => {
      const finish = async (outcome: string, actions: string | null) => {
        const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_data_request_erasure_finish(${order.requestId}::uuid, ${outcome}, ${actions}, ${today}::date, ${ERASURE_ACTOR}, ${claim}::timestamptz) AS out`;
        if (out !== "DONE") throw new Error(`erasure finish refused (${out}): the request is no longer under this run's claim`);   // never silent (break B1)
      };
      // Review r6 M2: this run retook an earlier run's claim, whose erasers may have committed unrecorded. A person gone or a
      // hold placed since then ends the erasure HELD with true words and no erase day (never cancellable, nothing more
      // erased); staff may approve it again.
      // Part 2a item 5: an earlier run's marks say what it did (they committed with its erasers); without them, not known.
      const earlier = retaken ? await tx.$queryRaw<{ module: string; outcome: string; note: string }[]>`SELECT module, outcome, note FROM plat_data_request_erasure_marks(${order.requestId}::uuid, ${claim}::timestamptz)` : [];
      const marked = earlier.map((m) => `${m.module}: ${m.outcome} (${m.note})`).join("; ");
      const unknown = earlier.length ? `An earlier run's result was not recorded at the time; its marks say: ${marked}.`
        : "An earlier run may have erased this person's data; its result was not recorded, so what was erased is not known.";
      if (retaken && done.kind !== "ran") {
        const why = done.kind === "gone" ? "The person record has since been merged away or is no longer in that firm: log the request on the right person record (SA-11-40 rule 6)." : `A legal hold now applies: ${done.held.join("; ")}. When it is lifted, approve again.`;
        const tail = " Nothing more was erased.";   // R7-4: never cut off by the length limit
        const text = `${unknown} ${why}`.slice(0, 2000 - tail.length) + tail;
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_HELD', ${text}, ${ERASURE_ACTOR}, true, ${claim}::timestamptz)`;
        await finish("PARTIAL", text);
        return "partial" as const;
      }
      if (done.kind === "gone") {
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_HELD', ${"The person record has been merged away or is no longer in that firm; nothing was erased. Staff choose the person: cancel, and log the request on the right record (SA-11-40 rule 6)."}, ${ERASURE_ACTOR}, true, ${claim}::timestamptz)`;
        await finish("BLOCKED", null);
        return "held" as const;
      }
      if (done.kind === "held") {
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_HELD', ${`On legal hold; nothing was erased. ${done.held.join("; ")}`.slice(0, 2000)}, ${ERASURE_ACTOR}, true, ${claim}::timestamptz)`;
        await finish("BLOCKED", null);
        return "held" as const;
      }
      for (const { module, r } of done.results)
        await tx.$queryRaw`SELECT plat_data_request_erasure_step(${order.requestId}::uuid, 'ERASURE_RESULT', ${`${module}: ${r.outcome} — ${r.note}`}, ${ERASURE_ACTOR}, false, ${claim}::timestamptz)`;
      const kept = done.results.filter((x) => x.r.outcome === "KEPT");
      const found = done.results.map(({ module, r }) => `${module}: ${r.outcome} (${r.note})`).join("; ");
      const actions = (retaken ? `${earlier.length ? `An earlier run's result was not recorded at the time; its marks say: ${marked}.` : "An earlier run's result was not recorded; it may have erased first."} This run: ${found}` : found).slice(0, 2000);
      await finish(kept.length ? "PARTIAL" : "COMPLETED", actions);
      return kept.length ? "partial" as const : "erased" as const;
    });
  }
}
