// FO-2pv (brief lead-b-briefs/FO-2pv.md; QA-530; AG-2-18 rules 3 and 5; R1.31): staff set a prospect's value and its
// currency through `PATCH /api/front-office/prospects/:id { value, currency }` (sales/prospect-edit.ts). A pass and a
// fail each, on one scratch database (every migration, the Sample seeds), dropped at the end. US$0, no model call.
//   DW1 setting CAD 1200.50 stores 120050 and CAD, and the board's totals read it;
//   DW2 a negative amount, three decimal places or an unknown currency → 422 at the field, nothing changes;
//   DW3 null clears the value;
//   DW4 another firm's prospect, or an unseen one under own-only → 404; the route needs agent/prospect:edit;
//   DW5 the audit line holds no amount.
//   tsx studio/tests/check_fo2pv_prospect_value.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { centsOf, CURRENCIES, CURRENCY_REFUSED, VALUE_REFUSED, VALUE_TOO_LARGE } from "../contracts/currencies.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { Corporate } from "../api/src/front-office/sales/corporate/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { ProspectEdit, ProspectEditController, VALUE_SET } from "../api/src/front-office/sales/prospect-edit.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { SalesPorts } from "../api/src/front-office/sales/public.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { CURRENCY, EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo2pv_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, any> } | null> {   // eslint-disable-line @typescript-eslint/no-explicit-any -- a refusal's body is read loosely, as in the other checks
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { error: String(e) } };
  }
}
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  ok("FO-2pv setup: both Sample firms and their front office are seeded", (await seedSampleFirmsFrontOffice(db)).failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const ctxOf = (actorId: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey: firmId === A ? "sample-firm" : "sample-solo", roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R"), O = ctxOf("user-O"), SOLO = ctxOf("user-S");
  const ws = await platformAuditWorkspaceId(db as never);
  const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "system:test", workspaceId: ws });
  await seesAll(true);
  const ports: SalesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, ports), pros = new Prospects(db, ports), corp = new Corporate(db, ports), edit = new ProspectEdit(db, ports, pros);
  let n = 0;
  const prospect = async (given: string, who: StaffContext = R) => {
    const l = (await leads.add(who, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string };
    return (await pros.engage(who, l.id)) as unknown as { id: string; number: string };
  };
  const stored = (id: string) => sql(`select coalesce(value_cents::text, 'null') || '|' || currency from fo_prospect where id = '${id}'`);
  const lines = (id: string) => Number(sql(`select count(*) from audit_event where entity_key = '${id}' and action = '${VALUE_SET}'`));
  const ana = await prospect("Ana"), ben = await prospect("Ben"), own = await prospect("Own");   // R's; Own stays R's for DW4

  // ------------------------------------------------------------------------------------------------ DW1: set a value
  const set = (await edit.value(R, ana.id, { value: "1200.50", currency: "CAD" })) as unknown as { valueCents: number; currency: string };
  ok("FO-2pv DW1 pass: CAD 1200.50 stores 120050 and CAD, and the answer is the prospect as read", stored(ana.id) === "120050|CAD" && set.valueCents === 120050 && set.currency === "CAD", [stored(ana.id), set.valueCents]);
  await edit.value(R, ben.id, { value: 99.9, currency: "USD" }); await edit.value(R, ana.id, { value: "1200.50", currency: "CAD" });
  const board = (await corp.board(R, "INDIVIDUAL")) as unknown as { totals: { currency: string; valueCents: number }[] };
  ok("FO-2pv DW1 pass (R1.31): a number (99.9) is taken as 9990 cents; the board's open totals then read CAD 1200.50 and USD 99.90 apart, never added", stored(ben.id) === "9990|USD" && JSON.stringify(board.totals.map((t) => [t.currency, t.valueCents])) === JSON.stringify([["CAD", 120050], ["USD", 9990]]), board.totals);
  ok("FO-2pv DW1 fail: the same value sent again writes nothing more (one audit line, not two)", lines(ana.id) === 1, lines(ana.id));
  ok("FO-2pv DW1 pass: every listed currency is one the runtime knows, three capital letters, no repeats; 0 and 9999999.99 are amounts", CURRENCIES.length > 100 && new Set(CURRENCIES).size === CURRENCIES.length && CURRENCIES.every((c) => /^[A-Z]{3}$/.test(c) && Intl.supportedValuesOf("currency").includes(c))
    && JSON.stringify([centsOf("0"), centsOf("9999999.99"), centsOf(" 7 ")]) === JSON.stringify([{ cents: 0 }, { cents: 999999999 }, { cents: 700 }]));

  // ----------------------------------------------------------------------------------------- DW2: refused at the field
  for (const [what, body, field, words] of [
    ["a negative amount", { value: "-5", currency: "CAD" }, "value", VALUE_REFUSED], ["a negative number", { value: -1, currency: "CAD" }, "value", VALUE_REFUSED], ["a number with three places (1.005)", { value: 1.005, currency: "CAD" }, "value", VALUE_REFUSED], ["three decimal places", { value: "10.123", currency: "CAD" }, "value", VALUE_REFUSED],
    ["an amount with a thousands comma", { value: "1,200", currency: "CAD" }, "value", VALUE_REFUSED], ["an exponent (1e3)", { value: "1e3", currency: "CAD" }, "value", VALUE_REFUSED],
    ["no value at all", { currency: "CAD" }, "value", VALUE_REFUSED], ["an amount over 9,999,999.99", { value: "10000000", currency: "CAD" }, "value", VALUE_TOO_LARGE],
    ["an unknown currency (XXQ)", { value: "5", currency: "XXQ" }, "currency", CURRENCY_REFUSED], ["a lower-case currency (cad)", { value: "5", currency: "cad" }, "currency", CURRENCY_REFUSED],
    ["no currency", { value: "5" }, "currency", CURRENCY_REFUSED],
  ] as const) {
    const r = await refusal(() => edit.value(R, ana.id, body));
    ok(`FO-2pv DW2 fail: ${what} → 422 at fields.${field} with the brief's words; nothing changes and no audit line is written`, r?.status === 422 && r.body.fields?.[field] === words && stored(ana.id) === "120050|CAD" && lines(ana.id) === 1, [r?.status, r?.body.fields, stored(ana.id)]);
  }
  ok("FO-2pv DW2 pass: the words are the brief's", VALUE_REFUSED === "Enter an amount of 0 or more, with at most 2 decimal places." && CURRENCY_REFUSED === "Choose a currency.");

  // ---------------------------------------------------------------------------------------------- DW3: null clears it
  const cleared = (await edit.value(R, ana.id, { value: null, currency: "CAD" })) as unknown as { valueCents: number | null };
  ok("FO-2pv DW3 pass: null clears the value (the currency stays), and the board's CAD total is gone", cleared.valueCents === null && stored(ana.id) === "null|CAD" && JSON.stringify(((await corp.board(R, "INDIVIDUAL")) as unknown as { totals: { currency: string }[] }).totals.map((t) => t.currency)) === JSON.stringify(["USD"]));
  ok("FO-2pv DW3 fail: an empty text is not null: it is refused at the field, and Ben's value stays", (await refusal(() => edit.value(R, ben.id, { value: "", currency: "USD" })))?.body.fields?.value === VALUE_REFUSED && stored(ben.id) === "9990|USD");

  // ------------------------------------------------------------------------------- DW4: other firms, own-only, the key
  const solo = await refusal(() => edit.value(SOLO, ben.id, { value: "1", currency: "CAD" })), bad = await refusal(() => edit.value(R, "not-a-uuid", { value: "1", currency: "CAD" }));
  ok("FO-2pv DW4 fail: another firm's Owner gets 404 for firm A's prospect, as an unknown id does; nothing changes", solo?.status === 404 && bad?.status === 404 && stored(ben.id) === "9990|USD", [solo?.status, bad?.status]);
  const mine = await prospect("Odo", O);   // the Case Officer's own
  await seesAll(false);
  const unseen = await refusal(() => edit.value(O, own.id, { value: "1", currency: "CAD" }));
  const seen = (await edit.value(O, mine.id, { value: "300", currency: "EUR" })) as unknown as { valueCents: number };
  ok("FO-2pv DW4 fail: with \"everyone sees all\" off, the Case Officer gets 404 for a colleague's prospect and nothing changes", unseen?.status === 404 && stored(own.id) === "null|CAD", [unseen?.status, stored(own.id)]);
  ok("FO-2pv DW4 pass: the same person sets the value of their own prospect (EUR 300)", seen.valueCents === 30000 && stored(mine.id) === "30000|EUR");
  await seesAll(true);
  const access = Reflect.getMetadata(PLATFORM_ACCESS, ProspectEditController.prototype.value) as unknown;
  ok("FO-2pv DW4 pass: the PATCH route declares agent/prospect:edit and no other key (PF-4's guard refuses a person without it)", JSON.stringify(access).includes('"agent/prospect:edit"') && !/agent\/prospect:(show|lose|convert|assign)/.test(JSON.stringify(access)), access);

  const d1 = await edit.currencies(R);
  await writeSetting(db, { firmId: A, key: CURRENCY.key, value: "USD", by: "system:test", workspaceId: ws });
  const d2 = await edit.currencies(R), d3 = await edit.currencies(SOLO);
  ok("FO-2pv pass: the panel is told the firm's default currency (CAD, then USD once the firm's setting says so; the other firm still CAD) and the fixed list", d1.default === "CAD" && d2.default === "USD" && d3.default === "CAD" && d2.currencies === CURRENCIES, [d1.default, d2.default, d3.default]);

  // --------------------------------------------------------------------------------------- DW5: the audit line (PF-23)
  const audit = sql(`select actor || '|' || summary || '|' || detail::text from audit_event where entity_key = '${ben.id}' and action = '${VALUE_SET}'`);
  ok("FO-2pv DW5 pass: one audit line by the typed staff actor names the prospect and the currency (USD)", audit.startsWith(`staff:${R.staffId}|`) && audit.includes(ben.number) && audit.includes('"currency": "USD"'), audit);
  // R1.8 (QA-594, P-687): the amounts are the line's before and after values (valueCents_before / _after), nowhere else.
  ok("FO-2pv DW5 pass (R1.8): the value edit's line holds the amount after it, as valueCents_after", /"valueCents_after": \d+/.test(audit), audit);
  ok("FO-2pv DW5 fail: no audit line of a value edit holds an amount in its words or ids (no 99.9, 9990, 1200.50, 120050, 300 or 30000 outside its before and after)", sql(`select count(*) from audit_event where action = '${VALUE_SET}' and (summary || (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(detail) e(k, v) where k !~ '_(before|after)$')::text) ~ '99\\.9|9990|1200|120050|30000|\\m300\\M'`) === "0" && lines(ana.id) === 2 && lines(mine.id) === 1);
} finally {
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the next run's dropdb */ }
}
console.log(`\nFO-2pv prospect value: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
