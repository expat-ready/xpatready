// FO-5 part 2 (BACKLOG row FO-5; contracts §2.3, §2.6, §7 binding; concept fo-5s-retainer-signing r2 BR-1..BR-11; AG-5-3,
// -9, -16, -28, -34, -39, -49, -50, -64, -65): retainer and consultation agreements on the tables of part 1
// (front-office-retainers.prisma, migration 20261114210000_fo5_retainer_tables, whose triggers hold the same rules again).
// Every change runs in one transaction: the rows, one audit line through AuditPort (fail-closed: a failed line rolls the
// change back), then the outbox row last (contracts §0.5). Files are written to the FilesPort first, under keys named by
// the row (write-once, so a retry writes the same bytes and a lost transaction leaves only an unreferenced file).
// Reads and writes are firm-scoped: another firm's id is 404 (contracts §0.2). With "everyone sees all" off (PF-3's
// platform.everyone_sees_all), a person sees a prospect's retainers when they own the prospect, and the retainer's
// representative always sees it and the prospect's header (BR-3). Money is in cents, CAD.
import { Injectable } from "@nestjs/common";
import { Prisma, type FoRetainerFeeWhen, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EVENT, RetainerEventPayload, type EventName } from "../../../../ports/events.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import { auditEvent } from "../../platform/audit/audit-event.ts";
import { DUTY_KEYS, problem, type StaffContext } from "../../platform/identity/keys.ts";
import { EVERYONE_SEES_ALL, readSetting } from "../../platform/settings.ts";
import { DOCX, DocxRender, STARTER_KEY, UnreadableDocx, buildStarter, placeholdersOf, renderDocx, starterFrame } from "./docx.ts";
import { PLACEHOLDERS, WHEN_WORDS, cad, checkPlaceholders } from "./placeholders.ts";

type Tx = Prisma.TransactionClient;
const STUDIO = resolve(import.meta.dirname, "..", "..", "..", "..");
export const STARTER_TEXT = join(STUDIO, "samples", "fo5-starter-retainer.txt");
/** Sample limits (no source number: AG-5-47 asks for payload limits without one; Lead B to confirm). */
export const TEMPLATE_MAX_BYTES = 5 * 1024 * 1024;
export const OFFLINE_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const FEE_MAX_MINOR = 10_000_000_000n;
const WHENS = ["ON_SIGNING", "ON_DATE", "WHEN_SUBMITTED", "WHEN_DECIDED", "WHEN_DONE"] as const;
const EDITABLE = ["DRAFT", "SENT", "VIEWED", "DECLINED", "EXPIRED"];
const WITHDRAWABLE = ["SENT", "VIEWED", "CLIENT_SIGNED"];
const OFFLINE_FROM = ["DRAFT", "SENT", "VIEWED", "CLIENT_SIGNED"];
export const NO_LICENSED = "No active licensed consultant — add one";

/** A refusal with its field errors (422), a state refusal (409) or not found (404). */
const unprocessable = (detail: string, fields: Record<string, string> = {}, extra: Record<string, unknown> = {}): never => problem(422, "Check the details", detail, { code: "INVALID", fields, ...extra });
const conflict = (detail: string, code = "STATE"): never => problem(409, "Not possible now", detail, { code });
const notFound = (what = "retainer"): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });

export type FeeIn = { label: string; amountMinor: bigint | null; when: FoRetainerFeeWhen; dueOn: string | null };
export type Upload = { bytes: Uint8Array; size: number; contentType?: string };
type Clock = { now(): number };

const str = (v: unknown, max: number, what: string, field: string, required = true): string | null => {
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) { if (required) unprocessable(`${what} is required.`, { [field]: `${what} is required.` }); return null; }
  if (typeof v !== "string") return unprocessable(`${what} must be text.`, { [field]: `${what} must be text.` });
  const t = v.trim();
  if (t.length > max) unprocessable(`${what} is at most ${max} characters.`, { [field]: `At most ${max} characters.` });
  if (!/[^\s ​-‏⁠﻿]/.test(t)) unprocessable(`${what} is required.`, { [field]: `${what} is required.` });
  return t;
};
const uuidOf = (v: unknown, field: string): string | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return unprocessable(`${field} is not an id.`, { [field]: "Not an id." });
  return v.toLowerCase();
};

