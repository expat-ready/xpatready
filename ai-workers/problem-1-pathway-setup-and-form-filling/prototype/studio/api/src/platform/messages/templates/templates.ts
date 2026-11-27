// PF-19c part 1 (thin, carried by PF-19s; R1.46): the firm's message templates. A template the firm has not changed is
// ExpatReady's starter wording (AG-12-44); publishing writes the firm's own msg_template once and a new write-once
// msg_template_version each time (AG-12-45; PF-19a's triggers), which PF-19b's send path then uses (firm version first).
// Publishing refuses a field the record type does not provide, naming it (AG-12-66, -70), and a version published by
// someone else since the editor opened (AG-12-69). Each publish writes one audit line, never the wording (AG-12-95).
// Not built here (PF-19c part 2): drafts (AG-12-65), French, must-keep, "Send me a test", history, reset and compare.
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { auditEvent } from "../../audit/audit-event.ts";
import { firmScope } from "../../firm-scope.ts";
import { FIELD_ERROR_STATUS, strict } from "../../http/input.ts";
import { actorWord } from "../../identity/audit.ts";
import { problem, type StaffContext } from "../../identity/keys.ts";
import { ensureMessagesFirm } from "../consent/messages-firm.ts";
import { FIELDS, KINDS, kindOf, LIMITS, partsOf, strayBraces, unknownFields, type TemplateKind } from "./registry.ts";

type Tx = Prisma.TransactionClient;
const CHANNEL = "EMAIL" as const, LANGUAGE = "en";

/** Where a preview's real record comes from (the front office's leads; wired by the feature, so platform code never
 *  imports front-office code). `values` answers 404 for a record the person may not open. */
export interface TemplateRecords {
  find(ctx: StaffContext, q: string): Promise<{ id: string; label: string }[]>;
  values(ctx: StaffContext, id: string): Promise<{ label: string; language: string | null; values: Record<string, string | null> }>;
}
export const TEMPLATE_RECORDS = Symbol.for("platform.TemplateRecords");

// PF-28 A2 (R1.10): the message's own limit (refusals': its length in UTF-16 units, LIMITS.body) is read here, so an over-long
// body is named on its field before the subject's rule; the subject keeps an outer bound, refusals() the rest.
export const PublishBody = strict({ subject: z.string().max(LIMITS.subject + 1000), body: z.string().max(LIMITS.body), baseVersion: z.number().int().min(0) });
export const PreviewBody = strict({ subject: z.string().max(LIMITS.subject + 1000), body: z.string().max(LIMITS.body), leadId: z.string().max(100).optional() });
export const RecordsQuery = strict({ q: z.string().max(100).optional() });

/** Half of a UTF-16 pair with no other half: a broken character the database would store as U+FFFD. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const notFound = (): never => problem(404, "Not found", "No such template.", { code: "NOT_FOUND" });
/** The path key, checked before the body (PF-28: a bad key is the one not-found, never a field error). */
export const knownKind = (key: string): string => kindOf(key)?.key ?? notFound();
const can = (s: StaffContext, ...keys: string[]) => keys.every((k) => s.keys.includes(k));
/** Both keys publish here: saving is publishing in this slice (no drafts yet). */
export const canPublish = (s: StaffContext) => can(s, "agent/template:edit", "agent/template:publish");

export class TemplatesService {
  constructor(private readonly db: PrismaClient, private readonly source: TemplateRecords) {}

  /** The firm's newest published version of a kind, or null (ExpatReady's wording in use). */
  private async current(db: PrismaClient | Tx, firmId: string, key: string) {
    return db.msgTemplateVersion.findFirst({
      where: firmScope(firmId, { template: { key, channel: CHANNEL, language: LANGUAGE, owner: "FIRM" as const } }),
      orderBy: { version: "desc" }, select: { version: true, subject: true, body: true, publishedAt: true },
    });
  }

  async list(s: StaffContext) {
    const rows = await this.db.msgTemplateVersion.findMany({
      where: firmScope(s.firmId, { template: { key: { in: KINDS.map((k) => k.key) }, channel: CHANNEL, language: LANGUAGE, owner: "FIRM" as const } }),
      select: { version: true, template: { select: { key: true } } },
    });
    const newest = new Map<string, number>();
    for (const r of rows) newest.set(r.template.key, Math.max(newest.get(r.template.key) ?? 0, r.version));
    return { templates: KINDS.map((k) => ({ key: k.key, name: k.name, sentTo: k.sentTo, list: k.list, purpose: k.purpose, version: newest.get(k.key) ?? 0 })) };
  }

  async read(s: StaffContext, key: string) {
    const kind = kindOf(key) ?? notFound();
    const v = await this.current(this.db, s.firmId, kind.key);
    return {
      key: kind.key, name: kind.name, sentTo: kind.sentTo, list: kind.list, purpose: kind.purpose, channel: "Email", language: "English",
      subject: v?.subject ?? kind.starter.subject, body: v?.body ?? kind.starter.body, version: v?.version ?? 0, publishedAt: v?.publishedAt ?? null,
      fields: FIELDS[kind.recordType].map(({ key: k, label }) => ({ key: k, label })), limits: LIMITS,
      canEdit: canPublish(s), canPreview: can(s, "agent/template:preview"),
    };
  }

