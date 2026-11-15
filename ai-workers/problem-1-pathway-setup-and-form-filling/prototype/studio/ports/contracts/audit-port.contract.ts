// PF-0c: AuditPort's contract (ports/audit.ts). Run by fakeAudit and by the interim adapter AuditEventAdapter
// (api/src/platform/audit/audit-event.ts). The port file's sentences: record(tx, entry) writes one line inside the
// caller's own transaction, so a transaction that rolls back keeps no line (fail-closed); a refused entry (no firm, an
// actor that is not staff:/system:/seed:, an entity outside the areas, an email address in detail) throws and records
// nothing; the trail is per firm (the firm id travels with each line) and only grows: a new line never changes an
// earlier one.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { AuditEntry, AuditPort } from "../audit.ts";

/** One line as the trail holds it (the parts every adapter keeps). */
export type AuditLine = { actor: string; action: string; entity: string; entityKey: string; summary: string };

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
    name: "the trail only grows: a second line keeps the first as it was, in order",
    async run() {
      const h = await make(), t = tag();
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-1`, { summary: "First." })));
      await h.commit((tx) => h.audit.record(tx, entry(`${t}-2`, { action: "retainer.viewed", summary: "Second." })));
      const got = await h.lines(FIRM_A, t);
      expect(got.map((l) => `${l.entityKey}:${l.action}:${l.summary}`).join("|") === `${t}-1:retainer.sent:First.|${t}-2:retainer.viewed:Second.`, "both lines, the first unchanged", got);
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
      expect((await h.lines(FIRM_A, t)).length === 0, "nothing recorded", await h.lines(FIRM_A, t));
    },
  },
]);
