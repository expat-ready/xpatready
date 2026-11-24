// PF-11 part 1: the platform's own sections of the firm's download (brief "This part's sections"): firm profile, staff
// and roles (licences too), settings and offices, terms accepted, consents and withdrawals (PF-19a), messages and
// templates (PF-19), complaints (PF-21). Each table is read whole for the firm, every column but one named like a secret
// (ports/audit.ts SECRET_FIELD: passwords, tokens, hashes; never a person's details), its columns from the datamodel, so
// an empty table still has its header row. Personal data is never masked (AG-16-20). Not here yet (contract gaps, each
// named in its own row's PR): custom fields (PF-22), the Needs-you approval history (PF-20), import batch reports (PF-10,
// for a caller who may view import reports only), the front office (part 2), client money (FO-7*), the case side (CS-X1).
import { Prisma } from "@prisma/client";
import { SECRET_FIELD } from "../../../../ports/audit.ts";
import type { ExportColumn, ExportSection, ModuleExportInput } from "../../../../ports/firm-export.ts";
import type { Tx } from "./registry.ts";

type Model = { name: string; dbName: string | null; fields: readonly { name: string; dbName?: string | null; kind: string; type: string }[] };
const NUMBER = new Set(["Int", "Float", "Decimal", "BigInt"]);

/** The sections: [section key, title, Prisma model, the delegate's name]. */
const TABLES: readonly [string, string, string, string][] = [
  ["firm-profile", "Firm profile", "PlatformFirm", "platformFirm"],
  ["staff", "Staff", "PlatformStaff", "platformStaff"],
  ["staff-roles", "Staff roles", "PlatformRoleGrant", "platformRoleGrant"],
  ["staff-licences", "Staff licences", "PlatformStaffCredential", "platformStaffCredential"],
  ["settings", "Firm settings", "PlatformFirmSetting", "platformFirmSetting"],
  ["offices", "Offices", "PlatformOffice", "platformOffice"],
  ["terms-accepted", "Terms accepted", "PlatformTermsAcceptance", "platformTermsAcceptance"],
  ["consents", "Message consents", "MsgConsent", "msgConsent"],
  ["consent-withdrawals", "Consent withdrawals", "MsgConsentWithdrawal", "msgConsentWithdrawal"],
  ["message-templates", "Message templates", "MsgTemplate", "msgTemplate"],
  ["message-template-versions", "Message template versions", "MsgTemplateVersion", "msgTemplateVersion"],
  ["messages", "Messages sent", "MsgOutbox", "msgOutbox"],
  ["message-events", "Message events", "MsgEvent", "msgEvent"],
  ["complaints", "Complaints", "PlatComplaint", "platComplaint"],
  ["complaint-events", "Complaint handling steps", "PlatComplaintEvent", "platComplaintEvent"],
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
async function section(tx: Tx, firmId: string, [key, title, model, delegate]: (typeof TABLES)[number]): Promise<ExportSection> {
  const m = (Prisma.dmmf.datamodel.models as readonly Model[]).find((x) => x.name === model);
  if (!m) throw new Error(`firm export: no model ${model}`);
  const fields = m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !SECRET_FIELD.test(f.dbName ?? f.name));
  const columns = fields.map((f) => ({ key: f.dbName ?? f.name, kind: f.kind === "enum" ? "text" as const : kindOf(f.type) }));
  const where = model === "PlatformFirm" ? { id: firmId } : { firmId };
  const rows = await (tx as unknown as Record<string, { findMany(a: unknown): Promise<Record<string, unknown>[]> }>)[delegate].findMany({ where, orderBy: m.fields.some((f) => f.name === "id") ? { id: "asc" } : { key: "asc" } });
  return { key, title, columns, rows: rows.map((r) => fields.map((f, i) => valueOf(r[f.name], columns[i].kind))) };
}

/** The platform module's exporter (registered by the feature file). */
export async function platformSections(firmId: string, tx: Tx): Promise<ModuleExportInput> {
  const sections: ExportSection[] = [];
  for (const t of TABLES) sections.push(await section(tx, firmId, t));
  return { module: "platform", sections, files: [], words: "Client files and their closed dates come with the case side's sections; this download does not hold them yet (SA-2-33)." };
}
