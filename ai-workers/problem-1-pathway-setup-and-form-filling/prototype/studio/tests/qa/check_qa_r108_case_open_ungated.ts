// RETIRED 21 Nov 2026: QA-621 closed under the tech lead's ruling (P-294 Option C, #2716): the persona door must make no
// client in a production configuration (tests/check_qa621_persona_door_production.ts). This check asks for a refusal in the
// local configuration, which the ruling does not require: it stays red by design and is not run. Kept as the record.
// qa capability R1.108 (21 Nov; QA-621): "no client without a recorded check". Opening a case with no client named
// (the Open a case dialog, web/src/runtime/cases.tsx: it sends no clientId) makes a new client through newClient
// (api/src/runtime.ts:347, api/src/clients.ts:49), and with it a front-office person, with no conflict check at all.
// Expected (R1.108 Done when; FO-13c's gate): the opening is refused until a check is recorded (409 CONFLICT_CHECK_REQUIRED,
// or the opening only reuses a checked client), and no client row is made. Actual on main a66044692: 201, one new
// case_client and no fo_conflict_check row for its person. Fails while QA-621 is open; passes when fixed.
// Sample firms and a released Visitor visa, as J-72 sets them up. US$0, no model call, never :4400.
//   zsh tools/isolated.sh qa_r108 4473 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh tools/isolated.sh qa_r108 4473 stop' EXIT && tsx --tsconfig api/tsconfig.json tests/qa/check_qa_r108_case_open_ungated.ts qa_r108 4473
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "qa_r108", Number(process.argv[3] ?? 4473)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!vv()) await api(null, "POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv();
const [rid, email] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");
const si = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true });
if (!si.body?.token) { console.error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${si.body?.detail}`); process.exit(2); }
const T = si.body.token as string;
ok("QA-621 setup: a released Visitor visa and a signed-in staff member of the Sample firm", !!VV && !!rid);

const name = `Unchecked ${Date.now().toString(36)}`;
const clientsBefore = Number(sql(`select count(*) from case_client`));
// The body the Open a case dialog sends (web/src/runtime/cases.tsx): no clientId.
const open = await api(null, "POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: name }, idempotencyKey: crypto.randomUUID() }, "user-O");
const made = Number(sql(`select count(*) from case_client`)) - clientsBefore;
const person = sql(`select cc.fo_person_id from case_client cc join runtime_case c on c.client_id = cc.id where c.id = '${open.body?.id ?? "00000000-0000-0000-0000-000000000000"}'`);
const checks = person ? Number(sql(`select count(*) from fo_conflict_check where person_id = '${person}'`) || 0) : 0;
console.log(`      the opening answered ${open.status}${open.body?.code ? ` ${open.body.code}` : ""}; clients made: ${made}; conflict checks for its person: ${checks}`);
ok("QA-621: opening a case with no client named is refused until a conflict check is recorded (R1.108: no client without a recorded check)",
  open.status === 409 && open.body?.code === "CONFLICT_CHECK_REQUIRED", { status: open.status, code: open.body?.code, detail: open.body?.detail });
ok("QA-621: the refused opening makes no client", made === 0, { made, checks });
await db.$disconnect();
process.exit(summary() ? 1 : 0);