  /** The checks a publish applies (AG-12-66), each refusal a 422 on its field, in the person's words. */
  private refusals(kind: TemplateKind, subject: string, body: string): Record<string, string> {
    const out: Record<string, string> = {};
    const s = subject.trim();
    if (!s) out.subject = "Write a subject.";
    else if (s.length > LIMITS.subject) out.subject = `The subject is ${s.length} characters; at most ${LIMITS.subject}.`;
    else if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(s)) out.subject = "The subject must be one line.";
    else if (LONE_SURROGATE.test(s)) out.subject = "The subject holds a broken character: retype it.";
    if (!body.trim()) out.body = "Write the message.";
    else if (body.length > LIMITS.body) out.body = `The message is ${body.length} characters; at most ${LIMITS.body}.`;
    // Line breaks and tabs only (break m1, m3): a control character or a broken one is refused, never stored or mangled.
    else if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(body)) out.body = "The message holds a control character: remove it.";
    else if (LONE_SURROGATE.test(body)) out.body = "The message holds a broken character: retype it.";
    for (const [field, text] of [["subject", subject], ["body", body]] as const) {
      const bad = unknownFields(kind.recordType, text);
      if (bad.length && !out[field]) out[field] = `${bad.map((f) => `{{ ${f} }}`).join(", ")} ${bad.length === 1 ? "is not a field" : "are not fields"} of this message. Insert fields from the list.`;
      else if (strayBraces(text) && !out[field]) out[field] = "Remove the lone {{ or }}: insert fields from the list.";
    }
    return out;
  }

  async publish(s: StaffContext, key: string, b: z.output<typeof PublishBody>) {
    const kind = kindOf(key) ?? notFound();
    const subject = b.subject.trim(), body = b.body.replace(/\r\n?/g, "\n");
    const fields = this.refusals(kind, b.subject, body);
    if (Object.keys(fields).length) problem(FIELD_ERROR_STATUS, "Not published", Object.values(fields)[0], { code: "INVALID", fields });
    return this.db.$transaction(async (tx) => {
      await ensureMessagesFirm(tx, s.firmId);
      // One publisher per firm and template at a time: the second waits, then sees the first's version (AG-12-69).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`msg_template:${s.firmId}:${kind.key}`}))`;
      const now = await this.current(tx, s.firmId, kind.key);
      if ((now?.version ?? 0) !== b.baseVersion) problem(409, "Not published", `Someone published version ${now?.version ?? 0} of this message after you opened it. Reload to see it; your wording was not saved.`, { code: "STALE_VERSION", version: now?.version ?? 0 });
      const t = await tx.msgTemplate.findFirst({ where: firmScope(s.firmId, { key: kind.key, channel: CHANNEL, language: LANGUAGE }), select: { id: true } })
        ?? await tx.msgTemplate.create({ data: { firmId: s.firmId, owner: "FIRM", key: kind.key, kind: kind.list.toLowerCase(), channel: CHANNEL, language: LANGUAGE }, select: { id: true } });
      const version = (now?.version ?? 0) + 1;
      await tx.msgTemplateVersion.create({ data: { firmId: s.firmId, templateId: t.id, version, subject, body, publishedBy: actorWord(s.staffId) } });
      await auditEvent.record(tx, {
        firmId: s.firmId, actor: actorWord(s.staffId), action: "platform.template.publish", entity: "msg_template",
        entityKey: `${s.firmId}:${kind.key}`, summary: `Template ${kind.key} (${kind.name}): version ${version} published`, detail: { key: kind.key },
        before: now ? { version: now.version } : null, after: { version },   // the version only, never the wording (AG-12-95)
      });
      return { key: kind.key, version, published: true };
    });
  }

  /** The leads the person may preview with (AG-12-89). */
  async records(s: StaffContext, { q }: z.output<typeof RecordsQuery>) {
    return { records: await this.source.find(s, q ?? "") };
  }

  /** The wording on the form, filled from a lead the person may open (else 404) or the Sample lead (AG-12-89, -90); a
   *  missing value is a part with value null (shown marked, never blank); a field the type lacks is marked unknown. */
  async preview(s: StaffContext, key: string, b: z.output<typeof PreviewBody>) {
    const kind = kindOf(key) ?? notFound();
    const firm = await this.db.platformFirm.findUnique({ where: { id: firmScope(s.firmId).firmId }, select: { operatingName: true } });
    let record: { label: string; sample: boolean; language: string };
    let values: Record<string, string | null>;
    if (b.leadId) {
      // A real record needs the lead's own read key too (AG-12 §10 "Enforcement"); without it, the lead read's not-found.
      if (!can(s, "agent/prospect:show")) problem(404, "Not found", "No such lead in your firm.", { code: "NOT_FOUND" });
      const r = await this.source.values(s, b.leadId);
      values = { ...r.values, firm_name: firm?.operatingName ?? null };
      record = { label: r.label, sample: false, language: "English" };   // English only in Release 1 (SA-05 v3.6 AG16-88)
    } else {
      values = Object.fromEntries(FIELDS[kind.recordType].map((f) => [f.key, f.sample]));
      record = { label: "Sample lead", sample: true, language: "English" };
    }
    const subject = partsOf(kind.recordType, b.subject, values), body = partsOf(kind.recordType, b.body, values);
    const unknown = [...new Set([...unknownFields(kind.recordType, b.subject), ...unknownFields(kind.recordType, b.body)])];
    const missing = [...new Set([...subject, ...body].flatMap((p) => ("field" in p && p.value === null && !unknown.includes(p.field) ? [p.label] : [])))];
    return { record, subject, body, missing, unknown };
  }
}
