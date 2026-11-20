// qa re-score of R1.33 (Phone numbers) after FO-9b #2405, 20 Nov (QA-526, QA-528; ruling P-747): an independent probe of
// every door that takes a phone, through the running copy's HTTP API (not the services FO-9b's own check calls), with
// inputs the builder's check does not use. Expected per P-747 / AG-2-84 rule 5: at an arrival door a readable number is
// stored E.164 and an impossible one is kept as typed, phone_readable false ("Fix number"), never refused; only the staff
// edit route refuses an impossible number on the field (422). Two spellings of one number are one person (possible match).
//   A1-A6 Add a lead (POST /front-office/leads): readable spellings, impossible/local-only/extension/non-ASCII digits kept;
//   A7    Add a lead with a second spelling of a number on file → 409 KNOWN_PERSON naming that person (the duplicate);
//   W1-W2 the public web form (POST /public/forms/:token/submissions): trunk-0 spelling E.164, "+999 1234567" kept unreadable;
//   B1-B2 the public booking door: "011 44 20 7946 0958" E.164; "555-0101" (no area code) booked and kept unreadable;
//   E1-E2 the staff edit route: "+999 1234567" 422 with the field's sentence; "+44 (0) 20 7946 0959" saved E.164;
//   E3    after Fix number makes a person's phone equal another's, the edited person's lead is flagged a possible match
//         (QA-526's side note: the edit route did not re-run the check) — reported, not a R1.33 Done-when clause.
// US$0, no model call. Run on an isolated copy started with PLATFORM_IDENTITY=local:
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r133_phone_doors_http.ts <name> <port>
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { copyFirmHoursTo } from "../../api/src/front-office/booking-seed.ts";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { UNREADABLE_PHONE } from "../../api/src/front-office/people/edit.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "qa_r133", Number(process.argv[3] ?? 4471)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const http = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const stored = (where: string) => sql(`select coalesce(phone,'-') || '|' || phone_readable || '|' || coalesce(phone_e164,'-') from fo_person where ${where} order by created_at desc limit 1`);

