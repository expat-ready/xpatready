// PF-22a part 2 (R1.95, map row 95; P-570, P-584 (2); PF-22s concept §6): a firm's own fields on the records modules
// register (CustomFieldPort), and their values.
// Definitions: any staff member reads a kind's fields (the record panel needs them); agent/custom-field:manage (Owner,
// Admin; Sample) adds, edits, orders and archives them. Archive, never delete: archiving a field that has values needs
// `confirm: true` (else 409 FIELD_IN_USE with the count, R1.95 "a field in use is not removed without a confirm"); its
// values are kept and hidden, and show again on un-archive. A field's type never changes once it has values (409
// TYPE_FROZEN) and a choice in use is never removed (409 OPTION_IN_USE); the database refuses both too. At most
// CUSTOM_FIELD_LIMIT active fields per kind (Sample, P-562; 422 LIMIT_REACHED, under a lock per firm and kind).
// Values: the registering module's canView decides whether the record exists for this person (404 otherwise, the same
// answer as another firm's record), canEdit whether they may change it (403). A PUT names the version it read (computed
// from the record's value rows, read under a lock on the record; 409 STALE_VERSION otherwise, challenge M5); every value
// is checked by its type (422 with the field named); a required field left empty is refused on this save only (challenge
// M6: no other action of the record waits on it). Every change is one transaction with one audit line (fail-closed);
// a value may be personal, so it goes in the line's before/after, never in its summary or detail (PF-23).
import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PlatCustomField, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort, AuditValues } from "../../../../ports/audit.ts";
import { CHOICE_TYPES, choicesIssue, CUSTOM_FIELD_LIMIT, CustomFieldType, keyFromLabel, LIMITS, readValue, sameForm, trimText, type CustomFieldPort, type EntityAccess } from "../../../../ports/custom-fields.ts";
import { firmScope } from "../firm-scope.ts";
import { FIELD_ERROR_STATUS, parseInput, strict } from "../http/input.ts";
import { problem, type StaffContext } from "../identity/keys.ts";

