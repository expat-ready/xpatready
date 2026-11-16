// PF-0c: PersonMergePort's contract (ports/person-merge.ts; FO-9b part 0). Run by fakePersonMerge and, from FO-9b part 1,
// by the real adapter (api/src/front-office/duplicates/merge/port.ts). The behaviours callers rely on (AG-2-16 rules 1,
// 4, 5, 8, §8; contract v0.1 §3.3, §7): defaults are the most complete then the most recent value, choices win; the loser
// is tombstoned on the survivor, never deleted; a self-merge, another firm's record, a person with a company, a second
// merge and a caller without the key are refused and change nothing; everything happens in the caller's transaction, so
// its rollback leaves nothing merged and no event; Undo restores both records once, and is refused after something
// reached the survivor from the loser's channel; events carry ids only.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { EVENT, PersonMergePayload } from "../events.ts";
import { PersonMergeRefused, type MergeKind, type MergeRefusalCode, type PersonMergePort } from "../person-merge.ts";
import type { StaffContext } from "../staff.ts";

/** What a person merge adapter's test hands the contract. */
export type PersonMergeHarness = {
  port: PersonMergePort<unknown>;
  /** Runs `fn` in a transaction that commits, or rolls back when `fn` throws. */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** A staff member of firm A holding `agent/prospect:merge`. */
  ctx: StaffContext;
  /** Adds a record of `kind` in firm A (or firm B with `otherFirm`) last changed at `updatedAt`; returns its id. */
  seed(kind: MergeKind, fields: Record<string, string | null>, updatedAt: Date, otherFirm?: boolean): Promise<string>;
  /** A record's merge fields and its tombstone mark (null when it does not exist). */
  read(id: string): Promise<{ fields: Record<string, unknown>; mergedIntoId: string | null } | null>;
  /** The person merge events committed so far, oldest first. */
  events(): Promise<{ type: string; payload: unknown }[]>;
  /** A new note on the survivor from the loser's email, after the merge (Undo must then refuse). */
  addFromLoserChannel(merge_ref: string): Promise<void>;
};

const at = (iso: string) => new Date(iso);
const OLD = at("2026-11-01T09:00:00Z"), NEW = at("2026-11-10T09:00:00Z");
const refusedAs = (code: MergeRefusalCode) => (e: unknown) => e instanceof PersonMergeRefused && e.code === code;
const pair = async (h: PersonMergeHarness) => ({
  s: await h.seed("PERSON", { givenNames: "Client", familyName: "B", email: null, phone: "+15550100001", language: "en", timeZone: null }, OLD),
  l: await h.seed("PERSON", { givenNames: "R. Client", familyName: "E", email: "client.b@example.com", phone: "+15550100002", language: "fr", timeZone: "America/Toronto" }, NEW),
});
const mine = async (h: PersonMergeHarness, ids: string[]) => (await h.events()).filter((e) => { const p = PersonMergePayload.safeParse(e.payload); return p.success && (ids.includes(p.data.survivorId) || ids.includes(p.data.loserId)); });