try {
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const [staffId, staffEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");
  const s = await http("POST", "/platform/session/local", { firmKey: "sample-firm", email: staffEmail, secondStep: true });
  const auth = { authorization: `Bearer ${s.body?.token}` };
  ok("R1.33 qa setup: firm A has a front office and its Owner is signed in", fo.failed.length === 0 && !!s.body?.token, { status: s.status, signedIn: !!s.body?.token });

  // ------------------------------------------------------------------------------------------ Add a lead
  const add = (given: string, phone: string, extra: Record<string, unknown> = {}) =>
    http("POST", "/front-office/leads", { requestId: randomUUID(), givenNames: `${given}${run}`, familyName: "Probe", phone, source: "Phone call (Sample)", ...extra }, auth);
  const cases: [string, string, string, string][] = [
    ["A1", "Uk", "+44 20 7946 0100", `+442079460100|true|+442079460100`],
    ["A2", "Ca", "416.555.0177", `+14165550177|true|+14165550177`],
    ["A3", "Imp", "+999 1234567", `+999 1234567|false|-`],
    ["A4", "Loc", "555-0101", `555-0101|false|-`],
    ["A5", "Ext", "416 555 0188 ext 22", `416 555 0188 ext 22|false|-`],
    ["A6", "Zero", "(000) 555-0100", `(000) 555-0100|false|-`],
  ];
  for (const [id, given, phone, want] of cases) {
    const r = await add(given, phone, { confirmedNew: true });
    const got = stored(`given_names = '${given}${run}'`);
    ok(`R1.33 qa ${id} (Add a lead): "${phone}" → 201, stored ${want.split("|").slice(0, 2).join(", readable ")}`, r.status === 201 && got === want, { status: r.status, got, body: r.status === 201 ? undefined : r.body });
  }
  const arabic = await add("Ar", "+١ ٤١٦ ٥٥٥ ٠١٩٩", { confirmedNew: true });
  const ar = stored(`given_names = 'Ar${run}'`);
  ok("R1.33 qa A6b (Add a lead): Arabic-Indic digits are accepted (201) and either read as +14165550199 or kept as typed, unreadable — never refused, never a wrong number",
    arabic.status === 201 && (ar === "+14165550199|true|+14165550199" || ar === "+١ ٤١٦ ٥٥٥ ٠١٩٩|false|-"), { status: arabic.status, ar });
  // A7: the duplicate — a second spelling of A1's and A2's numbers.
  const dupUk = await add("UkAgain", "+44 (0) 20 7946 0100");
  const dupCa = await add("CaAgain", "(416) 555-0177");
  const ukId = sql(`select id from fo_person where given_names = 'Uk${run}'`), caId = sql(`select id from fo_person where given_names = 'Ca${run}'`);
  ok("R1.33 qa A7 (duplicate): \"+44 (0) 20 7946 0100\" after \"+44 20 7946 0100\" → 409 KNOWN_PERSON naming the first person",
    dupUk.status === 409 && JSON.stringify(dupUk.body).includes(ukId), { s: dupUk.status, b: JSON.stringify(dupUk.body).slice(0, 300) });
  ok("R1.33 qa A7 (duplicate): \"(416) 555-0177\" after \"416.555.0177\" → 409 KNOWN_PERSON naming the first person",
    dupCa.status === 409 && JSON.stringify(dupCa.body).includes(caId), { s: dupCa.status, b: JSON.stringify(dupCa.body).slice(0, 300) });
  const dupImp = await add("ImpAgain", "+999 1234567");
  ok("R1.33 qa A7 (no false match): an unreadable \"+999 1234567\" typed again matches nothing (201)", dupImp.status === 201, dupImp.status);

  // ------------------------------------------------------------------------------------------ web form
  const wordingId = sql(`select consent_wording_version_id from fo_web_form where firm_id = '${A}' order by created_at limit 1`)
    || (await db.$transaction((tx) => new ConsentStore(auditEvent).publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: "Send me news from the firm by email. I can stop at any time. (Sample)", by: "seed:qa-r133" }))).id;
  const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wordingId}' where firm_id = '${A}' returning public_token`).split("\n")[0];
  const send = async (given: string, phone: string) => {
    const f = await http("GET", `/public/forms/${token}`);
    await new Promise((r) => setTimeout(r, 2_600));   // the form's minimum fill time
    return http("POST", `/public/forms/${token}/submissions`, { givenNames: `${given}${run}`, familyName: "Probe", phone, submissionId: f.body?.submissionId ?? randomUUID(), loadStamp: f.body?.loadStamp ?? "" }, { origin: BASE });
  };
  const w1 = await send("WfUk", "+44 (0) 161 496 0000");
  ok("R1.33 qa W1 (web form): \"+44 (0) 161 496 0000\" → 201, stored +441614960000 readable (the trunk 0 dropped, never +440…)",
    w1.status === 201 && stored(`given_names = 'WfUk${run}'`) === "+441614960000|true|+441614960000", { s: w1.status, b: w1.body, got: stored(`given_names = 'WfUk${run}'`) });
  const w2 = await send("WfImp", "+999 1234567");
  ok("R1.33 qa W2 (web form): \"+999 1234567\" → 201 (never refused), kept as typed, unreadable",
    w2.status === 201 && stored(`given_names = 'WfImp${run}'`) === "+999 1234567|false|-", { s: w2.status, b: w2.body, got: stored(`given_names = 'WfImp${run}'`) });

  // ------------------------------------------------------------------------------------------ booking door
  const slug = `qa133-${run}`;
  await copyFirmHoursTo(db, A, [staffId]);
  await db.foConsultationType.create({ data: { firmId: A, slug, name: "Free consultation (qa R1.33)", modes: ["VIDEO", "PHONE"], hostStaffIds: [staffId], minutes: 30 } });
  const book = async (given: string, phone: string, nth: number) => {
    const sl = await http("GET", `/public/firms/sample-firm/book/${slug}/slots?to=${encodeURIComponent(new Date(Date.now() + 40 * 86_400_000).toISOString())}`);
    const slots = (sl.body?.slots ?? []) as { startsAt: string }[];
    const stamp = sl.body?.formStamp;
    await new Promise((r) => setTimeout(r, 3_300));   // the booking form's minimum fill time (LIMITS.minFillSeconds 3)
    const body: Record<string, unknown> = { givenNames: `${given}${run}`, familyName: "Probe", email: `${given.toLowerCase()}.${run}@qa133.example`, phone, mode: "PHONE", startsAt: slots[nth]?.startsAt, timeZone: "America/Toronto", ...(stamp ? { formStamp: stamp } : {}) };
    return { r: await http("POST", `/public/firms/sample-firm/book/${slug}/bookings`, body), slots: slots.length, sl: sl.status, keys: Object.keys(sl.body ?? {}) };
  };
  const b1 = await book("BkUk", "011 44 20 7946 0101", 0);
  ok("R1.33 qa B1 (booking door): \"011 44 20 7946 0101\" → booked, stored +442079460101 readable",
    b1.r.status < 300 && stored(`given_names = 'BkUk${run}'`) === "+442079460101|true|+442079460101", { b1: { ...b1, r: { s: b1.r.status, b: JSON.stringify(b1.r.body).slice(0, 300) } }, got: stored(`given_names = 'BkUk${run}'`) });
  const b2 = await book("BkLoc", "555-0101", 1);
  ok("R1.33 qa B2 (booking door, P-747): \"555-0101\" with no area code → booked (never refused), kept as typed, unreadable",
    b2.r.status < 300 && stored(`given_names = 'BkLoc${run}'`) === "555-0101|false|-", { s: b2.r.status, b: JSON.stringify(b2.r.body).slice(0, 300), got: stored(`given_names = 'BkLoc${run}'`) });

  // ------------------------------------------------------------------------------------------ staff edit route
  const impId = sql(`select id from fo_person where given_names = 'Imp${run}'`);
  const e1 = await http("PATCH", `/front-office/people/${impId}`, { phone: "+999 1234567" }, auth);
  ok("R1.33 qa E1 (edit route): \"+999 1234567\" → 422 with the field's sentence, nothing saved", e1.status === 422 && e1.body?.fields?.phone === UNREADABLE_PHONE && stored(`id = '${impId}'`) === "+999 1234567|false|-", e1);
  const locId = sql(`select id from fo_person where given_names = 'Loc${run}'`);
  const e2 = await http("PATCH", `/front-office/people/${locId}`, { phone: "+44 (0) 20 7946 0959" }, auth);
  ok("R1.33 qa E2 (edit route): \"+44 (0) 20 7946 0959\" → 200, stored +442079460959 readable (keeps its country)", e2.status === 200 && stored(`id = '${locId}'`) === "+442079460959|true|+442079460959", { e2, got: stored(`id = '${locId}'`) });
  // E3: Fix number turns Ext's person into A2's number; is the edited person's lead now a possible match?
  const extId = sql(`select id from fo_person where given_names = 'Ext${run}'`);
  const e3 = await http("PATCH", `/front-office/people/${extId}`, { phone: "+1 416 555 0177" }, auth);
  const flag = sql(`select coalesce(possible_match_person_id::text,'-') from fo_lead where person_id = '${extId}'`);
  ok("R1.33 qa E3 (side note, not a Done-when clause): after Fix number gives a person another person's number, their lead is flagged a possible match",
    e3.status === 200 && flag === caId, { s: e3.status, flag, caId });
} finally {
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
