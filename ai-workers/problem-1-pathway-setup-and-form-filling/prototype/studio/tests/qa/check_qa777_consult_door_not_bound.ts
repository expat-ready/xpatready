// QA-777 (qa 6, 24 Nov; #3433 question 3, Lead 24's ask): FO-3c's public consultation-agreement door is not bound to a
// browser. Once the client types the one-time code (P-564), the door answers the signing link for 30 minutes to anyone
// holding the emailed link, in any browser, with no code; and the door records consent to sign electronically before any
// code, so a forwarded link alone records "consented" for the client. Fails on main today; passes when FO-3c moves onto
// FO-6 part 4's door-code.ts (a session bound to the browser, 4b) as Lead 24 ruled on #3433.
// The flow is the running app's own, over HTTP, as a person's browsers would make it: Client C (a licensed Case Officer)
// books Client P through the staff route; the copy's poller sends the agreement; the link and the code are read from the
// copy's demo inbox (the local email adapter); browser A (the client) and browser B (whoever the link was forwarded to)
// are two Playwright browser contexts, each with its own cookies, and post to POST /api/public/consultation-agreements/open.
// No client page for the door exists on main (the link opens at the signing vendor's side): the door is that API.
// Every value is Sample; US$0; no live mail; live AI off. Unconfirmed: no counsel (AG-5-21 "a forwarded link cannot be
// reused" is the team's requirement, not a legal reading). Run from prototype/:
//   zsh studio/tools/isolated.sh qa777 4476 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa777 4476 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa777_consult_door_not_bound.ts qa777 4476
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, type APIRequestContext } from "playwright";
import { recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "qa777", PORT = Number(process.argv[3] ?? 4476), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, STUDIO = join(import.meta.dirname, "..", "..");
const FILES = join(STUDIO, "var", `isolated-${NAME}`, "front-office-files");
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedFirmFrontOffice } = await import("../../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, CLOSED_DAYS, writeSetting } = await import("../../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../../api/src/platform/audit/audit-event.ts");
const { wallToUtc } = await import("../../api/src/front-office/booking/slots.ts");
const { LocalFiles } = await import("../../api/src/front-office/files.ts");
const { Retainers } = await import("../../api/src/front-office/retainers/service.ts");
const { buildDocx } = await import("../../api/src/front-office/retainers/docx.ts");
const TZ = "America/Toronto", DAY = 86_400_000, KEY = "maple777";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the journeys do
type Ans = { status: number; body: any };
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};

const browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
try {
  // ------------------------------------------------------------------------------------------ set-up (as j_104, Sample)
  if (await db.platformFirm.findUnique({ where: { key: KEY } })) { console.error(`STOP  firm ${KEY} exists: start a fresh copy`); process.exit(2); }
  const M = await db.platformFirm.create({ data: { key: KEY, operatingName: "Maple Immigration (Sample)", countryCode: "CA", status: "ACTIVE", contactEmail: `hello@${KEY}.example` } });
  await db.$transaction((tx) => seedFirmFrontOffice(tx, M.id));
  const ws = await platformAuditWorkspaceId(db as never);
  for (const [k, v] of [[TIME_ZONE.key, TZ], [CLOSED_DAYS.key, []], [EVERYONE_SEES_ALL.key, true]] as const) await writeSetting(db, { firmId: M.id, key: k, value: v, by: "system:test", workspaceId: ws });
  const person = async (name: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId: M.id, email: `${name.replace(/\W/g, "").toLowerCase()}@${KEY}.example`, displayName: name } });
    await db.platformRoleGrant.create({ data: { firmId: M.id, staffId: s.id, role: role as never, grantedBy: "seed:qa777" } });
    return s;
  };
  const F = await person("Client F", "OWNER"), C = await person("Client C", "CASE_OFFICER");
  await db.platformStaffCredential.create({ data: { firmId: M.id, staffId: C.id, representativeType: "RCIC", licensingBody: "College of Immigration and Citizenship Consultants (Sample)", licenceNumber: "R000777 (Sample)", updatedBy: "seed:qa777" } });
  await db.foAvailability.createMany({ data: [F, C].flatMap((h) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ firmId: M.id, staffId: h.id, weekday, startMinute: 480, endMinute: 1080, timeZone: TZ }))) });
  const type = await db.foConsultationType.create({ data: { firmId: M.id, slug: "free-consultation", name: "Free consultation", purpose: "FREE_CONSULT" as never, modes: ["VIDEO"], hostStaffIds: [C.id], minutes: 30, windowDays: 60, minNoticeMinutes: 0 } });
  const P = await db.foPerson.create({ data: { firmId: M.id, givenNames: "Client P", familyName: "Sample", email: "clientp@client777.example", createdBy: "test" } });
  await db.foLead.create({ data: { firmId: M.id, personId: P.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: C.id, createdBy: "test" } });
  const files = new LocalFiles(FILES);
  const ctxOf = (s: { id: string; firmId: string }) => ({ staffId: s.id, firmId: s.firmId, firmKey: KEY, roles: [], keys: [], duties: [], authTime: 0, via: "local" }) as never;
  const TEMPLATE = ["# Consultation agreement (Sample)", "Client: {client.name} ({client.email})", "Licensee: {representative.name}, {representative.licensing_body}, {representative.licence_number}", "{#fees}", "{label}: {amount}", "{/fees}"];
  const bytes = buildDocx(TEMPLATE);
  const tpl = await new Retainers(db, files, { now: () => Date.now() }).uploadTemplate(ctxOf(F), { name: "Consultation agreement (Sample)", kind: "CONSULTATION" }, { bytes, size: bytes.length } as never).catch((e: unknown) => ({ error: String(e) }));
  const sc = await j("POST", "/api/platform/session/local", { firmKey: KEY, email: C.email, secondStep: true });
  const tc = String(sc.body?.token ?? "");
  ok("QA-777 setup: firm maple777 (Sample), a licensed Case Officer (Client C) signed in, a lead (Client P) with an email, the Owner's CONSULTATION template", "id" in (tpl as object) && !!tc, { tpl, signIn: sc.status });

  // ----------------------------------------------------------------- Client C books Client P; the running copy sends the agreement
  const day = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10), [y, mo, d] = day.split("-").map(Number);
  const startsAt = wallToUtc(y, mo, d, 10 * 60, TZ)!;
  const bk = await j("POST", "/api/front-office/bookings", { typeId: type.id, personId: P.id, mode: "VIDEO", startsAt: startsAt.toISOString(), timeZone: TZ, hostStaffId: C.id }, tc);
  const inbox = async () => ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(P.email!)}`)).body?.messages ?? []) as { subject: string; body: string }[];
  let link = "";
  for (let i = 0; i < 60 && !link; i++) { link = (await inbox()).map((m) => m.body.match(/consultation-agreement#([0-9a-f]{32}\.[\w-]{43})/)?.[1]).find(Boolean) ?? ""; if (!link) await wait(1000); }
  ok("QA-777 setup: Client C books Client P three days ahead through the staff route (201); the running copy sends the agreement and its email with the link reaches Client P's inbox",
    [200, 201].includes(bk.status) && !!link, { booking: bk.status, detail: bk.body?.detail ?? null, link: !!link });
  if (!link) throw new Error("no link: the walk cannot go on");

  // -------------------------------------------------------------------- browser A: the client, consent then the code
  const A: APIRequestContext = (await browser.newContext({ userAgent: "Client P's laptop (Sample)" })).request;
  const B: APIRequestContext = (await browser.newContext({ userAgent: "Someone else's phone (Sample)" })).request;
  const open = async (who: APIRequestContext, body: Record<string, unknown>) => { const r = await who.post(`${BASE}/api/public/consultation-agreements/open`, { data: { token: link, ...body } }); return { status: r.status(), body: await r.json().catch(() => null) } as Ans; };
  const signer = () => db.$queryRaw<{ consented: boolean; verified: boolean }[]>`select s.consented_at is not null as consented, s.code_verified_at is not null as verified from fo_signer s join fo_signature_request q on q.id = s.request_id where q.firm_id = ${M.id}::uuid and s.role = 'CLIENT' limit 1`;

  // B first, before the client ever opens it: a forwarded link alone records the client's consent (before any code).
  const b0 = await open(B, { consent: true });
  const afterB0 = (await signer())[0];
  ok("QA-777 (2) a forwarded link alone, before any code, does not record the client's consent to sign electronically (consent comes after the code proves the person)",
    !afterB0?.consented, { status: b0.status, codeNeeded: b0.body?.codeNeeded, consentedNow: afterB0?.consented });

  const a1 = await open(A, { consent: true });
  let code = "";
  for (let i = 0; i < 30 && !code; i++) { code = (await inbox()).map((m) => /code/i.test(m.subject + m.body) ? m.body.match(/\b(\d{6})\b/)?.[1] : undefined).find(Boolean) ?? ""; if (!code) await wait(1000); }
  const a2 = await open(A, { consent: true, code });
  ok("QA-777 control: browser A (the client) is asked for the code, gets it by email and, typing it, receives the signing link",
    a1.body?.codeNeeded === true && !!code && a2.status === 200 && !!a2.body?.link, { a1: [a1.status, a1.body?.codeNeeded], code: !!code, a2: [a2.status, !!a2.body?.link] });

  // --------------------------------------------------------- browser B: the forwarded link, no code, another browser
  const b1 = await open(B, { consent: true });
  ok("QA-777 (1) browser B, holding only the forwarded link (its own cookies, no code), is asked for the code and gets no signing link (AG-5-21: a forwarded link cannot be reused)",
    b1.body?.codeNeeded === true && !b1.body?.link, { status: b1.status, codeNeeded: b1.body?.codeNeeded, gotLink: !!b1.body?.link });
  const b2 = await open(B, {});
  console.log(`      browser B without even consent: ${b2.status} ${JSON.stringify({ consented: b2.body?.consented, codeNeeded: b2.body?.codeNeeded, link: !!b2.body?.link })}`);
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