export const personMergePortContract = defineContract("PersonMergePort", (make: () => Promise<PersonMergeHarness> | PersonMergeHarness) => [
  {
    name: "with no choices every field takes the most complete, then the most recent value; the loser is tombstoned on the survivor; one person.merged with ids only",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      const out = await h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }));
      const sv = await h.read(s), lv = await h.read(l);
      expect(sv?.fields.email === "client.b@example.com" && sv.fields.timeZone === "America/Toronto", "an empty survivor field takes the loser's value", sv);
      expect(sv?.fields.phone === "+15550100002" && sv.fields.familyName === "E", "with both present, the more recent record's value", sv);
      expect(sv?.mergedIntoId === null && lv?.mergedIntoId === s, "the loser is a tombstone on the survivor, not deleted", { sv, lv });
      const ev = await mine(h, [s, l]);
      expect(ev.length === 1 && ev[0].type === EVENT.PERSON_MERGED, "one person.merged", ev);
      const p = PersonMergePayload.safeParse(ev[0].payload);
      expect(p.success && p.data.mergeRef === out.merge_ref && p.data.survivorId === s && p.data.loserId === l && p.data.kind === "PERSON", "the payload is ids only and names this merge", ev[0].payload);
    },
  },
  {
    name: "choices win field by field over the default",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      await h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l, choices: { familyName: "SURVIVOR", phone: "SURVIVOR", email: "LOSER" }, reason: "Same person, captured twice." }));
      const sv = await h.read(s);
      expect(sv?.fields.familyName === "B" && sv.fields.phone === "+15550100001" && sv.fields.email === "client.b@example.com" && sv.fields.language === "fr", "the chosen values, defaults elsewhere", sv);
    },
  },
  {
    name: "refused and nothing changed: a self-merge (400), a person with a company (409), another firm's record (404), a field of the other kind (400), a caller without the key (403)",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      const co = await h.seed("COMPANY", { operatingName: "Sample Co" }, OLD), far = await h.seed("PERSON", { givenNames: "Other", familyName: "Firm", email: null, phone: null, language: null, timeZone: null }, OLD, true);
      const tryMerge = (input: Parameters<PersonMergePort["mergePersons"]>[2], ctx = h.ctx) => h.tx((t) => h.port.mergePersons(t, ctx, input));
      await expectRefused(() => tryMerge({ kind: "PERSON", survivor_fo_id: s, loser_fo_id: s }), "self-merge", refusedAs("SELF_MERGE"));
      await expectRefused(() => tryMerge({ kind: "PERSON", survivor_fo_id: s, loser_fo_id: co }), "person with company", refusedAs("KIND_MISMATCH"));
      await expectRefused(() => tryMerge({ kind: "COMPANY", survivor_fo_id: s, loser_fo_id: l }), "kind not the records'", refusedAs("KIND_MISMATCH"));
      await expectRefused(() => tryMerge({ kind: "PERSON", survivor_fo_id: s, loser_fo_id: far }), "another firm's loser", refusedAs("NOT_FOUND"));
      await expectRefused(() => tryMerge({ kind: "PERSON", survivor_fo_id: s, loser_fo_id: l, choices: { operatingName: "LOSER" } }), "a company field on persons", refusedAs("INVALID_INPUT"));
      await expectRefused(() => tryMerge({ kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }, { ...h.ctx, keys: h.ctx.keys.filter((k) => k !== "agent/prospect:merge") }), "no merge key", refusedAs("MISSING_PERMISSION"));
      const sv = await h.read(s), lv = await h.read(l);
      expect(sv?.fields.email === null && lv?.mergedIntoId === null && (await mine(h, [s, l, co, far])).length === 0, "nothing changed, no event", { sv, lv });
    },
  },
  {
    name: "a second merge of the pair (either way round) finds a tombstone and stops (409 ALREADY_MERGED)",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      await h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }));
      await expectRefused(() => h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l })), "second merge", refusedAs("ALREADY_MERGED"));
      await expectRefused(() => h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: l, loser_fo_id: s })), "reverse merge", refusedAs("ALREADY_MERGED"));
      expect((await mine(h, [s, l])).length === 1, "one event only");
    },
  },
  {
    name: "inside a caller's transaction that then rolls back, nothing is merged and no event is written",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      await expectRefused(() => h.tx(async (t) => { await h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }); throw new Error("caller failed after the merge"); }), "caller's rollback", (e) => e instanceof Error && /caller failed/.test(e.message));
      const sv = await h.read(s), lv = await h.read(l);
      expect(sv?.fields.email === null && sv.fields.familyName === "B" && lv?.mergedIntoId === null && (await mine(h, [s, l])).length === 0, "nothing merged", { sv, lv });
    },
  },
  {
    name: "Undo restores both records and writes person.unmerged; a second Undo is refused (409 ALREADY_UNDONE); another firm's caller gets 404",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      const before = { s: await h.read(s), l: await h.read(l) };
      const { merge_ref } = await h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }));
      await expectRefused(() => h.tx((t) => h.port.unmergePersons(t, { ...h.ctx, firmId: "00000000-0000-4000-8000-0000000f0999" }, merge_ref)), "another firm's merge", refusedAs("NOT_FOUND"));
      const out = await h.tx((t) => h.port.unmergePersons(t, h.ctx, merge_ref));
      const after = { s: await h.read(s), l: await h.read(l) };
      expect(out.restored === true && JSON.stringify(after) === JSON.stringify(before), "both records as before the merge", { before, after });
      const ev = await mine(h, [s, l]);
      expect(ev.length === 2 && ev[1].type === EVENT.PERSON_UNMERGED && PersonMergePayload.safeParse(ev[1].payload).success, "person.unmerged last, ids only", ev);
      await expectRefused(() => h.tx((t) => h.port.unmergePersons(t, h.ctx, merge_ref)), "second Undo", refusedAs("ALREADY_UNDONE"));
    },
  },
  {
    name: "Undo after something reached the survivor from the loser's channel is refused (409 UNDO_REFUSED) and changes nothing",
    async run() {
      const h = await make(), { s, l } = await pair(h);
      const { merge_ref } = await h.tx((t) => h.port.mergePersons(t, h.ctx, { kind: "PERSON", survivor_fo_id: s, loser_fo_id: l }));
      await h.addFromLoserChannel(merge_ref);
      await expectRefused(() => h.tx((t) => h.port.unmergePersons(t, h.ctx, merge_ref)), "Undo after new activity", refusedAs("UNDO_REFUSED"));
      expect((await h.read(l))?.mergedIntoId === s && (await mine(h, [s, l])).length === 1, "still merged, no unmerge event");
    },
  },
]);
