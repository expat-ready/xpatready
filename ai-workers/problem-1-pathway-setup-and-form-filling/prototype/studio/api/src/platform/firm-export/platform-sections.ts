// PF-11 part 1: the platform's own sections (firm profile, staff, roles, licences, settings, offices, terms, consents and
// withdrawals, messages and templates, complaints), each table whole for the firm, every column but those named like a
// secret (ports/audit.ts SECRET_FIELD), columns from the datamodel so an empty table keeps its header; never masked
// (AG-16-20). Contract gaps, each named in its row: custom fields (PF-22), Needs-you history (PF-20), import reports (PF-10,
// import-report viewers only), the front office (part 2), client money (FO-7*), the case side and client files (CS-X1).
import { Prisma } from "@prisma/client";
import { SECRET_FIELD } from "../../../../ports/audit.ts";
import type { ExportColumn, ExportSection, ModuleExportInput } from "../../../../ports/firm-export.ts";
import type { Tx } from "./registry.ts";

type Model = { name: string; dbName: string | null; fields: readonly { name: string; dbName?: string | null; kind: string; type: string }[] };
const NUMBER = new Set(["Int", "Float", "Decimal", "BigInt"]);

/** The sections: [section key, title, Prisma model (its client delegate is the name in lower camel case)]. */
const TABLES: readonly [string, string, string][] = [
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

/** One table as a section: every scalar column but the secret-named ones, the rows ordered by id (settings by key). */
async function section(tx: Tx, firmId: string, [key, title, model]: (typeof TABLES)[number]): Promise<ExportSection> {
  const m = (Prisma.dmmf.datamodel.models as readonly Model[]).find((x) => x.name === model);
  if (!m) throw new Error(`firm export: no model ${model}`);
  const fields = m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !SECRET_FIELD.test(f.dbName ?? f.name));
  const columns = fields.map((f) => ({ key: f.dbName ?? f.name, kind: f.kind === "enum" ? "text" as const : kindOf(f.type) }));
  const where = model === "PlatformFirm" ? { id: firmId } : { firmId };
  const rows = await (tx as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[model[0].toLowerCase() + model.slice(1)].findMany({ where, orderBy: m.fields.some((f) => f.name === "id") ? { id: "asc" } : { key: "asc" } });
  return { key, title, columns, rows: rows.map((r) => fields.map((f, i) => valueOf(r[f.name], columns[i].kind))) };
}

/** The platform module's exporter (registered by the feature file). */
export async function platformSections(firmId: string, tx: Tx): Promise<ModuleExportInput> {
  const sections: ExportSection[] = [];
  for (const t of TABLES) sections.push(await section(tx, firmId, t));
  return { module: "platform", sections, files: [], words: "Client files and their closed dates come with the case side's sections; this download does not hold them yet (SA-2-33). Data import history (import batches, their rows and mappings) and the front office's records (leads, bookings, retainers, invoices) are not in this download yet either; they are added in a later version." };
}
