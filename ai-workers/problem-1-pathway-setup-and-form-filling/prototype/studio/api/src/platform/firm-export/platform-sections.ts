// PF-11 part 1: the platform's own sections (firm profile, staff, roles, licences, settings, offices, terms, consents and
// withdrawals, messages and templates, complaints), each table whole for the firm, every column but those named like a
// secret (ports/audit.ts SECRET_FIELD), columns from the datamodel so an empty table keeps its header; never masked
// (AG-16-20). Contract gaps, each named in its row: custom fields (PF-22), Needs-you history (PF-20), import reports (PF-10,
// import-report viewers only), client money (FO-7*), the case side and client files (CS-X1). The front office: part 2,
// api/src/front-office/export/sections.ts.
import { Prisma } from "@prisma/client";
import { SECRET_FIELD } from "../../../../ports/audit.ts";
import type { ExportColumn, ExportSection, ModuleExportInput } from "../../../../ports/firm-export.ts";
import type { Tx } from "./registry.ts";

type Model = { name: string; dbName: string | null; fields: readonly { name: string; dbName?: string | null; kind: string; type: string }[] };
const NUMBER = new Set(["Int", "Float", "Decimal", "BigInt"]);

/** A section's table: [section key, title, Prisma model (its client delegate is the name in lower camel case), the order
 *  for a table with no `id` column (its key fields)]. */
export type TableSpec = readonly [string, string, string, (readonly string[] | undefined)?, (readonly string[])?];
// The 5th element: columns (database names) held back from this table though not named like a secret: a login secret's
// sha256, for one (part 2 review Major 2: a signer's one-time code and session).
/** The sections. */
const TABLES: readonly TableSpec[] = [
  ["firm-profile", "Firm profile", "PlatformFirm"], ["staff", "Staff", "PlatformStaff"], ["staff-roles", "Staff roles", "PlatformRoleGrant"],
  ["staff-licences", "Staff licences", "PlatformStaffCredential"], ["settings", "Firm settings", "PlatformFirmSetting"], ["offices", "Offices", "PlatformOffice"],
  ["terms-accepted", "Terms accepted", "PlatformTermsAcceptance"], ["consents", "Message consents", "MsgConsent"], ["consent-withdrawals", "Consent withdrawals", "MsgConsentWithdrawal"],
  ["message-templates", "Message templates", "MsgTemplate"], ["message-template-versions", "Message template versions", "MsgTemplateVersion"], ["messages", "Messages sent", "MsgOutbox"],
  ["message-events", "Message events", "MsgEvent"], ["complaints", "Complaints", "PlatComplaint"], ["complaint-events", "Complaint handling steps", "PlatComplaintEvent"],
];

const kindOf = (type: string): ExportColumn["kind"] => (NUMBER.has(type) ? "number" : type === "Boolean" ? "boolean" : type === "DateTime" ? "date" : "text");
const valueOf = (v: unknown, kind: ExportColumn["kind"]): string | number | boolean | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (kind === "number") return Number(v);
  if (kind === "boolean") return Boolean(v);
  return typeof v === "string" ? v : JSON.stringify(v);
};

/** One table as a section: every scalar column but the secret-named ones, the rows ordered by id (else by the spec's key
 *  fields; settings by key). Part 2: the front office's exporter reads its tables through this too. */
export async function tableSection(tx: Tx, firmId: string, [key, title, model, order, held]: TableSpec): Promise<ExportSection> {
  const m = (Prisma.dmmf.datamodel.models as readonly Model[]).find((x) => x.name === model);
  if (!m) throw new Error(`firm export: no model ${model}`);
  const fields = m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !SECRET_FIELD.test(f.dbName ?? f.name) && !held?.includes(f.dbName ?? f.name));
  // An amount in minor units (`<x>_minor` or `<x>_cents`) is a minor column naming its currency column: its own
  // `<x>_currency` when the table has one, else the table's `currency` (AG-16-22, port check; round 2 Minor 3).
  const names = new Set(fields.map((f) => f.dbName ?? f.name));
  const currencyOf = (k: string) => { const x = k.replace(/_(minor|cents)$/, ""); return x === k ? undefined : names.has(`${x}_currency`) ? `${x}_currency` : names.has("currency") ? "currency" : undefined; };
  const columns: ExportColumn[] = fields.map((f) => { const k = f.dbName ?? f.name, cur = NUMBER.has(f.type) ? currencyOf(k) : undefined;
    return f.kind === "enum" ? { key: k, kind: "text" } : cur ? { key: k, kind: "minor", currency: cur } : { key: k, kind: kindOf(f.type) }; });
  const where = model === "PlatformFirm" ? { id: firmId } : { firmId };
  const rows = await (tx as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[model[0].toLowerCase() + model.slice(1)].findMany({ where, orderBy: m.fields.some((f) => f.name === "id") ? { id: "asc" } : (order ?? ["key"]).map((k) => ({ [k]: "asc" })) });
  return { key, title, columns, rows: rows.map((r) => fields.map((f, i) => valueOf(r[f.name], columns[i].kind === "minor" ? "number" : columns[i].kind))) };
}

/** The platform module's exporter (registered by the feature file). */
export async function platformSections(firmId: string, tx: Tx): Promise<ModuleExportInput> {
  const sections: ExportSection[] = [];
  for (const t of TABLES) sections.push(await tableSection(tx, firmId, t));
  return { module: "platform", sections, files: [], words: "Client files and their closed dates come with the case side's sections; this download does not hold them yet (SA-2-33). Data import history (import batches, their rows and mappings) and client money (invoices, payments, trust entries) are not in this download yet either; they are added in a later version." };
}
