// qa, QA-477 retest (FO-2v, #1933; Lead B's rule on #1929): one own-versus-all rule for agent/prospect. With the firm
// setting "everyone sees all" off, the Owner sees only their own leads, as for retainers; with it on (and view.all), all.
// Run from prototype/: zsh studio/tools/isolated.sh qa477 4478 start --ttl 15 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//   && trap 'zsh studio/tools/isolated.sh qa477 4478 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa477_owner_own_leads.ts 4478 xr_studio_qa477
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4478), DBNAME = process.argv[3] ?? "xr_studio_qa477", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder(); const { sql: rawSql } = client(PORT, DBNAME); const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const call = async (m: string, p: string, t?: string, b?: unknown) => { const r = await fetch(`${BASE}${p}`, { method: m, headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), ...(b === undefined ? {} : { "content-type": "application/json" }) }, body: b === undefined ? undefined : JSON.stringify(b) }); let j: any = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, body: j }; };
const signIn = async (a: string) => (await call("POST", "/api/platform/session/local", undefined, { firmKey: "sample-firm", email: sql(`select email from platform_staff where actor_id = '${a}'`), secondStep: true })).body.token as string;
const owner = await signIn("user-R"), officer = await signIn("user-O"), firmA = sql(`select id from platform_firm where key = 'sample-firm'`), run = Date.now().toString(36);
const add = await call("POST", "/api/front-office/leads", officer, { requestId: randomUUID(), givenNames: `Qa${run}`, familyName: "Sample", email: `qa.${run}@qa477.example`, source: "Phone call (Sample)" });
const id = String(add.body?.id ?? ""); ok("setup: the Case Officer adds a lead and owns it", add.status === 201 && !!id, add.status);
const ws = await platformAuditWorkspaceId(db);
const setAll = (v: boolean) => writeSetting(db, { firmId: firmA, key: EVERYONE_SEES_ALL.key, value: v, by: "seed:qa-477", workspaceId: ws, reason: "qa QA-477" });
await setAll(false);
const offRead = await call("GET", `/api/front-office/leads/${id}`, owner), offList = await call("GET", "/api/front-office/leads?view=all", owner);
const inList = (l: any) => Array.isArray(l?.body) ? l.body.some((x: any) => x.id === id) : Array.isArray(l?.body?.items) ? l.body.items.some((x: any) => x.id === id) : null;
ok("QA-477: setting off, the Owner gets 404 on the Case Officer's lead (one rule, as retainers)", offRead.status === 404, offRead.status);
ok("QA-477: setting off, the Owner's list does not hold the Case Officer's lead", inList(offList) === false, { status: offList.status, has: inList(offList) });
await setAll(true);
const onRead = await call("GET", `/api/front-office/leads/${id}`, owner);
ok("QA-477 pass half: setting on (Owner holds view.all), the Owner reads the Case Officer's lead (200)", onRead.status === 200, onRead.status);
await db.$disconnect(); process.exitCode = summary() ? 1 : 0;
