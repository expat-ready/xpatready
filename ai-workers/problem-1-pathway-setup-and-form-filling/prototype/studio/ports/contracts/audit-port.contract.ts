// PF-0c: AuditPort's contract (ports/audit.ts). Run by fakeAudit and by the interim adapter AuditEventAdapter
// (api/src/platform/audit/audit-event.ts). The port file's sentences: record(tx, entry) writes one line inside the
// caller's own transaction, so a transaction that rolls back keeps no line (fail-closed); a refused entry (no firm, an
// actor that is not staff:/system:/seed:, an entity outside the areas, an email address in detail) throws and records
// nothing; the trail is per firm (the firm id travels with each line) and only grows: a new line never changes an
// earlier one. A given caseId is kept on the line (AUD-1b). R1.8 (QA-594): a line's before and after are kept, in the one
// shape `<field>_before` / `<field>_after` (ports/audit.ts flattenValues), personal values in full; a secret is refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { AuditEntry, AuditPort } from "../audit.ts";

/** One line as the trail holds it (the parts every adapter keeps). */
export type AuditLine = { actor: string; action: string; entity: string; entityKey: string; summary: string; caseId?: string | null;
  /** R1.8: the line's before and after values as `<field>_before` / `<field>_after` (none: an empty object). */
  values?: Record<string, unknown> };

/** What an audit adapter's test hands the contract. */
export type AuditHarness<Tx> = {
  audit: AuditPort<Tx>;
  /** Runs `fn` in a transaction that commits. */
  commit(fn: (tx: Tx) => Promise<void>): Promise<void>;
  /** Runs `fn` in a transaction, then rolls it back (fn's own error, if any, is swallowed). */
  rollback(fn: (tx: Tx) => Promise<void>): Promise<void>;
  /** The committed lines of `firmId` whose entityKey starts with `prefix`, oldest first. */
  lines(firmId: string, prefix: string): Promise<AuditLine[]>;
};

const FIRM_A = "0c0c0c0c-0000-4000-8000-0000000000a1", FIRM_B = "0c0c0c0c-0000-4000-8000-0000000000b2";
let run = 0;
const tag = () => `pf0c-${Date.now().toString(36)}-${++run}`;
const entry = (key: string, o: Partial<AuditEntry> = {}): AuditEntry => ({ firmId: FIRM_A, actor: "system:pf0c-contract", action: "retainer.sent", entity: "fo_retainer", entityKey: key, summary: "A retainer was sent.", detail: { retainerId: key }, ...o });

export const auditPortContract = defineContract("AuditPort", (make: () => Promise<AuditHarness<unknown>> | AuditHarness<unknown>) => [
  {
    name: "a line recorded in a committed transaction is in the firm's trail",
    async run() {
      const h = await make(), t = tag();
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`)));
      const got = await h.lines(FIRM_A, t);
      expect(got.length === 1 && got[0].action === "retainer.sent" && got[0].entity === "fo_retainer" && got[0].entityKey === `${t}-1` && got[0].actor === "system:pf0c-contract" && got[0].summary === "A retainer was sent.", "one line, as recorded", got);
    },
  },
  {
    name: "a line recorded in a transaction that rolls back is gone (fail-closed)",
    async run() {
      const h = await make(), t = tag();
      await h.rollback((tx) => h.audit.record(tx, entry(`${t}-1`)));
      expect((await h.lines(FIRM_A, t)).length === 0, "no line after the rollback", await h.lines(FIRM_A, t));
    },
  },
  {
    name: "the trail is per firm: firm B's trail never holds firm A's line",
    async run() {
      const h = await make(), t = tag();
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-a`)));
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-b`, { firmId: FIRM_B })));
      const a = await h.lines(FIRM_A, t), b = await h.lines(FIRM_B, t);
      expect(a.map((l) => l.entityKey).join() === `${t}-a` && b.map((l) => l.entityKey).join() === `${t}-b`, "each firm sees its own line only", { a, b });
    },
  },
  {
    name: "the trail only grows: a second line about the same record keeps the first as it was, in order",
    async run() {
      const h = await make(), t = tag();
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`, { summary: "First." })));
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`, { action: "retainer.viewed", summary: "Second." })));
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-2`, { summary: "Another record." })));
      const got = await h.lines(FIRM_A, t);
      expect(got.map((l) => `${l.entityKey}:${l.action}:${l.summary}`).join("|") === `${t}-1:retainer.sent:First.|${t}-1:retainer.viewed:Second.|${t}-2:retainer.sent:Another record.`, "every line kept: the same record's second line never replaces its first", got);
    },
  },
  {
    name: "a given caseId is kept on the line; a line without one has none (AUD-1b)",
    async run() {
      const h = await make(), t = tag(), caseId = "0c0c0c0c-0000-4000-8000-0000000000c3";
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`, { caseId })));
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-2`)));
      const got = await h.lines(FIRM_A, t);
      expect(got.length === 2 && got[0].caseId?.toLowerCase() === caseId && !got[1].caseId, "the first line keeps its case, the second has none", got);
    },
  },
  {
    name: "a line's before and after are kept in full, personal values included; a secret in them is refused (R1.8, QA-594)",
    async run() {
      const h = await make(), t = tag();
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`, { before: { phone: "+1 416 555 0100" }, after: { phone: "+1 416 555 0199" } })));
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, entry(`${t}-2`, { before: null, after: { resetToken: "x" } }))), "a token in after");
      const got = await h.lines(FIRM_A, t);
      expect(got.length === 1 && Object.keys(got[0].values ?? {}).sort().join() === "phone_after,phone_before" && got[0].values?.phone_before === "+1 416 555 0100" && got[0].values?.phone_after === "+1 416 555 0199", "the change kept in full; the secret line not written", got);
    },
  },
  {
    name: "a refused entry throws and records nothing (no firm, a bad actor, a case entity, an email in detail)",
    async run() {
      const h = await make(), t = tag();
      const { firmId: _f, ...noFirm } = entry(`${t}-x`);
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, noFirm as AuditEntry)), "no firm");
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, entry(`${t}-x`, { actor: "alice" }))), "an actor that is not staff:, system: or seed:");
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, entry(`${t}-x`, { entity: "case" }))), "a case entity");
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, entry(`${t}-x`, { detail: { to: "client.a@example.com" } }))), "an email address in detail");
      await expectRefused(() => h.commit((tx) => h.audit.record(tx, entry(`${t}-x`, { caseId: "case-1" }))), "a case id that is not a uuid");
      expect((await h.lines(FIRM_A, t)).length === 0, "nothing recorded", await h.lines(FIRM_A, t));
    },
  },
]);