/** BR-5: fee rows in. Amounts in cents (whole numbers, 0 … CAD 100 million), empty while the draft has none. */
export function feesOf(v: unknown): FeeIn[] {
  if (!Array.isArray(v) || v.length > 50) return unprocessable("Fee rows are a list of at most 50.", { fees: "At most 50 rows." });
  return v.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>, at = `fees[${i}]`;
    const label = str(o.label, 120, "A fee row's label", `${at}.label`)!;
    let amountMinor: bigint | null = null;
    if (o.amountMinor !== undefined && o.amountMinor !== null && o.amountMinor !== "") {
      const s = String(o.amountMinor);
      if (!/^\d{1,11}$/.test(s) || BigInt(s) > FEE_MAX_MINOR) unprocessable("A fee amount is a whole number of cents up to CAD 100 million.", { [`${at}.amountMinor`]: "Cents, 0 to 10000000000." });
      amountMinor = BigInt(s);
    }
    const when = (o.when ?? "ON_SIGNING") as FoRetainerFeeWhen;
    if (!WHENS.includes(when as never)) unprocessable("When is one of On signing, On a date, When submitted, When decided, When done.", { [`${at}.when`]: "Pick when it is due." });
    let dueOn: string | null = null;
    if (o.dueOn !== undefined && o.dueOn !== null && o.dueOn !== "") {
      if (when !== "ON_DATE") unprocessable("Only an \"On a date\" fee has a date.", { [`${at}.dueOn`]: "Only for On a date." });
      const d = String(o.dueOn);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d || d < "2000-01-01" || d > "2200-12-31")
        unprocessable("A due date is a real date as YYYY-MM-DD.", { [`${at}.dueOn`]: "A date as YYYY-MM-DD." });
      dueOn = d;
    }
    return { label, amountMinor, when, dueOn };
  });
}

/** The service. `audit` defaults to the one trail (AuditEventAdapter until AUD-1); a test passes a failing one. */
export class Retainers {
  readonly render: DocxRender;
  constructor(private readonly db: PrismaClient, private readonly files: FilesPort, private readonly clock: Clock, private readonly audit: AuditPort<Tx> = auditEvent) {
    // The port's adapter resolves the starter's frame; a firm's template renders from its stored bytes (renderDocx).
    this.render = new DocxRender(async (k) => (k === STARTER_KEY ? starterFrame() : null));
  }

  // ------------------------------------------------------------------------------------------------- helpers
  private async seesAll(firmId: string) { return (await readSetting<boolean>(this.db, firmId, EVERYONE_SEES_ALL.key)) === true; }

  /** The firm's people who may represent (BR-3): active, a licence record, and the case-manager sign-off keys. */
  async representatives(firmId: string): Promise<{ staffId: string; name: string }[]> {
    const keys = [...DUTY_KEYS.represent];
    const rows = await this.db.$queryRaw<{ id: string; display_name: string }[]>(Prisma.sql`
      select s.id::text, s.display_name from platform_staff s
       join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id
      where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
        and (select count(distinct rp.permission_key) from platform_role_grant g join platform_role_permission rp on rp.role = g.role
              where g.firm_id = s.firm_id and g.staff_id = s.id and g.ended_at is null and rp.permission_key = any(${keys})) = ${keys.length}
      order by s.display_name, s.id`);
    return rows.map((r) => ({ staffId: r.id, name: r.display_name }));
  }

  private async prospectFor(ctx: StaffContext, prospectId: string, viaRepresentative = false) {
    const p = await this.db.foProspect.findFirst({
      where: { firmId: ctx.firmId, id: prospectId },
      include: { subjectPerson: true, subjectCompany: { include: { contacts: { where: { validTo: null }, include: { person: true }, orderBy: { validFrom: "asc" } } } }, primaryContact: true, stage: true },
    });
    if (!p) return notFound("prospect");
    if (!viaRepresentative && !(await this.seesAll(ctx.firmId)) && p.ownerStaffId !== ctx.staffId) return notFound("prospect");
    return p;
  }

