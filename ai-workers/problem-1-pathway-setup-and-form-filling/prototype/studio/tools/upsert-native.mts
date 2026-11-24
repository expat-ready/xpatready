// M1 (Lead 24, 24 Nov, on #3428): which of api/src's upserts Prisma 7.8 runs natively (one INSERT ... ON CONFLICT ... DO
// UPDATE) and which as several statements (select, then insert or update). Read from the SQL Prisma logs, not assumed:
// each app upsert's shape (its model, its unique where, update empty or not) runs once on a scratch database with every
// migration, as the owner, inside a transaction with foreign keys and triggers off (session_replication_role = replica)
// that is always rolled back. Every other required column gets a placeholder of its type. US$0, no network.
//   tsx studio/tools/upsert-native.mts            one line per app upsert: NATIVE, or SPLIT with the statements
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_upsert_native_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;

/** Each upsert in api/src (file:line on 24 Nov), by shape: the model, its table, the unique where (compound name or a
 *  single field), and whether `update` is empty. The create always repeats the where's values, as every site does. */
type Site = { at: string; model: string; table: string; where: string[]; compound?: string; update: "empty" | string[] };
const SITES: Site[] = [
  { at: "library-deletions.ts:10", model: "libraryFormDeletion", table: "library_form_deletion", where: ["workspaceId", "formKey"], compound: "workspaceId_formKey", update: ["deletedBy"] },
  { at: "platform/identity/service.ts:364", model: "platformStaffCredential", table: "platform_staff_credential", where: ["firmId", "staffId"], compound: "firmId_staffId", update: ["updatedBy"] },
  { at: "platform/settings.ts:79", model: "platformSettingDefinition", table: "platform_setting_definition", where: ["key"], update: ["label"] },
  { at: "platform/settings.ts:167", model: "platformSettingDefinition", table: "platform_setting_definition", where: ["key"], update: ["label"] },
  { at: "platform/settings.ts:171", model: "platformFirmSetting", table: "platform_firm_setting", where: ["firmId", "key"], compound: "firmId_key", update: ["changedBy"] },
  { at: "platform/settings/notifications/service.ts:63", model: "platformNotificationPreference", table: "platform_notification_preference", where: ["staffId", "group"], compound: "staffId_group", update: ["inApp"] },
  { at: "platform/settings/offices/service.ts:171", model: "platformStaffOffice", table: "platform_staff_office", where: ["staffId"], update: ["setBy"] },
  { at: "core.ts:133", model: "workspace", table: "workspace", where: ["key"], update: "empty" },
  { at: "form-library.ts:478", model: "combinationForm", table: "combination_form", where: ["id"], update: ["formKey"] },
  { at: "finder.ts:610", model: "govFormDef", table: "gov_form_def", where: ["workspaceId", "formKey"], compound: "workspaceId_formKey", update: ["formPageUrl"] },
  { at: "finder.ts:713", model: "govFormDef", table: "gov_form_def", where: ["workspaceId", "formKey"], compound: "workspaceId_formKey", update: "empty" },
  { at: "finder.ts:858", model: "formEditionAccept", table: "form_edition_accept", where: ["formEditionId", "account"], compound: "formEditionId_account", update: "empty" },
  { at: "finder.ts:868", model: "formEditionAccept", table: "form_edition_accept", where: ["formEditionId", "account"], compound: "formEditionId_account", update: "empty" },
  { at: "official-pages.ts:85", model: "officialPagesRecord", table: "combination_official_pages", where: ["combinationId"], update: ["workspaceId"] },
  { at: "studio.ts:154", model: "personPreference", table: "person_preference", where: ["actor", "key"], compound: "actor_key", update: ["value"] },
  { at: "studio.ts:742", model: "sqrSectionSelection", table: "sqr_section_selection", where: ["combinationId", "sectionKey"], compound: "combinationId_sectionKey", update: "empty" },
  { at: "front-office/booking/settings/availability.ts:192", model: "foTypeHostSet", table: "fo_type_host_set", where: ["firmId", "typeId", "staffId"], compound: "firmId_typeId_staffId", update: ["setId"] },
  { at: "front-office/assignment/rules.ts:69", model: "foAssignmentRule", table: "fo_assignment_rule", where: ["firmId", "criteriaKey"], compound: "firmId_criteriaKey", update: ["strategy"] },
  { at: "lines-bulk.ts:391", model: "combinationForm", table: "combination_form", where: ["id"], update: ["formKey"] },
  { at: "lines-bulk.ts:392", model: "documentRequirement", table: "document_requirement", where: ["id"], update: ["label"] },
  { at: "case-prepare.ts:262", model: "filingApplicant", table: "filing_applicant", where: ["filingId", "subjectId"], compound: "filingId_subjectId", update: ["role"] },
  { at: "lifecycle.ts:450", model: "formEditionAccept", table: "form_edition_accept", where: ["formEditionId", "account"], compound: "formEditionId_account", update: ["channels"] },
  { at: "sources.ts:892", model: "govFormDef", table: "gov_form_def", where: ["workspaceId", "formKey"], compound: "workspaceId_formKey", update: "empty" },
];

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
// A placeholder can break a CHECK rule the real value keeps: the scratch copy drops every CHECK (it is thrown away).
execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-c", "do $$ declare r record; begin for r in select conrelid::regclass t, conname from pg_constraint where contype = 'c' and connamespace = 'public'::regnamespace loop execute format('alter table %s drop constraint %I', r.t, r.conname); end loop; end $$"]);
const { Prisma } = await import("@prisma/client");
const scalars = (model: string) => new Set(((Prisma as unknown as { dmmf: { datamodel: { models: { name: string; fields: { name: string; kind: string }[] }[] } } }).dmmf.datamodel.models.find((m) => m.name.toLowerCase() === model.toLowerCase())?.fields ?? []).filter((f) => f.kind === "scalar").map((f) => f.name));
const logged: string[] = [];
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }), log: [{ emit: "event", level: "query" }] });
(db as unknown as { $on: (e: "query", f: (q: { query: string }) => void) => void }).$on("query", (q) => logged.push(q.query));
type Col = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const enums = new Map<string, string>();
for (const r of await db.$queryRawUnsafe<{ t: string; l: string }[]>("select t.typname t, min(e.enumlabel) l from pg_enum e join pg_type t on t.oid = e.enumtypid group by t.typname")) enums.set(r.t, r.l);
const sample = (c: Col): unknown => {
  if (c.data_type === "ARRAY") return [];
  if (c.data_type === "USER-DEFINED") return enums.get(c.udt_name) ?? "x";
  if (c.udt_name === "uuid") return randomUUID();
  if (/^int|numeric|float|double/.test(c.udt_name)) return 1;
  if (c.udt_name === "bool") return false;
  if (/^timestamp|^date/.test(c.udt_name)) return new Date();
  if (/^json/.test(c.udt_name)) return {};
  if (c.udt_name === "bytea") return Buffer.from("x");
  return "x";
};
let failed = 0;
try {
  for (const s of SITES) {
    const cols = await db.$queryRawUnsafe<Col[]>("select column_name, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = $1", s.table);
    if (!cols.length) { console.log(`${s.at.padEnd(52)} ?      table ${s.table} not found`); failed++; continue; }
    const byField = new Map(cols.map((c) => [camel(c.column_name), c]));
    const where = Object.fromEntries(s.where.map((f) => [f, sample(byField.get(f)!)]));
    const create: Record<string, unknown> = { ...where };
    for (const c of cols) if (c.is_nullable === "NO" && c.column_default === null && !(camel(c.column_name) in create)) create[camel(c.column_name)] = sample(c);
    // A non-empty update: one real scalar field of the model that is not part of the where (the site's own fields vary).
    const fields = scalars(s.model), pick = [...fields].find((f) => !s.where.includes(f) && f !== "id" && byField.has(f) && !/At$/.test(f));
    const update = s.update === "empty" ? {} : pick ? { [pick]: sample(byField.get(pick)!) } : {};
    const args = { where: s.compound ? { [s.compound]: where } : where, create, update };
    logged.length = 0;
    const out = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("set local session_replication_role = replica");
      const from = logged.length;
      await (tx as unknown as Record<string, { upsert: (a: unknown) => Promise<unknown> }>)[s.model].upsert(args);
      const sql = logged.slice(from).filter((q) => !/^\s*(BEGIN|COMMIT|ROLLBACK|SET)/i.test(q));
      throw Object.assign(new Error("rollback"), { sql });
    }).catch((e: Error & { sql?: string[] }) => e.sql ? { sql: e.sql } : { error: e.message.split("\n").filter(Boolean).pop()!.slice(0, 160) });
    if ("error" in out) { console.log(`${s.at.padEnd(52)} ?      ${out.error}`); failed++; continue; }
    const native = out.sql.length === 1 && /on conflict/i.test(out.sql[0]);
    const verb = (q: string) => (/^\s*select/i.test(q) ? "SELECT" : /^\s*insert/i.test(q) ? (/on conflict/i.test(q) ? "INSERT…ON CONFLICT" : "INSERT") : /^\s*update/i.test(q) ? "UPDATE" : q.trim().split(/\s+/)[0].toUpperCase());
    console.log(`${s.at.padEnd(52)} ${native ? "NATIVE" : "SPLIT "} ${s.compound ?? s.where[0]}${s.update === "empty" ? ", update {}" : ""}: ${out.sql.map(verb).join(" → ")}`);
  }
} finally {
  await db.$disconnect().catch(() => {});
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* prune-test-dbs.sh */ }
}
process.exit(failed ? 1 : 0);
