// FO-3a part 2a (BACKLOG row FO-3a; brief lead-b-briefs/FO-3a2.md; AG-4-49, AG-4-50; concept fo-3-booking BR-15, BR-16,
// Q3): the consult record of an attended booking and ConsultRecordPort. Cases DW1..DW7 of the brief, each with a passing
// and a failing case, over HTTP on the six roles PF-3 seeds: a scratch database (every migration), one small Nest app
// with FO-3sr's staff routes (to book and answer attendance) and this row's routes beside PF-4's guard with the local
// sign-in stand-in, PF-0p's fake clock, jobs, mail and audit, and the ArrivalPort fake. No model call (US$0). Dropped at
// the end.
//   tsx studio/tests/check_fo3a2_consult_record.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, ModulesContainer, NestFactory, Reflector } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeConsultRecords, type ConsultRecordPort } from "../ports/consult-record.ts";
import { consultRecordPortContract, type ConsultRecordHarness } from "../ports/contracts/consult-record-port.contract.ts";
import { runContract } from "../ports/contracts/contract.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3a2_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard, platformRoutes } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { ConsultRecordController, ConsultRecords } = await import("../api/src/front-office/booking/consult/controller.ts");
const { ConsultRecordService, WORDS } = await import("../api/src/front-office/booking/consult/service.ts");
const { PgConsultRecords } = await import("../api/src/front-office/booking/consult/port.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const feature = (await import("../api/src/features/front-office-booking-consult.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
/** A Toronto wall time as an ISO moment ("2026-10-27 09:00"). */
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock), audit = fakeAudit(), mail = fakeMail({ clock });
const ports = { audit: audit as never, clock, jobs, mail, arrival, publicBaseUrl: "http://localhost:4431", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3a2-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }, ConsultRecords];
@Module({ controllers: [BookingStaffController, ConsultRecordController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3a2-a"), await firm("fo3a2-b")];
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3a2" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  const B1 = await person(B.id, "b-owner", "OWNER");
  await copyFirmHoursTo(db, A.id, [P.OWNER.id, P.BILLING_FINANCE.id]);
  const type = (slug: string, host: string, purpose = "FREE_CONSULT", minutes = 30) =>
    // Types that need no consultation agreement: this check is about attendance, not the agreement (QA-772: gate.ts holds a type that needs one and has none).
    db.foConsultationType.create({ data: { requireAgreement: false, firmId: A.id, slug, name: `Sample consultation ${slug}`, purpose: purpose as never, modes: ["VIDEO"], hostStaffIds: [host], minutes } });
  const [TO, TB, TC] = [await type("owner", P.OWNER.id, "FREE_CONSULT", 45), await type("billing", P.BILLING_FINANCE.id), await type("case", P.OWNER.id, "CASE_REVIEW")];
  const lead = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });
  const pros = arrival.addPerson(A.id, { givenNames: "Pat", familyName: "Sample", email: "pat@client.example" });
  arrival.addProspect(A.id, "pat@client.example", "ENGAGED");

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const go = (method: string, path: string, who?: { token: string }, b?: unknown) => call(base, method, `/api/front-office/bookings${path}`, who?.token, b);
  const make = async (typeId: string, personId: string, when: string, hostToken = P.OWNER) => {
    const r = await go("POST", "", hostToken, { typeId, personId, mode: "VIDEO", startsAt: iso(when), timeZone: TZ });
    if (r.status !== 201) throw new Error(`create ${when}: ${JSON.stringify(r)}`);
    return r.body as { id: string; prospectId: string | null };
  };
  const attend = async (id: string, outcome: "COMPLETED" | "NO_SHOW", who = P.OWNER) => { const r = await go("POST", `/${id}/attendance`, who, { outcome }); if (r.status !== 200) throw new Error(`attendance: ${JSON.stringify(r)}`); };
  const rec = (id: string) => `/${id}/consult-record`;
  const records = (bookingId: string) => db.foConsultRecord.count({ where: { bookingId } });

  // Bookings on Tuesday; the clock then moves past them, so attendance may be answered.
  const bLead = await make(TO.id, lead, "2026-10-27 09:00");
  const bPros = await make(TO.id, pros, "2026-10-27 10:00");
  const bCase = await make(TC.id, lead, "2026-10-27 11:00");
  const bNoAnswer = await make(TO.id, lead, "2026-10-27 13:00");
  const bNoShow = await make(TO.id, lead, "2026-10-27 14:00");
  const bCancelled = await make(TO.id, lead, "2026-10-27 15:00");
  const bBilling = await make(TB.id, lead, "2026-10-27 09:00");
  ok("FO-3a2 set-up: the prospect booking names its prospect (the arrival fake's open prospect)", !!bPros.prospectId && !bLead.prospectId, { bPros, bLead });
  await go("POST", `/${bCancelled.id}/cancel`, P.OWNER);
  await clock.set(at("2026-10-27 17:00"));
  for (const id of [bLead.id, bPros.id, bCase.id]) await attend(id, "COMPLETED");
  await attend(bNoShow.id, "NO_SHOW");
  await attend(bBilling.id, "COMPLETED", P.BILLING_FINANCE);

  // ------------------------------------------------------------------------------- the routes declare their access
  const routes = platformRoutes(app.get(ModulesContainer), app.get(Reflector)).filter((r) => r.name.startsWith("ConsultRecordController."));
  ok("FO-3a2: the feature lists the controller, and both routes are found under /api/front-office/bookings/:id/consult-record with their access declared",
    (feature.controllers as unknown[]).includes(ConsultRecordController) && routes.length === 2 && routes.every((r) => r.access && r.path === "/api/front-office/bookings/:id/consult-record"), routes);

  // ------------------------------------------------------------------------------------------ DW1: after Attended only
  const first = await go("PUT", rec(bLead.id), P.OWNER, { notes: "Has a job offer in Calgary; needs LMIA check", recommended: ["Work permit", "Translation"] });
  ok("FO-3a2 DW1 pass: Attended → PUT saves (200), time spent defaults to the booked length (45), one record",
    first.status === 200 && first.body.timeSpentMinutes === 45 && first.body.bookedMinutes === 45 && first.body.recommended.join("|") === "Work permit|Translation" && await records(bLead.id) === 1, first);
  const refusedAttend = { noAnswer: await go("PUT", rec(bNoAnswer.id), P.OWNER, {}), noShow: await go("PUT", rec(bNoShow.id), P.OWNER, {}), cancelled: await go("PUT", rec(bCancelled.id), P.OWNER, {}) };
  ok(`FO-3a2 DW1 fail: not answered and No-show → 409 "${WORDS.notAttended}"; cancelled → 409; nothing saved`,
    refusedAttend.noAnswer.status === 409 && refusedAttend.noAnswer.body.detail === WORDS.notAttended && refusedAttend.noShow.status === 409 && refusedAttend.noShow.body.detail === WORDS.notAttended
      && refusedAttend.cancelled.status === 409 && refusedAttend.cancelled.body.code === "CANCELLED"
      && await records(bNoAnswer.id) + await records(bNoShow.id) + await records(bCancelled.id) === 0, refusedAttend);
  const noRecordYet = await go("GET", rec(bPros.id), P.OWNER);
  ok("FO-3a2 DW1: GET before any save → 404 NO_RECORD with the booked length to pre-fill", noRecordYet.status === 404 && noRecordYet.body.code === "NO_RECORD" && noRecordYet.body.bookedMinutes === 45, noRecordYet);

  // -------------------------------------------------------------------------------------------------- DW2: the fee
  const cad = await go("PUT", rec(bLead.id), P.OWNER, { version: 1, timeSpentMinutes: 35, recommended: ["Work permit"], quotedFeeMinor: 15000, quotedFeeCurrency: "CAD" });
  ok("FO-3a2 DW2 pass: a fee of 15000 CAD saves (time spent changed to 35)", cad.status === 200 && cad.body.quotedFee?.amountMinor === 15000 && cad.body.quotedFee?.currency === "CAD" && cad.body.timeSpentMinutes === 35, cad);
  const noCur = await go("PUT", rec(bLead.id), P.OWNER, { quotedFeeMinor: 15000 });
  const eur = await go("PUT", rec(bLead.id), P.OWNER, { quotedFeeMinor: 15000, quotedFeeCurrency: "EUR" });
  const silly = [await go("PUT", rec(bLead.id), P.OWNER, { quotedFeeMinor: -1, quotedFeeCurrency: "CAD" }), await go("PUT", rec(bLead.id), P.OWNER, { quotedFeeMinor: 1e12, quotedFeeCurrency: "CAD" }),
    await go("PUT", rec(bLead.id), P.OWNER, { timeSpentMinutes: 0 }), await go("PUT", rec(bLead.id), P.OWNER, { recommended: Array.from({ length: 21 }, (_, i) => `Item ${i}`) }), await go("PUT", rec(bLead.id), P.OWNER, { extra: true })];
  const kept = await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bLead.id } });
  ok(`FO-3a2 DW2 fail: a fee with no currency → 422 "${WORDS.currency}" on quotedFeeCurrency; EUR, -1, 1e12, 0 minutes, 21 items, an unknown field → 422; the saved record is unchanged`,
    noCur.status === 422 && noCur.body.detail === WORDS.currency && noCur.body.issues?.[0]?.startsWith("quotedFeeCurrency:") && eur.status === 422 && eur.body.issues?.includes("quotedFeeCurrency: Choose CAD or USD.")
      && silly.every((x) => x.status === 422) && kept.quotedFeeMinor === 15000 && kept.quotedFeeCurrency === "CAD" && kept.timeSpentMinutes === 35, { noCur, eur, silly: silly.map((x) => x.status), kept });
  const curOnly = await go("PUT", rec(bPros.id), P.OWNER, { quotedFeeCurrency: "USD" });
  ok("FO-3a2 DW2: a pre-filled currency with no amount is dropped, never stored alone (rule 6's pre-fill)", curOnly.status === 200 && curOnly.body.quotedFee === null && (await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bPros.id } })).quotedFeeCurrency === null, curOnly);
  const dbRefusals: string[] = [];
  for (const [what, q] of [["0 minutes", `UPDATE fo_consult_record SET time_spent_minutes = 0 WHERE id = '${kept.id}'`], ["21 items", `UPDATE fo_consult_record SET recommended = array_fill('x'::text, ARRAY[21]) WHERE id = '${kept.id}'`],
    ["an empty item", `UPDATE fo_consult_record SET recommended = ARRAY[' '] WHERE id = '${kept.id}'`], ["a fee with no currency", `UPDATE fo_consult_record SET quoted_fee_currency = NULL WHERE id = '${kept.id}'`],
    ["EUR", `UPDATE fo_consult_record SET quoted_fee_currency = 'EUR' WHERE id = '${kept.id}'`],
    ["a currency with no fee", `UPDATE fo_consult_record SET quoted_fee_minor = NULL, quoted_fee_currency = 'CAD' WHERE id = '${kept.id}'`],
    ["a two-dimensional item list", `UPDATE fo_consult_record SET recommended = ARRAY[['a','b'],['c','d']] WHERE id = '${kept.id}'`], ["a second record for the booking", `INSERT INTO fo_consult_record (id, firm_id, booking_id, time_spent_minutes, created_by, updated_by, updated_at) VALUES (gen_random_uuid(), '${A.id}', '${bLead.id}', 30, 'x', 'x', now())`],
    ["another firm's booking", `INSERT INTO fo_consult_record (id, firm_id, booking_id, time_spent_minutes, created_by, updated_by, updated_at) VALUES (gen_random_uuid(), '${B.id}', '${bLead.id}', 30, 'x', 'x', now())`]] as const) {
    try { execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-qc", q], { stdio: ["ignore", "ignore", "pipe"] }); dbRefusals.push(`${what}: accepted`); } catch { /* refused, as it should */ }
  }
  ok("FO-3a2 DW2 fail (database): 0 minutes, 21 items, an empty item, a fee without currency, EUR, a currency with no fee, a two-dimensional list, a second record and another firm's booking are each refused by the database", dbRefusals.length === 0, dbRefusals);

  // ------------------------------------------------------------------------------------------------ DW3: who may
  const co = await go("PUT", rec(bLead.id), P.CASE_OFFICER, { version: 2, timeSpentMinutes: 40, quotedFeeMinor: 15000, quotedFeeCurrency: "CAD", recommended: ["Work permit"] });
  const host = await go("PUT", rec(bBilling.id), P.BILLING_FINANCE, { notes: "Sample" });
  ok("FO-3a2 DW3 pass: the host saves (Owner on their booking; Billing and finance on the one they host, no key); a Case Officer with agent/booking:edit saves another's",
    first.status === 200 && host.status === 200 && co.status === 200 && co.body.timeSpentMinutes === 40, { co, host });
  const others = { billing: await go("PUT", rec(bLead.id), P.BILLING_FINANCE, { timeSpentMinutes: 5 }), billingRead: await go("GET", rec(bLead.id), P.BILLING_FINANCE),
    readOnly: await go("PUT", rec(bLead.id), P.READ_ONLY, { timeSpentMinutes: 5 }), readOnlyRead: await go("GET", rec(bLead.id), P.READ_ONLY),
    firmB: await go("GET", rec(bLead.id), B1), firmBPut: await go("PUT", rec(bLead.id), B1, { timeSpentMinutes: 5 }), nobody: await go("GET", rec(bLead.id)) };
  ok("FO-3a2 DW3 fail: Billing and finance, not the host and with no booking key → 404 (the booking is not theirs to see, as every staff booking read); Read-only, who sees it by agent/booking:list → 403; firm B → 404; no sign-in → 401; nothing changed",
    others.billing.status === 404 && others.billingRead.status === 404 && others.readOnly.status === 403 && others.readOnly.body.code === "MISSING_PERMISSION" && others.readOnlyRead.status === 403
      && others.firmB.status === 404 && others.firmBPut.status === 404 && others.nobody.status === 401 && (await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bLead.id } })).timeSpentMinutes === 40,
    Object.fromEntries(Object.entries(others).map(([k, v]) => [k, v.status])));

  // ------------------------------------------------------------------------- the version (STANDARDS §4; review M1)
  const stale = await go("PUT", rec(bLead.id), P.OWNER, { version: 1, notes: "from a form read before the Case Officer's save" });
  const secondFirst = await go("PUT", rec(bLead.id), P.OWNER, { notes: "a second first save" });
  const afterStale = await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bLead.id } });
  ok("FO-3a2 version pass: each save answers the version it wrote (1, 2, 3), and the next save names it",
    first.body.version === 1 && cad.body.version === 2 && co.body.version === 3 && afterStale.version === 3, { first: first.body.version, cad: cad.body.version, co: co.body.version });
  ok("FO-3a2 version fail: a save naming an old version, and a first save (no version) when a record exists, → 409 STALE_VERSION naming the current version; the Case Officer's fee is kept",
    stale.status === 409 && stale.body.code === "STALE_VERSION" && stale.body.version === 3 && secondFirst.status === 409 && secondFirst.body.code === "STALE_VERSION"
      && afterStale.quotedFeeMinor === 15000 && afterStale.timeSpentMinutes === 40 && afterStale.notes === null, { stale, secondFirst, afterStale });

  // ------------------------------------------------------------------------------------------- DW4: later No-show
  const caseRec = await go("PUT", rec(bCase.id), P.OWNER, { notes: "Sample" });
  await attend(bCase.id, "NO_SHOW");
  const changed = await call(base, "GET", `/api/front-office/bookings/${bCase.id}/consult-record`, P.OWNER.token);
  ok(`FO-3a2 DW4 pass: attendance changed to No-show after a save → the record stays and answers attendanceChanged "NO_SHOW" (no next step)`,
    caseRec.status === 200 && changed.status === 200 && changed.body.attendanceChanged === "NO_SHOW" && changed.body.id === caseRec.body.id && changed.body.nextSteps.length === 0 && await records(bCase.id) === 1, changed);
  const editAfter = await go("PUT", rec(bCase.id), P.OWNER, { notes: "changed" });
  ok("FO-3a2 DW4 fail: the record is not edited while the attendance is No-show (409), and a record on an Attended booking answers attendanceChanged null",
    editAfter.status === 409 && (await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bCase.id } })).notes === "Sample" && co.body.attendanceChanged === null, editAfter);
  await attend(bCase.id, "COMPLETED");

  // --------------------------------------------------------------------------------------------- DW5: next steps
  const outboxBefore = await db.moduleEvent.count(), mailBefore = mail.sent.length, msgBefore = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM msg_outbox`;
  const leadSteps = await go("PUT", rec(bLead.id), P.OWNER, { version: 3, timeSpentMinutes: 40, recommended: ["Work permit"], quotedFeeMinor: 15000, quotedFeeCurrency: "CAD" });   // a PUT replaces the whole record
  const prosSteps = await go("GET", rec(bPros.id), P.OWNER);
  const caseSteps = await go("GET", rec(bCase.id), P.OWNER);
  ok("FO-3a2 DW5 pass: lead → ENGAGE_AND_PREPARE_RETAINER and CLOSE_LEAD; prospect → PREPARE_RETAINER; case → none (party kinds lead, prospect, client)",
    leadSteps.body.nextSteps?.join() === "ENGAGE_AND_PREPARE_RETAINER,CLOSE_LEAD" && leadSteps.body.partyRef?.kind === "lead" && leadSteps.body.partyRef?.id === lead
      && prosSteps.body.nextSteps?.join() === "PREPARE_RETAINER" && prosSteps.body.partyRef?.kind === "prospect" && prosSteps.body.partyRef?.id === bPros.prospectId
      && caseSteps.body.nextSteps?.length === 0 && caseSteps.body.partyRef?.kind === "client", { leadSteps: leadSteps.body, prosSteps: prosSteps.body, caseSteps: caseSteps.body });
  const noDraft = await db.platformRolePermission.findMany({ where: { permissionKey: "agent/retainer:draft" }, select: { role: true } });
  const billingSteps = await go("GET", rec(bBilling.id), P.BILLING_FINANCE);
  const msgAfter = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM msg_outbox`;
  ok("FO-3a2 DW5 fail: a person without agent/retainer:draft or agent/prospect:lose (Billing and finance, host of their own) gets no step; a save queues no mail, no outbox event and no msg_outbox row",
    !noDraft.some((r) => r.role === "BILLING_FINANCE") && billingSteps.status === 200 && billingSteps.body.nextSteps.length === 0
      && await db.moduleEvent.count() === outboxBefore && mail.sent.length === mailBefore && msgAfter[0].n === msgBefore[0].n, { billingSteps: billingSteps.body, outboxBefore, mailBefore, msgBefore, msgAfter });

  // A Case review booked for the prospect's person links the open prospect too; a case call still offers no retainer (review M2).
  await clock.set(at("2026-10-26 08:00"));
  const bCasePros = await make(TC.id, pros, "2026-10-28 09:00");
  await clock.set(at("2026-10-28 17:00"));
  await attend(bCasePros.id, "COMPLETED");
  const casePros = await call(base, "PUT", `/api/front-office/bookings/${bCasePros.id}/consult-record`, P.OWNER.token, {});   // the full path, as the graph reads it
  ok("FO-3a2 DW5 fail: a Case review booking that also names the person's prospect answers client and no retainer step (the case purpose is read first)",
    !!bCasePros.prospectId && casePros.status === 200 && casePros.body.partyRef?.kind === "client" && casePros.body.nextSteps.length === 0, { bCasePros, casePros: casePros.body });
  const svcKeys = new ConsultRecordService(db, { audit: audit as never });
  const prosNoDraft = await svcKeys.get({ firmId: A.id, staffId: P.CASE_OFFICER.id, keys: ["agent/booking:edit", "agent/booking:list", "agent/prospect:lose"] } as never, bPros.id);
  const prosDraft = await svcKeys.get({ firmId: A.id, staffId: P.CASE_OFFICER.id, keys: ["agent/booking:edit", "agent/retainer:draft"] } as never, bPros.id);
  ok("FO-3a2 DW5 fail: on a prospect, a person with agent/booking:edit but no agent/retainer:draft gets no step; with it, PREPARE_RETAINER",
    prosNoDraft.nextSteps.length === 0 && prosDraft.nextSteps.join() === "PREPARE_RETAINER", { prosNoDraft: prosNoDraft.nextSteps, prosDraft: prosDraft.nextSteps });

  // ---------------------------------------------------------------- text as typed (break m1, m4, m5, m6 of round 1)
  await clock.set(at("2026-10-26 08:00"));
  const bText = await make(TO.id, lead, "2026-10-29 09:00");
  await clock.set(at("2026-10-29 17:00"));
  await attend(bText.id, "COMPLETED");
  const emoji = "🙂".repeat(10_000);
  const textSave = await go("PUT", rec(bText.id), P.OWNER, { notes: emoji, recommended: ["Work permit", "work  permit", "WORK PERMIT", "Que\u0301bec", "Québec", " Translation ", "اقامت\u200cدائم", "𝒜".repeat(100)] });
  ok("FO-3a2 text pass: 10,000 characters of emoji save (counted in characters, as the database does); items keep one of each name whatever its case, spacing or accent form; a zero-width non-joiner inside a Persian name is kept; 100 four-byte letters fit",
    textSave.status === 200 && [...textSave.body.notes].length === 10_000 && textSave.body.recommended.join("|") === `Work permit|Québec|Translation|اقامت\u200cدائم|${"𝒜".repeat(100)}`, textSave.body.recommended ?? textSave);
  const textBad = { nul: await go("PUT", rec(bText.id), P.OWNER, { version: 1, notes: "a\u0000b" }), nulItem: await go("PUT", rec(bText.id), P.OWNER, { version: 1, recommended: ["a\u0000b"] }),
    tooLong: await go("PUT", rec(bText.id), P.OWNER, { version: 1, notes: `${emoji}🙂` }), invisible: await go("PUT", rec(bText.id), P.OWNER, { version: 1, recommended: ["\u200b"] }),
    plain: await (async () => { const r = await fetch(`${base}/api/front-office/bookings/${bText.id}/consult-record`, { method: "PUT", headers: { authorization: `Bearer ${P.OWNER.token}`, "content-type": "text/plain" }, body: "hello" }); return { status: r.status }; })(),
    array: await go("PUT", rec(bText.id), P.OWNER, [] as unknown as object) };
  const textKept = await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bText.id } });
  ok("FO-3a2 text fail: a NUL in notes or an item → 422; 10,001 characters → 422; an item of only a zero-width space → 422; a text/plain body → 415; an array → 422; the record is unchanged",
    textBad.nul.status === 422 && textBad.nulItem.status === 422 && textBad.tooLong.status === 422 && textBad.invisible.status === 422 && textBad.plain.status === 415 && textBad.array.status === 422
      && textKept.version === 1 && textKept.recommended.length === 5, Object.fromEntries(Object.entries(textBad).map(([k, v]) => [k, v.status])));
  const blank = await go("PUT", rec(bText.id), P.OWNER, { version: 1, notes: "   " });
  const { ConsultRecordRead } = await import("../ports/consult-record.ts");
  const textRead = await new ConsultRecordService(db, { audit: audit as never }).read(db, A.id, textSave.body.id);
  ok("FO-3a2 text: the port's own schema accepts what the API saved (lengths in code points on both sides, review n1)", ConsultRecordRead.safeParse(textRead).success, textRead);
  ok("FO-3a2 text: notes of only spaces are stored as none", blank.status === 200 && blank.body.notes === null, blank.body);

  // ------------------------------------------------------------------------------------------ DW6: the port contract
  const svc = new ConsultRecordService(db, { audit: audit as never });
  const adapter = new PgConsultRecords(svc, db);
  const expected = await adapter.read(db, A.id, co.body.id);
  ok("FO-3a2 DW6: the adapter reads the Case Officer's record (lead, Work permit, CAD 150.00)", expected?.partyRef?.kind === "lead" && expected?.quotedFee?.amountMinor === 15000 && expected?.recommended.join() === "Work permit", expected);
  const harness = (port: ConsultRecordPort<any>): ConsultRecordHarness => ({ port, firmId: A.id, otherFirmId: B.id, expected: expected!, inTransaction: (fn) => db.$transaction((tx) => fn(tx)) });
  const fake = fakeConsultRecords(); fake.add(A.id, expected!);
  const rr = await runContract(consultRecordPortContract, "PgConsultRecords", () => harness(adapter), ok);
  const rf = await runContract(consultRecordPortContract, "fakeConsultRecords", () => harness(fake), ok);
  ok("FO-3a2 DW6 pass: ConsultRecordPort's contract passes on the adapter and on the fake (the same cases)", rr.failed.length === 0 && rf.failed.length === 0 && rr.passed.length === rf.passed.length && rr.passed.length >= 4);
  const broken: ConsultRecordPort<any> = { read: async (tx, _f, id) => adapter.read(tx, A.id, id) };   // ignores the firm it is asked for
  const rb = await runContract(consultRecordPortContract, "brokenIgnoresFirm", () => harness(broken), null);
  ok("FO-3a2 DW6 fail: an adapter that ignores the firm asked for fails the contract (another firm's id would read the record)", rb.failed.length > 0, rb);

  // --------------------------------------------------------------------------------------------- DW7: the audit
  const lines = audit.entries.filter((e) => e.entity === "fo_consult_record");
  const saves = [first, cad, curOnly, co, host, caseRec, leadSteps, casePros, textSave, blank].length;
  ok(`FO-3a2 DW7 pass: every save has one audit line with before and after (${saves} saves, ${lines.length} lines; the first "created", later ones "changed")`,
    lines.length === saves && lines[0].action === "booking.consult_record.created" && lines[0].detail.beforeTimeSpentMinutes === null && lines[0].detail.afterTimeSpentMinutes === 45
      && lines.some((l) => l.action === "booking.consult_record.changed" && l.detail.beforeTimeSpentMinutes === 45 && l.detail.afterTimeSpentMinutes === 35 && l.detail.afterQuotedFeeMinor === 15000), lines);
  ok("FO-3a2 DW7 fail: no refused save wrote a line, and no line holds the notes' text (facts only)",
    !JSON.stringify(lines).includes("Calgary") && !JSON.stringify(lines).includes("🙂") && !lines.some((l) => l.entityKey === "") && lines.every((l) => "notesChanged" in l.detail), lines.map((l) => l.detail));
  const failing = fakeAudit({ failOn: (e) => e.entity === "fo_consult_record" });
  const svcFail = new ConsultRecordService(db, { audit: failing as never });
  let threw = false;
  try { await svcFail.put({ firmId: A.id, staffId: P.OWNER.id, keys: [] } as never, bPros.id, { timeSpentMinutes: 99 }); } catch { threw = true; }
  ok("FO-3a2 DW7 fail: a forced audit failure rolls the save back (fail-closed)", threw && (await db.foConsultRecord.findFirstOrThrow({ where: { bookingId: bPros.id } })).timeSpentMinutes !== 99);
} catch (e) {
  fail++; console.log(`FAIL  FO-3a2: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