  /** The retainer if the person may see it (firm, then visibility; the representative always may). */
  private async visible(ctx: StaffContext, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return notFound();
    const r = await this.db.foRetainer.findFirst({ where: { firmId: ctx.firmId, id } });
    if (!r) return notFound();
    if (r.representativeStaffId === ctx.staffId || (await this.seesAll(ctx.firmId))) return r;
    if (r.prospectId) {
      const p = await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id: r.prospectId }, select: { ownerStaffId: true } });
      if (p?.ownerStaffId === ctx.staffId) return r;
    } else if (r.createdBy === `staff:${ctx.staffId}`) return r;
    return notFound();
  }

  private async event(tx: Tx, firmId: string, type: EventName, payload: RetainerEventPayload) {
    await tx.moduleEvent.create({ data: { firmId, type, subjectId: payload.retainerId, payload: RetainerEventPayload.parse(payload) } });   // last (contracts §0.5)
  }

  private line(ctx: StaffContext, action: string, entityKey: string, summary: string, detail: Record<string, string | number | boolean | null> = {}) {
    return { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action, entity: "fo_retainer", entityKey, summary, detail };
  }

  // ----------------------------------------------------------------------------------------------- templates
  placeholders() { return { placeholders: PLACEHOLDERS.map((p) => ({ name: p.name, label: p.label, mustFill: !!p.mustFill, loop: !!p.loop })) }; }

  /** BR-1 (M5): the Sample starter, built at run time from the committed text by the render port. */
  async starter(): Promise<{ bytes: Uint8Array; contentType: string; filename: string; note: string }> {
    const doc = await buildStarter(this.render, readFileSync(STARTER_TEXT, "utf8"));
    return { ...doc, filename: "sample-retainer-starter.docx", note: "Sample wording. Unconfirmed: no counsel." };
  }

  /** Reads an uploaded .docx (BR-1): unreadable → 422 "We could not read this file."; an unknown placeholder → 422 naming
   *  it; a missing client name or fee → accepted with warnings. */
  private readTemplate(file: Upload | undefined) {
    if (!file?.bytes?.length) return unprocessable("Choose a .docx file.", { file: "Choose a .docx file." });
    if (file.size > TEMPLATE_MAX_BYTES) unprocessable("A template is at most 5 MB.", { file: "At most 5 MB." });
    let found: string[];
    try { found = placeholdersOf(file.bytes); } catch (e) {
      if (e instanceof UnreadableDocx) return unprocessable("We could not read this file.", { file: "We could not read this file." }, { code: "UNREADABLE_FILE" });
      throw e;
    }
    const c = checkPlaceholders(found);
    if (c.unknown.length) unprocessable(c.unknown.map((n) => `{${n}} is not a placeholder we know`).join("; ") + ".", { file: `Unknown: ${c.unknown.map((n) => `{${n}}`).join(", ")}` }, { code: "UNKNOWN_PLACEHOLDER", unknown: c.unknown });
    return c;
  }

  async listTemplates(ctx: StaffContext) {
    const rows = await this.db.foRetainerTemplate.findMany({ where: { firmId: ctx.firmId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
    return rows.map((t) => ({ id: t.id, name: t.name, kind: t.kind, version: t.version, active: t.active, placeholders: t.placeholders, warnings: checkPlaceholders(t.placeholders).warnings, updatedAt: t.updatedAt }));
  }

  async uploadTemplate(ctx: StaffContext, body: Record<string, unknown>, file: Upload | undefined) {
    const name = str(body.name, 120, "The template's name", "name")!;
    const kind = (body.kind ?? "RETAINER") as "RETAINER" | "CONSULTATION";
    if (kind !== "RETAINER" && kind !== "CONSULTATION") unprocessable("Kind is RETAINER or CONSULTATION.", { kind: "RETAINER or CONSULTATION." });
    const c = this.readTemplate(file);
    const id = randomUUID(), key = `retainer-templates/${id}/v1.docx`;
    const stored = await this.files.put(ctx.firmId, key, file!.bytes, DOCX);
    try {
      await this.db.$transaction(async (tx) => {
        await tx.foRetainerTemplate.create({ data: { id, firmId: ctx.firmId, name, kind, fileKey: key, fileSha256: stored.sha256, placeholders: c.placeholders, createdBy: `staff:${ctx.staffId}`, updatedBy: `staff:${ctx.staffId}` } });
        await this.audit.record(tx, { ...this.line(ctx, "retainer.template.uploaded", id, `Template uploaded (${kind.toLowerCase()}, version 1)`, { templateId: id, kind, version: 1, sha256: stored.sha256 }), entity: "fo_retainer_template" });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" || /fo_retainer_template_firm_id_name/.test(String(e))) conflict("A template with this name already exists.", "NAME_TAKEN");
      throw e;
    }
    return { id, name, kind, version: 1, active: true, placeholders: c.placeholders, warnings: c.warnings };
  }

  /** A new file for a template makes version n+1 (BR-1); retainers keep the version they were made from. */
  async newTemplateVersion(ctx: StaffContext, id: string, file: Upload | undefined) {
    const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id } }) ?? notFound("template");
    const c = this.readTemplate(file);
    const version = t.version + 1, key = `retainer-templates/${id}/v${version}.docx`;
    const stored = await this.files.put(ctx.firmId, key, file!.bytes, DOCX);
    await this.db.$transaction(async (tx) => {
      const n = await tx.foRetainerTemplate.updateMany({ where: { firmId: ctx.firmId, id, version: t.version }, data: { version, fileKey: key, fileSha256: stored.sha256, placeholders: c.placeholders, updatedBy: `staff:${ctx.staffId}` } });
      if (n.count !== 1) conflict("Someone changed this template at the same time. Open it again.", "CHANGED");
      await this.audit.record(tx, { ...this.line(ctx, "retainer.template.new_version", id, `Template version ${version} uploaded`, { templateId: id, version, sha256: stored.sha256 }), entity: "fo_retainer_template" });
    });
    return { id, version, placeholders: c.placeholders, warnings: c.warnings };
  }

  async changeTemplate(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id } }) ?? notFound("template");
    const data: { active?: boolean; name?: string } = {};
    if (body.active !== undefined) { if (typeof body.active !== "boolean") unprocessable("Active is true or false.", { active: "true or false" }); data.active = body.active as boolean; }
    if (body.name !== undefined) data.name = str(body.name, 120, "The template's name", "name")!;
    if (!Object.keys(data).length) unprocessable("Nothing to change.", {});
    try {
      await this.db.$transaction(async (tx) => {
        await tx.foRetainerTemplate.update({ where: { id: t.id }, data: { ...data, updatedBy: `staff:${ctx.staffId}` } });
        await this.audit.record(tx, { ...this.line(ctx, "retainer.template.changed", id, `Template ${data.active === false ? "switched off" : data.active ? "switched on" : "renamed"}`, { templateId: id, active: data.active ?? t.active }), entity: "fo_retainer_template" });
      });
    } catch (e) {
      if (/fo_retainer_template_firm_id_name/.test(String(e)) || e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") conflict("A template with this name already exists.", "NAME_TAKEN");
      throw e;
    }
    return { id, ...data };
  }

  // ----------------------------------------------------------------------------------------------- retainers
  /** The signer (BR-4): the prospect's person; for Corporate, its SIGNATORY contact, else a warning and the company's other
   *  contacts to pick from (AG-5-50: never a block). A given signer must be one of those people. */
  private signerFor(p: Awaited<ReturnType<Retainers["prospectFor"]>>, given: string | null) {
    if (p.type === "INDIVIDUAL") {
      if (given && given !== p.subjectPersonId) unprocessable("The signer of an Individual prospect is the prospect's person.", { signerPersonId: "Not this prospect's person." });
      return { signer: p.subjectPerson, warnings: [] as string[], options: [] as { personId: string; name: string; role: string }[] };
    }
    const contacts = p.subjectCompany?.contacts ?? [];
    const options = contacts.map((c) => ({ personId: c.personId, name: nameOf(c.person), role: c.role }));
    if (given) {
      const c = contacts.find((x) => x.personId === given);
      if (!c) unprocessable("The signer must be one of the company's contacts.", { signerPersonId: "Not one of the company's contacts." });
      return { signer: c!.person, warnings: [], options };
    }
    const sig = contacts.find((c) => c.role === "SIGNATORY");
    if (sig) return { signer: sig.person, warnings: [], options };
    return { signer: null, warnings: ["This company has no signatory contact. Pick who signs from its contacts."], options };
  }

  /** The merge values bound into a version (AG-5-3): copied, so a later change to the person never alters it. */
  private async mergeValues(firmId: string, p: { type: string; subjectPerson: Person | null; subjectCompany: { operatingName: string } | null }, signer: Person | null, repId: string, n: number, fees: FeeIn[]) {
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId }, select: { operatingName: true } });
    const rep = await this.db.platformStaff.findFirst({ where: { firmId, id: repId }, include: { credential: true } });
    const client = p.type === "CORPORATE" ? p.subjectCompany?.operatingName ?? null : (p.subjectPerson ? nameOf(p.subjectPerson) || null : null);
    const contact = p.type === "CORPORATE" ? signer : p.subjectPerson;
    const amounts = fees.filter((f) => f.amountMinor !== null).map((f) => f.amountMinor!);
    return {
      "client.name": client, "client.email": contact?.email ?? null, "client.phone": contact?.phone ?? null,
      "company.name": p.type === "CORPORATE" ? p.subjectCompany?.operatingName ?? null : null,
      "signer.name": signer ? nameOf(signer) || null : null, "signer.email": signer?.email ?? null,
      "representative.name": rep?.displayName ?? null, "representative.licensing_body": rep?.credential?.licensingBody ?? null, "representative.licence_number": rep?.credential?.licenceNumber ?? null,
      "firm.name": firm.operatingName, "agreement.date": new Date(this.clock.now()).toISOString().slice(0, 10), "agreement.version": String(n),
      fees: fees.map((f) => ({ label: f.label, amount: f.amountMinor === null ? null : cad(f.amountMinor), when: WHEN_WORDS[f.when], due_on: f.dueOn })),
      "fees.total": amounts.length ? cad(amounts.reduce((a, b) => a + b, 0n)) : null,
    };
  }

  /** Renders version n from the retainer's template file and stores it (write-once key). */
  private async renderVersion(firmId: string, retainerId: string, n: number, templateFileKey: string, values: Record<string, unknown>) {
    const tpl = await this.files.get(firmId, templateFileKey);
    if (!tpl) return conflict("The template's file is missing. Upload the template again.", "TEMPLATE_FILE_MISSING");
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) data[k] = v === null ? "" : k === "fees" ? (v as Record<string, unknown>[]).map((f) => ({ ...f, amount: f.amount ?? "", due_on: f.due_on ? `, ${f.due_on}` : "" })) : v;
    const bytes = renderDocx(tpl.bytes, data);
    const key = `retainers/${retainerId}/v${n}.docx`;
    return this.files.put(firmId, key, bytes, DOCX);
  }

  /** BR-6 (AG-5-9): what blocks Send (choices and the two must-fill values) and what only shows "missing". */
  completeness(values: Record<string, unknown>, signerPersonId: string | null, placeholders: string[]) {
    const blockers: Record<string, string> = {};
    if (!values["client.name"]) blockers["client.name"] = "Client name is missing.";
    if (!((values.fees as { amount: string | null }[]) ?? []).some((f) => f.amount)) blockers.fees = "Fee is missing. Add a fee row.";
    if (!signerPersonId) blockers.signerPersonId = "Choose who signs.";
    else if (!values["signer.email"] && !values["client.email"]) blockers.signerPersonId = "The signer needs an email.";
    const missing = placeholders.filter((n) => !n.startsWith("fees") && n in values && (values[n] === null || values[n] === ""));
    return { blockers, missing };
  }

  /** Prepare retainer (BR-2): from a prospect, with the firm's template, a representative and the signer. */
  async draft(ctx: StaffContext, prospectId: string, body: Record<string, unknown>) {
    const reps = await this.representatives(ctx.firmId);
    if (!reps.length) conflict(NO_LICENSED, "NO_LICENSED_CONSULTANT");
    const p = await this.prospectFor(ctx, uuidOf(prospectId, "prospectId") ?? notFound("prospect"));
    if (p.stage.kind === "WON" || p.stage.kind === "LOST") conflict(`This prospect is ${p.stage.kind === "WON" ? "won" : "lost"}: a retainer is prepared for an open prospect.`, "PROSPECT_CLOSED");
    const kind = (body.kind ?? "RETAINER") as "RETAINER" | "CONSULTATION";
    if (kind !== "RETAINER" && kind !== "CONSULTATION") unprocessable("Kind is RETAINER or CONSULTATION.", { kind: "RETAINER or CONSULTATION." });
    const t = await this.templateFor(ctx.firmId, uuidOf(body.templateId, "templateId"), kind);
    const repId = uuidOf(body.representativeStaffId, "representativeStaffId") ?? (reps.some((r) => r.staffId === ctx.staffId) ? ctx.staffId : null);
    if (!repId) unprocessable("Choose the representative.", { representativeStaffId: "Choose the representative." });
    if (!reps.some((r) => r.staffId === repId)) unprocessable("The representative must be an active person with a licence and the case-manager permissions.", { representativeStaffId: "Not eligible to represent." });
    const s = this.signerFor(p, uuidOf(body.signerPersonId, "signerPersonId"));
    const fees = body.fees === undefined ? [{ label: "Deposit on signing", amountMinor: null, when: "ON_SIGNING" as const, dueOn: null }] : feesOf(body.fees);
    const id = randomUUID(), values = await this.mergeValues(ctx.firmId, p, s.signer, repId!, 1, fees);
    const file = await this.renderVersion(ctx.firmId, id, 1, t.fileKey, values);
    await this.db.$transaction(async (tx) => {
      await tx.foRetainer.create({ data: { id, firmId: ctx.firmId, kind, prospectId: p.id, subject: p.type === "CORPORATE" ? "COMPANY" : "PERSON", companyId: p.type === "CORPORATE" ? p.subjectCompanyId : null, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId!, templateId: t.id, templateVersion: t.version, templateFileKey: t.fileKey, createdBy: `staff:${ctx.staffId}` } });
      await this.writeVersion(tx, ctx, id, 1, values, file, fees);
      await this.audit.record(tx, this.line(ctx, "retainer.drafted", id, `${kind === "RETAINER" ? "Retainer" : "Consultation agreement"} drafted (version 1)`, { retainerId: id, prospectId: p.id, templateId: t.id, templateVersion: t.version, sha256: file.sha256 }));
      await this.event(tx, ctx.firmId, EVENT.RETAINER_DRAFTED, { retainerId: id, kind, prospectId: p.id, version: 1 });
    });
    return { ...(await this.read(ctx, id)), warnings: s.warnings, signerOptions: s.options };
  }

  private async templateFor(firmId: string, templateId: string | null, kind: "RETAINER" | "CONSULTATION") {
    if (templateId) {
      const t = await this.db.foRetainerTemplate.findFirst({ where: { firmId, id: templateId } });
      if (!t) return unprocessable("No such template in your firm.", { templateId: "No such template." });
      if (!t.active) unprocessable("This template is switched off.", { templateId: "Switched off." });
      if (t.kind !== kind) unprocessable(`This is a ${t.kind.toLowerCase()} template.`, { templateId: "Another kind of template." });
      return t;
    }
    const all = await this.db.foRetainerTemplate.findMany({ where: { firmId, kind, active: true } });
    if (all.length === 1) return all[0];
    return all.length ? unprocessable("Choose the template.", { templateId: "Choose the template." }) : conflict(`No active ${kind === "RETAINER" ? "retainer" : "consultation agreement"} template. Upload one first.`, "NO_TEMPLATE");
  }

  private async writeVersion(tx: Tx, ctx: StaffContext, retainerId: string, n: number, values: Record<string, unknown>, file: { key: string; sha256: string }, fees: FeeIn[]) {
    const v = await tx.foRetainerVersion.create({ data: { firmId: ctx.firmId, retainerId, n, mergeValues: values as Prisma.InputJsonValue, fileKey: file.key, originalSha256: file.sha256, createdBy: `staff:${ctx.staffId}` } });
    if (fees.length) await tx.foRetainerFeeRow.createMany({ data: fees.map((f, i) => ({ firmId: ctx.firmId, versionId: v.id, position: i + 1, label: f.label, amountMinor: f.amountMinor, when: f.when, dueOn: f.dueOn ? new Date(`${f.dueOn}T00:00:00Z`) : null })) });
    return v;
  }

  /** The retainer page (BR-6): the current version, its fees, what blocks Send and what is missing, the versions. */
  async read(ctx: StaffContext, id: string) {
    const r = await this.visible(ctx, id);
    const versions = await this.db.foRetainerVersion.findMany({ where: { firmId: ctx.firmId, retainerId: r.id }, orderBy: { n: "asc" }, include: { fees: { orderBy: { position: "asc" } } } });
    const cur = versions.find((v) => v.n === r.currentVersion)!;
    const tpl = await this.db.foRetainerTemplate.findFirst({ where: { firmId: ctx.firmId, id: r.templateId }, select: { name: true, placeholders: true } });
    const values = cur.mergeValues as Record<string, unknown>;
    // The prospect's header (BR-3: the retainer's representative reads it whatever the visibility setting).
    const ph = r.prospectId ? await this.db.foProspect.findFirst({ where: { firmId: ctx.firmId, id: r.prospectId }, select: { id: true, number: true, type: true, stage: { select: { label: true, kind: true } } } }) : null;
    const c = this.completeness(values, r.signerPersonId, tpl?.placeholders ?? []);
    return {
      id: r.id, kind: r.kind, status: r.status, prospectId: r.prospectId, prospect: ph ? { id: ph.id, number: ph.number, type: ph.type, stage: ph.stage.label, stageKind: ph.stage.kind } : null, subject: r.subject, companyId: r.companyId, signerPersonId: r.signerPersonId,
      representativeStaffId: r.representativeStaffId, template: { id: r.templateId, name: tpl?.name ?? null, version: r.templateVersion },
      version: { n: cur.n, sha256: cur.originalSha256, sentAt: cur.sentAt, values: { ...values, "representative.licence_number": undefined },
        fees: cur.fees.map((f) => ({ position: f.position, label: f.label, amountMinor: f.amountMinor === null ? null : f.amountMinor.toString(), currency: f.currency, when: f.when, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null })) },
      canSend: r.status === "DRAFT" && !Object.keys(c.blockers).length, blockers: c.blockers, missing: c.missing,
      withdrawn: r.withdrawnAt ? { at: r.withdrawnAt, reason: r.withdrawnReason } : null, signedOffline: r.offlineAt ? { at: r.offlineAt, reason: r.offlineReason, filed: "Signed on paper" } : null,
      versions: versions.map((v) => ({ n: v.n, sentAt: v.sentAt, endedAt: v.endedAt, endReason: v.endReason, sha256: v.originalSha256 })),
    };
  }

  /** Edit (BR-9; AG-5-65): every edit is version n+1. On a sent one the open request ends (UPDATED) in the same
   *  transaction; after the client signed, refused. From Declined or Expired, Edit and resend (AG-5-65 r1). */
  async edit(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    const r = await this.visible(ctx, id);
    if (!EDITABLE.includes(r.status)) conflict(r.status === "CLIENT_SIGNED" || r.status === "SIGNED" || r.status === "SIGNED_OFFLINE" ? "The client has signed this agreement: it can no longer be edited." : "This agreement is withdrawn: prepare a new one.", "NOT_EDITABLE");
    const p = await this.prospectFor(ctx, r.prospectId ?? notFound("prospect"), true);
    const cur = await this.db.foRetainerVersion.findFirstOrThrow({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion }, include: { fees: { orderBy: { position: "asc" } } } });
    const t = body.templateId !== undefined ? await this.templateFor(ctx.firmId, uuidOf(body.templateId, "templateId"), r.kind) : await this.currentTemplateFile(ctx.firmId, r);
    let repId = r.representativeStaffId;
    if (body.representativeStaffId !== undefined) {
      repId = uuidOf(body.representativeStaffId, "representativeStaffId") ?? unprocessable("Choose the representative.", { representativeStaffId: "Choose the representative." });
      if (!(await this.representatives(ctx.firmId)).some((x) => x.staffId === repId)) unprocessable("The representative must be an active person with a licence and the case-manager permissions.", { representativeStaffId: "Not eligible to represent." });
    }
    const s = this.signerFor(p, body.signerPersonId !== undefined ? uuidOf(body.signerPersonId, "signerPersonId") : r.signerPersonId);
    const fees = body.fees !== undefined ? feesOf(body.fees) : cur.fees.map((f) => ({ label: f.label, amountMinor: f.amountMinor, when: f.when, dueOn: f.dueOn?.toISOString().slice(0, 10) ?? null }));
    const n = r.currentVersion + 1, values = await this.mergeValues(ctx.firmId, p, s.signer, repId, n, fees);
    const file = await this.renderVersion(ctx.firmId, r.id, n, t.fileKey, values);
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ status: string; current_version: number }[]>(Prisma.sql`select status::text, current_version from fo_retainer where firm_id = ${ctx.firmId}::uuid and id = ${r.id}::uuid for update`);
      if (locked[0]?.status !== r.status || locked[0]?.current_version !== r.currentVersion) conflict("This agreement changed at the same time (for example the client signed). Open it again.", "CHANGED");
      if (cur.sentAt && !cur.endedAt) await tx.foRetainerVersion.update({ where: { id: cur.id }, data: { endedAt: new Date(this.clock.now()), endReason: "UPDATED" } });
      await tx.foRetainer.update({ where: { id: r.id }, data: { status: "DRAFT", currentVersion: n, signerPersonId: s.signer?.id ?? null, representativeStaffId: repId, templateId: t.id, templateVersion: t.version, templateFileKey: t.fileKey } });
      await this.writeVersion(tx, ctx, r.id, n, values, file, fees);
      await this.audit.record(tx, this.line(ctx, "retainer.edited", r.id, `Edited: version ${n}${cur.sentAt && !cur.endedAt ? " (the earlier request ended)" : ""}`, { retainerId: r.id, version: n, endedVersion: cur.sentAt && !cur.endedAt ? cur.n : null, sha256: file.sha256 }));
    });
    return { ...(await this.read(ctx, r.id)), warnings: s.warnings, signerOptions: s.options };
  }

  /** The template file the retainer was made from, or the template's current one when it is switched to (an edit). */
  private async currentTemplateFile(firmId: string, r: { templateId: string; templateVersion: number; templateFileKey: string }) {
    return { id: r.templateId, version: r.templateVersion, fileKey: r.templateFileKey };
  }

  /** Send (BR-6, BR-8; AG-5-9): only a Draft, only with its choices made and the client name and a fee filled in. FO-6
   *  adds the signing request and the one email in this same step. */
  async send(ctx: StaffContext, id: string) {
    const r = await this.visible(ctx, id);
    if (r.status !== "DRAFT") conflict("Only a draft is sent. Edit it to make a new version first.", "NOT_DRAFT");
    const page = await this.read(ctx, id);
    if (Object.keys(page.blockers).length) unprocessable(Object.values(page.blockers).join(" "), page.blockers, { code: "SEND_BLOCKED" });
    await this.db.$transaction(async (tx) => {
      const now = new Date(this.clock.now());
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: "DRAFT", currentVersion: r.currentVersion }, data: { status: "SENT" } });
      if (n.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion }, data: { sentAt: now } });
      await this.audit.record(tx, this.line(ctx, "retainer.sent", r.id, `Sent (version ${r.currentVersion})`, { retainerId: r.id, version: r.currentVersion }));
      await this.event(tx, ctx.firmId, EVENT.RETAINER_SENT, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: r.currentVersion });
    });
    return this.read(ctx, id);
  }

  /** Withdraw (BR-10; AG-5-34): a reason 1-200, from Sent, Viewed or Client signed; the request ends. */
  async withdraw(ctx: StaffContext, id: string, body: Record<string, unknown>) {
    const r = await this.visible(ctx, id);
    const reason = str(body.reason, 200, "A reason", "reason")!;
    if (!WITHDRAWABLE.includes(r.status)) conflict(r.status === "SIGNED" || r.status === "SIGNED_OFFLINE" ? "A signed agreement cannot be withdrawn." : r.status === "DRAFT" ? "A draft has not been sent: edit it or leave it." : `A ${r.status.toLowerCase()} agreement cannot be withdrawn.`, "NOT_WITHDRAWABLE");
    await this.db.$transaction(async (tx) => {
      const now = new Date(this.clock.now());
      const v = await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion, endedAt: null }, data: { endedAt: now, endReason: "WITHDRAWN" } });
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: r.status, currentVersion: r.currentVersion }, data: { status: "WITHDRAWN", withdrawnAt: now, withdrawnBy: `staff:${ctx.staffId}`, withdrawnReason: reason } });
      if (n.count !== 1 || v.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      await this.audit.record(tx, this.line(ctx, "retainer.withdrawn", r.id, "Withdrawn with a reason", { retainerId: r.id, version: r.currentVersion }));
      await this.event(tx, ctx.firmId, EVENT.RETAINER_WITHDRAWN, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: r.currentVersion });
    });
    return this.read(ctx, id);
  }

  /** Signed offline (BR-11; AG-5-39, AG-5-47; contracts §2.6): a PDF and a reason; ends the open request; filed "Signed on
   *  paper", no seal; the prospect becomes WON (SIGNED_OFFLINE) once; cannot be undone. A consultation agreement never
   *  makes a client (contracts §7 §2.3-§2.4). */
  async signedOffline(ctx: StaffContext, id: string, body: Record<string, unknown>, file: Upload | undefined) {
    const r = await this.visible(ctx, id);
    const reason = str(body.reason, 200, "A reason", "reason")!;
    if (!file?.bytes?.length) unprocessable("Upload the signed PDF.", { file: "Upload the signed PDF." });
    if (file!.size > OFFLINE_PDF_MAX_BYTES) unprocessable("The signed copy is at most 10 MB.", { file: "At most 10 MB." });
    if (Buffer.from(file!.bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") unprocessable("The signed copy must be a PDF.", { file: "A PDF only." });
    if (!OFFLINE_FROM.includes(r.status)) conflict(r.status === "SIGNED_OFFLINE" || r.status === "SIGNED" ? "This agreement is already signed." : `A ${r.status.toLowerCase()} agreement cannot be recorded as signed.`, "NOT_SIGNABLE");
    const stored = await this.files.put(ctx.firmId, `retainers/${r.id}/signed-offline.pdf`, file!.bytes, "application/pdf");
    let prospectWon = false;
    await this.db.$transaction(async (tx) => {
      const now = new Date(this.clock.now());
      const v = await tx.foRetainerVersion.updateMany({ where: { firmId: ctx.firmId, retainerId: r.id, n: r.currentVersion, endedAt: null }, data: { endedAt: now, endReason: "SIGNED_OFFLINE" } });
      const n = await tx.foRetainer.updateMany({ where: { firmId: ctx.firmId, id: r.id, status: r.status, currentVersion: r.currentVersion }, data: { status: "SIGNED_OFFLINE", offlineAt: now, offlineBy: `staff:${ctx.staffId}`, offlineReason: reason, offlineFileKey: `retainers/${r.id}/signed-offline.pdf`, offlineFileSha256: stored.sha256 } });
      if (n.count !== 1 || v.count !== 1) conflict("This agreement changed at the same time. Open it again.", "CHANGED");
      if (r.kind === "RETAINER" && r.prospectId) prospectWon = await this.winProspect(tx, ctx, r.prospectId, now);
      await this.audit.record(tx, this.line(ctx, "retainer.signed_offline", r.id, `Signed on paper${prospectWon ? "; the prospect is won" : ""}`, { retainerId: r.id, version: r.currentVersion, sha256: stored.sha256, prospectWon }));
      await this.event(tx, ctx.firmId, EVENT.RETAINER_SIGNED_OFFLINE, { retainerId: r.id, kind: r.kind, prospectId: r.prospectId, version: r.currentVersion, prospectWon });
    });
    return { ...(await this.read(ctx, id)), prospectWon };
  }

  /** The prospect moves to its pipeline's WON stage, won via SIGNED_OFFLINE, once (a prospect already won stays as it is). */
  private async winProspect(tx: Tx, ctx: StaffContext, prospectId: string, now: Date): Promise<boolean> {
    const rows = await tx.$queryRaw<{ stage_id: string; type: string; kind: string }[]>(Prisma.sql`
      select p.stage_id::text, p.type::text, s.kind::text from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
       where p.firm_id = ${ctx.firmId}::uuid and p.id = ${prospectId}::uuid for update of p`);
    const p = rows[0];
    if (!p || p.kind === "WON") return false;
    const won = await tx.foStage.findFirst({ where: { firmId: ctx.firmId, pipeline: p.type as never, kind: "WON" } });
    if (!won) return false;
    await tx.foProspect.update({ where: { id: prospectId }, data: { stageId: won.id, wonVia: "SIGNED_OFFLINE", wonAt: now, lostReasonId: null, lostReasonKind: null, lostNote: null } });
    await tx.foStageMove.create({ data: { firmId: ctx.firmId, prospectId, fromStageId: p.stage_id, toStageId: won.id, cause: "SIGNED_OFFLINE", byActor: `staff:${ctx.staffId}` } });
    await this.audit.record(tx, { ...this.line(ctx, "prospect.won", prospectId, "Won: retainer signed on paper", { prospectId, wonVia: "SIGNED_OFFLINE" }), entity: "fo_prospect" });
    return true;
  }

  /** The file a download link may name (BR-15): a version's document or the signed paper copy, of a retainer the person sees. */
  async fileKey(ctx: StaffContext, id: string, body: Record<string, unknown>): Promise<string> {
    const r = await this.visible(ctx, id);
    if (body.file === "signed-offline") return r.offlineFileKey ?? notFound("signed copy");
    const n = body.version === undefined ? r.currentVersion : Number(body.version);
    const v = Number.isInteger(n) ? await this.db.foRetainerVersion.findFirst({ where: { firmId: ctx.firmId, retainerId: r.id, n } }) : null;
    return v?.fileKey ?? notFound("version");
  }
}
Injectable()(Retainers);

type Person = { id: string; givenNames: string | null; familyName: string | null; email: string | null; phone: string | null };
const nameOf = (p: Pick<Person, "givenNames" | "familyName">) => [p.givenNames, p.familyName].filter((x) => x && x.trim()).join(" ").trim();
