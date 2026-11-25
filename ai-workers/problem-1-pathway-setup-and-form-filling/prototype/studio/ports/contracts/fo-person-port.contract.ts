// PF-0c: FoPersonPort's contract (ports/fo-person.ts; FO-1p). Run by fakeFoPerson and by the real adapter
// (api/src/front-office/people/fo-person-port.ts) in tests/check_fo1p_person_port.ts. The behaviours CS-K1 part 2 and
// FO-8 rely on (Lead B's brief, DW1-DW6): a new person or company with the given fields, created_by the typed actor, one
// audit line of ids only; nothing left by a rolled-back transaction; no automatic link to a same-email person (BR-2); a
// prospect's own party returned with no new row, and a prospect of the other kind refused; another firm's prospect "not
// found" with nothing written; a firm with no sales setup row gets one, once, and one that left gets none ("not found");
// an input of the wrong shape refused, with FO-2's text rule (AG-2-49 rule 5).
import { defineContract, expect, expectRefused } from "./contract.ts";
import { FO_PERSON_ACTION, FoPersonInvalidInput, FoPersonKindMismatch, FoPersonNotFound, NO_FRONT_OFFICE, type FoPersonPort } from "../fo-person.ts";

/** A person row as the contract reads it back. */
export type PersonRow = { firmId: string; givenNames: string | null; familyName: string | null; email: string | null; phone: string | null; phoneReadable: boolean; createdBy: string };
/** What an adapter's test hands the contract. */
export type FoPersonHarness = {
  port: FoPersonPort<unknown>;
  /** Firm A (with its sales setup row) and firm B. */
  firmId: string;
  otherFirmId: string;
  /** A typed actor of firm A (staff:<id>). */
  actor: string;
  /** Runs `fn` in a transaction as `firmId` (default firm A) that commits, or rolls back when `fn` throws. */
  tx<T>(fn: (tx: unknown) => Promise<T>, firmId?: string): Promise<T>;
  /** A new firm with no front-office sales setup row yet (DW5). */
  firmWithoutSetup(): Promise<string>;
  /** A firm with no setup row that left (DELETED): FO-1a seeds no front office for it. */
  firmThatLeft(): Promise<string>;
  /** A committed person of `firmId` with this email (DW2). */
  seedPerson(firmId: string, email: string): Promise<string>;
  /** A committed won prospect of `firmId` of `type`, with its subject person (INDIVIDUAL) or company (CORPORATE). */
  seedProspect(firmId: string, type: "INDIVIDUAL" | "CORPORATE"): Promise<{ prospectId: string; subjectId: string }>;
  readPerson(id: string): Promise<PersonRow | null>;
  readCompany(id: string): Promise<{ firmId: string; operatingName: string; createdBy: string } | null>;
  /** Committed rows of a firm: its persons, companies and sales setup rows. */
  counts(firmId: string): Promise<{ persons: number; companies: number; setups: number }>;
  /** The committed audit lines of this port's two actions, oldest first. */
  auditLines(): Promise<{ firmId: string; actor: string; action: string; entity: string; entityKey: string; summary: string; detail: unknown }[]>;
};

const refusedAs = (k: new (...a: never[]) => Error) => (e: unknown) => e instanceof k;
const mine = async (h: FoPersonHarness, key: string) => (await h.auditLines()).filter((l) => l.entityKey === key);
/** DW6: the line names no name, email or phone given outside its before and after values (ids only); R1.8 (QA-594, P-687):
 *  those values are the line's `before`/`after` (the fake's entry) or `<field>_before`/`<field>_after` (the adapter's detail). */
const outsideValues = (k: string, v: unknown) => (k === "before" || k === "after" || /_(before|after)$/.test(k) ? undefined : v);
const noPersonalData = (line: unknown, values: string[]) => { const s = JSON.stringify(line, outsideValues).toLowerCase(); return values.every((v) => !s.includes(v.toLowerCase())); };