type Tx = Prisma.TransactionClient;
type Value = string | number | boolean | string[];
export type CustomFieldDeps = { db: PrismaClient; audit: AuditPort<Tx>; registry: CustomFieldPort<StaffContext> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const label = z.string().refine((s) => { const t = trimText(s); return [...t].length >= 1 && [...t].length <= LIMITS.label; }, `1 to ${LIMITS.label} characters.`);
const help = z.string().refine((s) => [...trimText(s)].length <= LIMITS.helpText, `at most ${LIMITS.helpText} characters.`).nullable();
const choices = z.array(z.string().max(400)).max(LIMITS.choices);
export const AddField = strict({ kind: z.string().max(64), label, type: CustomFieldType, required: z.boolean().optional(), options: choices.optional(), helpText: help.optional() });
export const ChangeField = strict({ label: label.optional(), type: CustomFieldType.optional(), required: z.boolean().optional(), options: choices.optional(), helpText: help.optional(),
  position: z.number().int().min(0).max(1000).optional(), archived: z.boolean().optional(), confirm: z.boolean().optional() })
  .refine((b) => Object.keys(b).some((k) => k !== "confirm"), { error: "Name what to change." });
export const PutValues = strict({ values: z.record(z.string().max(40), z.unknown()), version: z.string().max(80) });

/** A field as the API answers it. */
export type FieldView = { id: string; key: string; label: string; type: string; required: boolean; options: string[]; helpText: string | null; position: number; archivedAt: string | null; valueCount: number; optionUse: Record<string, number> };

const fieldsError = (fields: Record<string, string>, detail?: string): never =>
  problem(FIELD_ERROR_STATUS, "Check the details", detail ?? `${Object.keys(fields).length === 1 ? "One field needs" : `${Object.keys(fields).length} fields need`} a change: ${Object.values(fields).join(" ").slice(0, 500)} Nothing was saved.`, { code: "INVALID", fields });
const conflict = (detail: string, code: string, extra: Record<string, unknown> = {}): never => problem(409, "Not possible now", detail, { code, ...extra });
const notFound = (what: string): never => problem(404, "Not found", `No such ${what} in your firm.`, { code: "NOT_FOUND" });
const records = (kind: string, n: number) => `${n} ${kind.replace(/^[a-z]+_/, "").replace(/_/g, " ")}${n === 1 ? "" : "s"}`;
const optionsOf = (f: Pick<PlatCustomField, "options">) => (Array.isArray(f.options) ? (f.options as string[]) : []);

/** The database's own refusals (a race the service's checks lost) as the same answers. */
function dbRefusal(e: unknown): never {
  if (e instanceof HttpException) throw e;
  const m = String((e as { message?: unknown })?.message ?? e);
  if (m.includes("type of a field with values")) conflict("The type cannot change: records have a value. Archive this field and add a new one.", "TYPE_FROZEN");
  if (m.includes("option in use")) conflict("A choice in use cannot be removed.", "OPTION_IN_USE");
  if (m.includes("field is archived")) conflict("This field was archived. Reload to see the current fields.", "FIELD_ARCHIVED");
  if (m.includes("does not fit its field")) conflict("A value no longer fits its field. Reload and try again.", "STALE_VERSION");
  if (/P2002|unique constraint/i.test(m)) conflict("Another field has this name. Reload and try again.", "DUPLICATE_KEY");
  throw e;
}

export class CustomFieldsService {
  constructor(private readonly d: CustomFieldDeps) {}

  /** A kind's checks. In a query or body an unregistered kind is 400 UNKNOWN_KIND; in a path (the values routes) it is
   *  part of the record's address, so it is the one not-found, as a bad id is (PF-28's rule). */
  private access(kind: unknown, inPath = false): { kind: string; access: EntityAccess<StaffContext> } {
    const k = typeof kind === "string" ? kind : "";
    const access = this.d.registry.accessOf(k);
    if (!access && inPath) return notFound("record");
    if (!access) return problem(400, "Unknown record type", "Custom fields are not available for this record type.", { code: "UNKNOWN_KIND", kinds: this.d.registry.kinds() });
    return { kind: k, access };
  }
  private actor(ctx: StaffContext) { return `staff:${ctx.staffId}`; }

  /** The kind's fields in order (archived ones too with `archived`), each with how many records use it and each choice. */
  async list(ctx: StaffContext, kindRaw: unknown, archived = false): Promise<{ kind: string; fields: FieldView[]; limit: number; activeCount: number }> {
    const { kind } = this.access(kindRaw);
    return this.listIn(this.d.db, ctx.firmId, kind, archived);
  }
  private async listIn(db: Tx | PrismaClient, firmIdRaw: string, kind: string, archived: boolean) {
    const firmId = firmScope(firmIdRaw).firmId;
    const rows = await db.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, ...(archived ? {} : { archivedAt: null }) }), orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { position: "asc" }, { createdAt: "asc" }] });
    const counts = await db.$queryRaw<{ field_id: string; n: number }[]>`select v.field_id::text, count(*)::int as n from plat_custom_value v join plat_custom_field f on f.id = v.field_id and f.firm_id = v.firm_id
      where v.firm_id = ${firmId}::uuid and f.entity_kind = ${kind} group by 1`;
    const uses = await db.$queryRaw<{ field_id: string; label: string; n: number }[]>`select v.field_id::text, o.label, count(*)::int as n
      from plat_custom_value v join plat_custom_field f on f.id = v.field_id and f.firm_id = v.firm_id
      cross join lateral (select v.value #>> '{}' as label where jsonb_typeof(v.value) = 'string' union all select jsonb_array_elements_text(v.value) where jsonb_typeof(v.value) = 'array') o
      where v.firm_id = ${firmId}::uuid and f.entity_kind = ${kind} and f.type in ('SELECT', 'MULTI_SELECT') group by 1, 2`;
    const n = new Map(counts.map((c) => [c.field_id, c.n]));
    const fields = rows.map((f): FieldView => ({
      id: f.id, key: f.key, label: f.label, type: f.type, required: f.required, options: optionsOf(f), helpText: f.helpText, position: f.position, archivedAt: f.archivedAt?.toISOString() ?? null,
      valueCount: n.get(f.id) ?? 0, optionUse: Object.fromEntries(uses.filter((u) => u.field_id === f.id).map((u) => [u.label, u.n])),
    }));
    const activeCount = await db.platCustomField.count({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }) });
    return { kind, fields, limit: CUSTOM_FIELD_LIMIT, activeCount };
  }

  private lockKind(tx: Tx, firmId: string, kind: string) { return tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat-custom-field:${firmId}:${kind}`}))`; }

  private checkChoices(type: CustomFieldType, raw: string[] | undefined): string[] {
    const list = (raw ?? []).map(trimText);
    const issue = choicesIssue(type, list);
    return issue ? fieldsError({ options: issue }) : list;
  }
  private async labelFree(tx: Tx, firmId: string, kind: string, text: string, except?: string) {
    const active = await tx.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }), select: { id: true, label: true } });
    if (active.some((f) => f.id !== except && sameForm(f.label) === sameForm(text))) fieldsError({ label: `“${text}” is already a field here. Choose another name.` });
  }

  /** Adds a field (agent/custom-field:manage, checked by the route). */
  async add(ctx: StaffContext, body: unknown): Promise<FieldView> {
    const b = parseInput(AddField, body ?? {});
    const { kind } = this.access(b.kind);
    const firmId = firmScope(ctx.firmId).firmId;
    const options = this.checkChoices(b.type, b.options);
    const text = trimText(b.label), helpText = b.helpText ? trimText(b.helpText) || null : null;
    try {
      const id = await this.d.db.$transaction(async (tx) => {
        await this.lockKind(tx, firmId, kind);
        const all = await tx.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind }), select: { key: true, position: true, archivedAt: true } });
        const active = all.filter((f) => !f.archivedAt);
        if (active.length >= CUSTOM_FIELD_LIMIT) problem(FIELD_ERROR_STATUS, "Limit reached", `A record type has at most ${CUSTOM_FIELD_LIMIT} fields. Archive one to add another.`, { code: "LIMIT_REACHED", limit: CUSTOM_FIELD_LIMIT });
        await this.labelFree(tx, firmId, kind, text);
        const f = await tx.platCustomField.create({ data: { firmId, entityKind: kind, key: keyFromLabel(text, all.map((x) => x.key)), label: text, type: b.type, required: b.required ?? false, options, helpText,
          position: active.reduce((m, x) => Math.max(m, x.position + 1), 0), createdBy: ctx.staffId } });
        await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "custom_field.added", entity: "plat_custom_field", entityKey: f.id, summary: `Custom field added to ${kind} (${f.type.toLowerCase()})`,
          detail: { fieldId: f.id, entityKind: kind, type: f.type }, before: null, after: this.values(f) });
        return f.id;
      });
      return this.view(firmId, kind, id);
    } catch (e) { return dbRefusal(e); }
  }

  private values(f: PlatCustomField): AuditValues {
    return { key: f.key, label: f.label, type: f.type, required: f.required, options: optionsOf(f), helpText: f.helpText, position: f.position, archived: f.archivedAt !== null };
  }
  private async view(firmId: string, kind: string, id: string): Promise<FieldView> {
    const all = await this.listIn(this.d.db, firmId, kind, true);
    return all.fields.find((f) => f.id === id) ?? notFound("field");
  }

  /** Changes a field (agent/custom-field:manage): label, required, choices, help text, place, type (only while unused), archive. */
  async change(ctx: StaffContext, id: string, body: unknown): Promise<FieldView> {
    if (!UUID.test(id)) return notFound("field");   // PF-28: a malformed id is 404, then the body's field errors (422), then the lookup
    const b = parseInput(ChangeField, body ?? {});
    const firmId = firmScope(ctx.firmId).firmId;
    const found = await this.d.db.platCustomField.findFirst({ where: firmScope(firmId, { id: id.toLowerCase() }) });
    if (!found) return notFound("field");
    const kind = found.entityKind;
    try {
      await this.d.db.$transaction(async (tx) => {
        await this.lockKind(tx, firmId, kind);
        const f = await tx.platCustomField.findFirstOrThrow({ where: firmScope(firmId, { id: found.id }) });
        const used = await tx.platCustomValue.count({ where: firmScope(firmId, { fieldId: f.id }) });
        const data: Prisma.PlatCustomFieldUpdateInput = {};
        const type = b.type ?? f.type;
        if (b.type && b.type !== f.type) {
          if (used) conflict(`The type cannot change: ${records(kind, used)} have a value. To use another type, archive this field and add a new one.`, "TYPE_FROZEN", { count: used });
          data.type = b.type;
        }
        if (b.options !== undefined || data.type) {
          const next = this.checkChoices(type, b.options ?? (CHOICE_TYPES.includes(type) ? optionsOf(f) : []));
          const gone = optionsOf(f).filter((o) => !next.includes(o));
          if (gone.length && used) {
            const [use] = await tx.$queryRaw<{ label: string; n: number }[]>`select o.label, count(*)::int as n from plat_custom_value v
              cross join lateral (select v.value #>> '{}' as label where jsonb_typeof(v.value) = 'string' union all select jsonb_array_elements_text(v.value) where jsonb_typeof(v.value) = 'array') o
              where v.firm_id = ${firmId}::uuid and v.field_id = ${f.id}::uuid and o.label = any(${gone}::text[]) group by 1 order by 2 desc, 1 limit 1`;
            if (use) conflict(`“${use.label}” is used on ${records(kind, use.n)}, so it cannot be removed.`, "OPTION_IN_USE", { option: use.label, count: use.n });
          }
          data.options = next;
        }
        if (b.label !== undefined) { const t = trimText(b.label); if (t !== f.label) { if (!f.archivedAt) await this.labelFree(tx, firmId, kind, t, f.id); data.label = t; } }
        if (b.required !== undefined) data.required = b.required;
        if (b.helpText !== undefined) data.helpText = b.helpText ? trimText(b.helpText) || null : null;
        if (b.archived === true && !f.archivedAt) {
          if (used && b.confirm !== true) conflict(`${records(kind, used)} have a value in this field. The values are kept but hidden. Send confirm to archive it.`, "FIELD_IN_USE", { count: used });
          data.archivedAt = new Date();
        }
        if (b.archived === false && f.archivedAt) {
          const active = await tx.platCustomField.count({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }) });
          if (active >= CUSTOM_FIELD_LIMIT) problem(FIELD_ERROR_STATUS, "Limit reached", `A record type has at most ${CUSTOM_FIELD_LIMIT} fields. Archive one to un-archive this one.`, { code: "LIMIT_REACHED", limit: CUSTOM_FIELD_LIMIT });
          await this.labelFree(tx, firmId, kind, (data.label as string | undefined) ?? f.label, f.id);
          data.archivedAt = null;
        }
        const after = Object.keys(data).length ? await tx.platCustomField.update({ where: { id: f.id }, data }) : f;
        if (b.position !== undefined && !after.archivedAt) await this.place(tx, firmId, kind, f.id, b.position);
        const moved = b.position !== undefined && b.position !== f.position;
        if (!Object.keys(data).length && !moved) return;
        const final = await tx.platCustomField.findFirstOrThrow({ where: firmScope(firmId, { id: f.id }) });
        const action = data.archivedAt instanceof Date ? "custom_field.archived" : data.archivedAt === null ? "custom_field.unarchived" : "custom_field.changed";
        await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action, entity: "plat_custom_field", entityKey: f.id, summary: `Custom field ${action.split(".")[1]} on ${kind}${action === "custom_field.archived" && used ? ` (${used} values kept)` : ""}`,
          detail: { fieldId: f.id, entityKind: kind, valueCount: used }, before: this.values(f), after: this.values(final) });
      });
      return this.view(firmId, kind, found.id);
    } catch (e) { return dbRefusal(e); }
  }

  /** Puts the field at `index` among the kind's active fields (0 first) and numbers them again 0, 1, 2, … */
  private async place(tx: Tx, firmId: string, kind: string, id: string, index: number) {
    const active = await tx.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }), orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, position: true } });
    const order = active.filter((f) => f.id !== id);
    order.splice(Math.min(index, order.length), 0, { id, position: -1 });
    for (const [i, f] of order.entries()) if (active.find((a) => a.id === f.id)?.position !== i) await tx.platCustomField.update({ where: { id: f.id }, data: { position: i } });
  }

  private version(rows: { id: string; fieldId: string; updatedAt: Date }[]) {
    if (!rows.length) return "0";
    return createHash("sha256").update(rows.map((r) => `${r.fieldId}:${r.id}:${r.updatedAt.getTime()}`).sort().join("|")).digest("hex").slice(0, 20);
  }

  /** A record's active fields and values, whether this person may change them, and the version to send back. */
  async readValues(ctx: StaffContext, kindRaw: unknown, idRaw: string) {
    const { kind, access } = this.access(kindRaw, true);
    const id = UUID.test(idRaw) ? idRaw.toLowerCase() : notFound("record");
    if (!(await access.canView(ctx, id))) return notFound("record");
    return this.read(this.d.db, ctx.firmId, kind, id, await access.canEdit(ctx, id));
  }
  private async read(db: Tx | PrismaClient, firmIdRaw: string, kind: string, id: string, canEdit: boolean) {
    const firmId = firmScope(firmIdRaw).firmId;
    const fields = await db.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }), orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const rows = await db.platCustomValue.findMany({ where: firmScope(firmId, { entityKind: kind, entityId: id }), select: { id: true, fieldId: true, value: true, updatedAt: true } });
    const keyOf = new Map(fields.map((f) => [f.id, f.key]));
    return {
      kind, id, canEdit, version: this.version(rows),
      fields: fields.map((f) => ({ id: f.id, key: f.key, label: f.label, type: f.type, required: f.required, options: optionsOf(f), helpText: f.helpText })),
      values: Object.fromEntries(rows.filter((r) => keyOf.has(r.fieldId)).map((r) => [keyOf.get(r.fieldId)!, r.value as Value])),
      missing: fields.filter((f) => f.required && !rows.some((r) => r.fieldId === f.id)).map((f) => f.key),
    };
  }

  /** Saves a record's values: only the keys sent change (null or empty clears one); every required field must end filled. */
  async put(ctx: StaffContext, kindRaw: unknown, idRaw: string, body: unknown) {
    const { kind, access } = this.access(kindRaw, true);   // PF-28: a malformed address is 404, then the body's field errors (422), then the lookup
    const id = UUID.test(idRaw) ? idRaw.toLowerCase() : notFound("record");
    const b = parseInput(PutValues, body ?? {});
    if (!(await access.canView(ctx, id))) return notFound("record");
    if (!(await access.canEdit(ctx, id))) return problem(403, "Not allowed", "You can see this record but not change it.", { code: "NOT_ALLOWED" });
    const firmId = firmScope(ctx.firmId).firmId;
    try {
      return await this.d.db.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat-custom-value:${firmId}:${kind}:${id}`}))`;
        const fields = await tx.platCustomField.findMany({ where: firmScope(firmId, { entityKind: kind, archivedAt: null }), orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
        const rows = await tx.platCustomValue.findMany({ where: firmScope(firmId, { entityKind: kind, entityId: id }) });
        if (this.version(rows) !== b.version) conflict("Someone changed these fields after you opened them. Reload to see their change, then save again.", "STALE_VERSION");
        const byKey = new Map(fields.map((f) => [f.key, f]));
        const errors: Record<string, string> = {}, next = new Map<string, Value | null>();
        for (const [key, raw] of Object.entries(b.values)) {
          const f = byKey.get(key);
          if (!f) { errors[key] = "This field is not on this record (it may have been archived). Reload."; continue; }
          const r = readValue({ type: f.type, options: optionsOf(f), label: f.label }, raw);
          if ("issue" in r) errors[key] = r.issue; else next.set(f.id, r.value);
        }
        const has = (f: PlatCustomField) => (next.has(f.id) ? next.get(f.id) !== null : rows.some((r) => r.fieldId === f.id));
        for (const f of fields) if (f.required && !has(f) && !errors[f.key]) errors[f.key] = `Fill in ${f.label}: your firm requires it.`;
        if (Object.keys(errors).length) fieldsError(errors);
        const before: AuditValues = {}, after: AuditValues = {};
        for (const [fieldId, value] of next) {
          const f = fields.find((x) => x.id === fieldId)!, old = rows.find((r) => r.fieldId === fieldId);
          if (JSON.stringify(old?.value ?? null) === JSON.stringify(value)) continue;
          before[f.key] = (old?.value as Value | undefined) ?? null; after[f.key] = value;
          if (value === null) await tx.platCustomValue.delete({ where: { id: old!.id } });
          else if (old) await tx.platCustomValue.update({ where: { id: old.id }, data: { value, updatedBy: ctx.staffId } });
          else await tx.platCustomValue.create({ data: { firmId, fieldId, entityKind: kind, entityId: id, value, updatedBy: ctx.staffId } });
        }
        if (Object.keys(after).length) await this.d.audit.record(tx, { firmId, actor: this.actor(ctx), action: "custom_field.values_set", entity: "plat_custom_value", entityKey: `${kind}:${id}`,
          summary: `Custom field values changed on ${kind} (${Object.keys(after).length} field${Object.keys(after).length === 1 ? "" : "s"})`, detail: { entityKind: kind, entityId: id, fields: Object.keys(after) }, before, after });
        return this.read(tx, firmId, kind, id, true);
      });
    } catch (e) { return dbRefusal(e); }
  }
}
