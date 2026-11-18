// qa, R1.6 (map row 6): QA-477 retest through the running app, over HTTP. Lead B's ruling (rev 16.63 on #1953): "you
// see all of an area's records only with agent/prospect:view.all and the firm's everyone-sees-all on; otherwise your
// own", Owners and Admins included, the rule retainers already follow; FO-2v (#1933) builds it for leads.
//   O1 a Case Officer adds a lead (they own it);
//   O2 setting off: the Owner's GET of that lead is 404 and the Owner's list does not hold it (fails before FO-2v:
//      Owners and Admins saw every lead whatever the setting);
//   O3 setting off: the Case Officer still reads their own lead (own is never lost);
//   O4 setting on: the Owner (who holds view.all) reads it and lists it (not vacuous);
//   the setting is put back to on at the end.
// Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qa477v 4478 start --ttl 20 PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on \
//     && trap 'zsh studio/tools/isolated.sh qa477v 4478 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa477_owner_view.ts 4478 xr_studio_qa477v
// Sample rows only; US$0, no model call.
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4478), DBNAME = process.argv[3] ?? "xr_studio_qa477v", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
await seedSampleFirmsFrontOffice(db);
const run = Date.now().toString(36);
const call = async (method: string, path: string, token?: string, body?: unknown) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j: any = t; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: j };
};
const signIn = async (actor: string) => (await call("POST", "/api/platform/session/local", undefined, { firmKey: "sample-firm", email: sql(`select email from platform_staff where actor_id = '${actor}'`), secondStep: true })).body.token as string;
const owner = await signIn("user-R"), officer = await signIn("user-O");
ok("setup: the Owner and a Case Officer sign in", !!owner && !!officer);
const firmA = sql(`select id from platform_firm where key = 'sample-firm'`);
const ws = await platformAuditWorkspaceId(db);
const setEveryone = (value: boolean) => writeSetting(db, { firmId: firmA, key: EVERYONE_SEES_ALL.key, value, by: "seed:qa-477", workspaceId: ws, reason: "qa QA-477 retest" });
const listed = async (token: string, id: string) => {
  const l = await call("GET", "/api/front-office/leads?view=all", token);
  const items: any[] = Array.isArray(l.body) ? l.body : l.body?.items ?? l.body?.leads ?? [];
  return { status: l.status, has: items.some((x) => x.id === id) };
};

const add = await call("POST", "/api/front-office/leads", officer, { requestId: randomUUID(), givenNames: `Qa${run}`, familyName: "Sample", email: `qa.${run}@qa477.example`, source: "Phone call (Sample)" });
const leadId: string | undefined = add.body?.id;
ok("O1 the Case Officer adds a lead and owns it", add.status < 300 && !!leadId, add.body);

await setEveryone(false);
const ownerGetOff = await call("GET", `/api/front-office/leads/${leadId}`, owner);
const ownerListOff = await listed(owner, leadId!);
ok("O2 setting off: the Owner's GET of the Case Officer's lead is 404, nothing of it (QA-477; Lead B's one rule)", ownerGetOff.status === 404 && !JSON.stringify(ownerGetOff.body).includes(`Qa${run}`), { status: ownerGetOff.status });
ok("O2 setting off: the Owner's list does not hold it", ownerListOff.status === 200 && !ownerListOff.has, ownerListOff);
const officerOff = await call("GET", `/api/front-office/leads/${leadId}`, officer);
ok("O3 setting off: the Case Officer still reads their own lead", officerOff.status === 200 && officerOff.body?.id === leadId, officerOff.status);

await setEveryone(true);
const ownerGetOn = await call("GET", `/api/front-office/leads/${leadId}`, owner);
const ownerListOn = await listed(owner, leadId!);
ok("O4 setting on: the Owner (view.all) reads the lead (the check is not vacuous)", ownerGetOn.status === 200 && ownerGetOn.body?.id === leadId, ownerGetOn.status);
ok("O4 setting on: the Owner's list holds it", ownerListOn.status === 200 && ownerListOn.has, ownerListOn);

await db.$disconnect();
process.exit(summary() ? 1 : 0);