export const foPersonPortContract = defineContract("FoPersonPort", (make: () => Promise<FoPersonHarness> | FoPersonHarness) => [
  {
    name: "DW1: ensureForClient without prospectId makes one fo_person in the firm with the given fields (email lower case, a readable phone in E.164), created_by the typed actor; DW6: one audit line, ids only",
    async run() {
      const h = await make(), before = await h.counts(h.firmId);
      const { foPersonId } = await h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Client A Sample", givenNames: "Client A", familyName: "Sample", email: " Client.A@Example.COM ", phone: "(416) 555-0101" }));
      const p = await h.readPerson(foPersonId), after = await h.counts(h.firmId);
      expect(p?.firmId === h.firmId && p.givenNames === "Client A" && p.familyName === "Sample" && p.email === "client.a@example.com", "the given fields, email lower case", p);
      expect(p?.phone === "+14165550101" && p.phoneReadable === true && p.createdBy === h.actor, "a readable phone in E.164; created_by is the actor", p);
      expect(after.persons === before.persons + 1 && after.companies === before.companies, "one new person, no company", { before, after });
      const lines = await mine(h, foPersonId);
      expect(lines.length === 1 && lines[0].action === FO_PERSON_ACTION.PERSON && lines[0].entity === "fo_person" && lines[0].actor === h.actor && lines[0].firmId === h.firmId, "one audit line naming the new person", lines);
      expect(noPersonalData(lines[0], ["Client A", "Sample", "client.a@example.com", "4165550101", "555-0101"]), "the line carries ids only", lines[0]);
    },
  },
  {
    name: "DW1: with only a display name it is kept as given names (a name part without a letter or digit is empty, as FO-2); an unreadable phone is kept as typed with phone_readable false (never refused)",
    async run() {
      const h = await make();
      const { foPersonId } = await h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "  Client B  ", givenNames: "--", familyName: " ", phone: "555-01 ext" }));
      const p = await h.readPerson(foPersonId);
      expect(p?.givenNames === "Client B" && p.familyName === null && p.email === null, "the display name as given names", p);
      expect(p?.phone === "555-01 ext" && p.phoneReadable === false, "the unreadable phone kept and flagged", p);
    },
  },
  {
    name: "DW1 fail: inside a caller's transaction that then rolls back, no person, no company and no audit line is left",
    async run() {
      const h = await make(), before = await h.counts(h.firmId);
      let made = { p: "", c: "" };
      await expectRefused(() => h.tx(async (t) => {
        made = { p: (await h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Client C" })).foPersonId, c: (await h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "Sample Rollback Co" })).foCompanyId };
        throw new Error("caller failed after the port");
      }), "caller's rollback", (e) => e instanceof Error && /caller failed/.test(e.message));
      const after = await h.counts(h.firmId);
      expect(made.p && (await h.readPerson(made.p)) === null && (await h.readCompany(made.c)) === null && JSON.stringify(after) === JSON.stringify(before), "nothing left", { before, after });
      expect((await mine(h, made.p)).length === 0 && (await mine(h, made.c)).length === 0, "no audit line");
    },
  },
  {
    name: "DW2: the same email as a person already in the firm gives a new person (no automatic link, BR-2)",
    async run() {
      const h = await make(), old = await h.seedPerson(h.firmId, "same.client@example.com");
      const { foPersonId } = await h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Same Client", email: "Same.Client@example.com" }));
      expect(foPersonId !== old && (await h.readPerson(old))?.email === "same.client@example.com" && (await h.readPerson(foPersonId))?.email === "same.client@example.com", "two persons with the one email", { old, foPersonId });
    },
  },
  {
    name: "DW3: a won Individual prospect's id gives its subject person and a won Corporate prospect's id its company, with no new row and no audit line",
    async run() {
      const h = await make(), ind = await h.seedProspect(h.firmId, "INDIVIDUAL"), corp = await h.seedProspect(h.firmId, "CORPORATE"), before = await h.counts(h.firmId), lines = (await h.auditLines()).length;
      const p = await h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Another Name", email: "other@example.com", prospectId: ind.prospectId }));
      const c = await h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "Another Co", prospectId: corp.prospectId.toUpperCase() }));
      const after = await h.counts(h.firmId);
      expect(p.foPersonId === ind.subjectId && c.foCompanyId === corp.subjectId, "the prospects' own parties", { p, c, ind, corp });
      expect(JSON.stringify(after) === JSON.stringify(before) && (await h.auditLines()).length === lines, "no new row, no audit line", { before, after });
    },
  },
  {
    name: "DW3 fail: a prospect of the other kind is refused (FoPersonKindMismatch, 409) and nothing is written",
    async run() {
      const h = await make(), ind = await h.seedProspect(h.firmId, "INDIVIDUAL"), corp = await h.seedProspect(h.firmId, "CORPORATE"), before = await h.counts(h.firmId);
      await expectRefused(() => h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Client D", prospectId: corp.prospectId })), "a Corporate prospect to ensureForClient", refusedAs(FoPersonKindMismatch));
      await expectRefused(() => h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "Client D Co", prospectId: ind.prospectId })), "an Individual prospect to ensureCompanyForClient", refusedAs(FoPersonKindMismatch));
      expect(JSON.stringify(await h.counts(h.firmId)) === JSON.stringify(before), "nothing written");
    },
  },
  {
    name: "Lead B ruling 2: ensureCompanyForClient without prospectId makes one fo_company (no person), created_by the actor, one audit line of ids only",
    async run() {
      const h = await make(), before = await h.counts(h.firmId);
      const { foCompanyId } = await h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "  Sample Maple Works Ltd " }));
      const c = await h.readCompany(foCompanyId), after = await h.counts(h.firmId), lines = await mine(h, foCompanyId);
      expect(c?.firmId === h.firmId && c.operatingName === "Sample Maple Works Ltd" && c.createdBy === h.actor, "the company as given, trimmed", c);
      expect(after.companies === before.companies + 1 && after.persons === before.persons, "one company, no person", { before, after });
      expect(lines.length === 1 && lines[0].action === FO_PERSON_ACTION.COMPANY && lines[0].entity === "fo_company" && noPersonalData(lines[0], ["Maple"]), "one audit line, ids only", lines);
    },
  },
  {
    name: "DW4 fail: firm B's prospect id, an unknown id and a non-id are FoPersonNotFound (404) and nothing is written",
    async run() {
      const h = await make(), far = await h.seedProspect(h.otherFirmId, "INDIVIDUAL"), farCo = await h.seedProspect(h.otherFirmId, "CORPORATE");
      const before = { a: await h.counts(h.firmId), b: await h.counts(h.otherFirmId) }, lines = (await h.auditLines()).length;
      const person = (prospectId: string) => h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Client E", prospectId }));
      await expectRefused(() => person(far.prospectId), "firm B's prospect", refusedAs(FoPersonNotFound));
      await expectRefused(() => h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "Client E Co", prospectId: farCo.prospectId })), "firm B's Corporate prospect", refusedAs(FoPersonNotFound));
      await expectRefused(() => person("00000000-0000-4000-8000-00000000dead"), "an unknown prospect id", refusedAs(FoPersonNotFound));
      await expectRefused(() => person("P-00001"), "a prospect id that is no id", refusedAs(FoPersonNotFound));
      const after = { a: await h.counts(h.firmId), b: await h.counts(h.otherFirmId) };
      expect(JSON.stringify(after) === JSON.stringify(before) && (await h.auditLines()).length === lines, "nothing written in either firm", { before, after });
    },
  },
  {
    name: "DW5: a firm with no sales setup row gets its person and one setup row; a second call (and a company) adds no second setup row",
    async run() {
      const h = await make(), f = await h.firmWithoutSetup();
      expect((await h.counts(f)).setups === 0, "no setup row to start with");
      const one = await h.tx((t) => h.port.ensureForClient(t, { firmId: f, actor: h.actor, displayName: "Client F" }), f);
      expect((await h.readPerson(one.foPersonId))?.firmId === f && (await h.counts(f)).setups === 1, "the person made, the setup row there once", await h.counts(f));
      await h.tx((t) => h.port.ensureForClient(t, { firmId: f, actor: h.actor, displayName: "Client G" }), f);
      await h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: f, actor: h.actor, name: "Client G Co" }), f);
      const n = await h.counts(f);
      expect(n.setups === 1 && n.persons === 2 && n.companies === 1, "still one setup row", n);
    },
  },
  {
    name: "fail (review m1): a firm that left (DELETED, no sales setup row) gets no front office: FoPersonNotFound for a person and a company, and nothing is written",
    async run() {
      const h = await make(), f = await h.firmThatLeft(), lines = (await h.auditLines()).length;
      const gone = (e: unknown) => e instanceof FoPersonNotFound && e.message === NO_FRONT_OFFICE;
      await expectRefused(() => h.tx((t) => h.port.ensureForClient(t, { firmId: f, actor: h.actor, displayName: "Client J" }), f), "a person in a firm that left", gone);
      await expectRefused(() => h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: f, actor: h.actor, name: "Client J Co" }), f), "a company in a firm that left", gone);
      const n = await h.counts(f);
      expect(n.persons === 0 && n.companies === 0 && n.setups === 0 && (await h.auditLines()).length === lines, "nothing written", n);
    },
  },
  {
    name: "fail: an input of the wrong shape (an untyped actor, a blank name, an email that is no address, a company name with no letter or digit, and FO-2's text rule: a line break, a control or direction mark, a phone over 40) is FoPersonInvalidInput (400) and nothing is written",
    async run() {
      const h = await make(), before = await h.counts(h.firmId);
      const tryPerson = (a: Record<string, unknown>) => h.tx((t) => h.port.ensureForClient(t, { firmId: h.firmId, actor: h.actor, displayName: "Client H", ...a } as never));
      await expectRefused(() => tryPerson({ actor: "Client H" }), "an untyped actor", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ actor: "user-A" }), "an old untyped actor word", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ displayName: "   " }), "a blank display name", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ email: "not an email" }), "an email that is no address", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ firmId: "firm-a" }), "a firm id that is no id", refusedAs(FoPersonInvalidInput));
      // FO-2's text rule (review m2): one line, no control or direction marks, a letter or digit, a phone at most 40.
      await expectRefused(() => tryPerson({ displayName: "Client\nH" }), "a display name over two lines", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ displayName: "--" }), "a display name with no letter or digit", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ familyName: `H${String.fromCharCode(0)}` }), "a NUL in a name", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ givenNames: `Client${String.fromCharCode(0x202e)}H` }), "a direction mark in a name", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ phone: "1".repeat(41) }), "a phone over 40 characters", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => tryPerson({ email: `h${String.fromCharCode(1)}@example.com` }), "a control mark in an email", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: " -- " })), "a company name with no letter or digit", refusedAs(FoPersonInvalidInput));
      await expectRefused(() => h.tx((t) => h.port.ensureCompanyForClient(t, { firmId: h.firmId, actor: h.actor, name: "²" })), "a company name whose only digit the database does not count (²)", refusedAs(FoPersonInvalidInput));
      expect(JSON.stringify(await h.counts(h.firmId)) === JSON.stringify(before), "nothing written");
    },
  },
]);
