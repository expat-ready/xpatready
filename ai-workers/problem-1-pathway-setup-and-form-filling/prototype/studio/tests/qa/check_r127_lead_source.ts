// qa R1.27 (FO-1a, map row 27 "Every lead carries a source"): the database's own refusal of a lead with no source, which
// FO-1a's pack does not test (fresh reader, 15 Nov). A firm set up by the product's seed (seedFirmFrontOffice), one
// person, then: a lead with door and source → saved (pass); with no source, a NULL source or no door → refused by the
// database with not-null (23502) (fail cases). No model call (US$0).
//   DATABASE_URL=postgresql://xr_studio@127.0.0.1:54329/xr_studio_qa_r127 tsx studio/tests/qa/check_r127_lead_source.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seedFirmFrontOffice } from "../../api/src/front-office/firm-seed.ts";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
let pass = 0, fail = 0;
const ok = (n: string, c: unknown, d?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${!c && d !== undefined ? ` — ${JSON.stringify(d).slice(0, 300)}` : ""}`); };
const code = async (q: string) => { try { await db.$executeRawUnsafe(q); return "saved"; } catch (e) { const m = String((e as Error).message); return /23502|null value in column/i.test(m) ? "not-null" : m.slice(0, 200); } };

async function main() {
  const key = `qa-r127-${process.pid}`;
  const firm = await db.platformFirm.create({ data: { key, operatingName: "Sample qa firm", countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  await db.$transaction((tx) => seedFirmFrontOffice(tx, firm.id, "qa:R1.27"));
  const person = randomUUID();
  await db.$executeRawUnsafe(`insert into fo_person (id, firm_id, given_names, email, created_by, updated_at) values ('${person}', '${firm.id}', 'Client A', 'client.a@example.com', 'qa', now())`);
  const lead = (cols: string, vals: string) => `insert into fo_lead (id, firm_id, person_id, created_by, updated_at${cols}) values ('${randomUUID()}', '${firm.id}', '${person}', 'qa', now()${vals})`;
  ok("R1.27 pass: a lead with its door and source is saved", (await code(lead(", door, source", ", 'MANUAL', 'WEBSITE'"))) === "saved");
  ok("R1.27 fail: a lead with no source given is refused by the database (not-null)", (await code(lead(", door", ", 'MANUAL'"))) === "not-null");
  ok("R1.27 fail: a lead with source NULL is refused by the database (not-null)", (await code(lead(", door, source", ", 'MANUAL', NULL"))) === "not-null");
  ok("R1.27 fail: a lead with no door is refused by the database (not-null)", (await code(lead(", source", ", 'WEBSITE'"))) === "not-null");
  const n = await db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from fo_lead where firm_id = '${firm.id}'`);
  ok("R1.27 underneath: exactly one lead saved", Number(n[0].n) === 1, n);
  console.log(`${pass} passed, ${fail} failed`);
  await db.$disconnect(); process.exit(fail ? 1 : 0);
}
main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
