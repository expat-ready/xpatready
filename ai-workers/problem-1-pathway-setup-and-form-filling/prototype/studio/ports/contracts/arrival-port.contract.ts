// PF-0c: ArrivalPort's contract (ports/arrival.ts; FO-2 part 3b). Run by fakeArrival and by the real adapter
// (api/src/front-office/sales/arrival-port.ts, PrismaArrival) in tests/check_fo2p3b_arrival_port.ts. The behaviours the
// booking service relies on, from the port's header (no new rule): a new booker makes one person and one lead, keyed
// `booking:<booking id>`, so a repeat returns the same ids and makes nothing; consent is optional; a booker with an open
// prospect makes no new lead; the only open prospect moves forward to Consult with the cause "consult booked", never
// backward, and several open prospects move none; a staff booking for a person on file makes no lead and moves the same
// way, and another firm's person is null; contactOf and bookingConsentWording read the firm's own rows only; a
// rolled-back transaction leaves nothing.
import { defineContract, expect } from "./contract.ts";
import type { ArrivalPort } from "../arrival.ts";

/** Where a prospect stands, in the contract's own words (each adapter maps its stage keys to these). */
export type Standing = "BEFORE_CONSULT" | "CONSULT" | "PAST_CONSULT";
/** What an adapter's test hands the contract. */
export type ArrivalHarness = {
  port: ArrivalPort<unknown>;
  /** Firm A (with its front office) and firm B. */
  firmId: string;
  otherFirmId: string;
  /** Runs `fn` in a transaction of the port that commits, or rolls back when `fn` throws. */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** A committed person of `firmId` with this email and an open prospect standing at `at`. */
  addProspect(firmId: string, email: string, at: "BEFORE_CONSULT" | "PAST_CONSULT"): Promise<{ personId: string; prospectId: string }>;
  /** A committed person of `firmId` (a lead or a prospect staff book for), with no prospect. */
  addPerson(firmId: string, email: string): Promise<string>;
  standing(prospectId: string): Promise<{ at: Standing; consultBooked: number }>;
  /** Committed rows of a firm: its people and its leads. */
  counts(firmId: string): Promise<{ persons: number; leads: number }>;
  /** A consent wording the firm's booking form may show (the firm's own), or null when the firm has none. */
  wordingId(firmId: string): Promise<string | null>;
};

const uuid = () => crypto.randomUUID();
let n = 0;
const booker = (tag: string) => ({ givenNames: "Client", familyName: `${tag} Sample`, email: `arrival.${tag.toLowerCase()}.${Date.now()}.${++n}@example.com` });

export const arrivalPortContract = defineContract("ArrivalPort", (make: () => Promise<ArrivalHarness> | ArrivalHarness) => [
  {
    name: "a new booker without consent makes one person and one lead, and no prospect is named; a repeat of the same booking id returns the same ids and makes nothing",
    async run() {
      const h = await make(), before = await h.counts(h.firmId), bookingId = uuid(), person = booker("New");
      const r1 = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person, bookingId }));
      const mid = await h.counts(h.firmId);
      expect(typeof r1.personId === "string" && r1.prospectId === undefined, "a person, no prospect", r1);
      expect(mid.persons === before.persons + 1 && mid.leads === before.leads + 1, "one person and one lead", { before, mid });
      const r2 = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person, bookingId }));
      const after = await h.counts(h.firmId);
      expect(r2.personId === r1.personId && r2.prospectId === undefined, "the repeat returns the same ids", { r1, r2 });
      expect(after.persons === mid.persons && after.leads === mid.leads, "the repeat makes nothing", { mid, after });
    },
  },
  {
    name: "a booker who ticks the firm's consent is taken the same way (consent is optional either way)",
    async run() {
      const h = await make(), wordingId = await h.wordingId(h.firmId);
      expect(wordingId !== null, "the harness gives the firm a booking wording");
      const before = await h.counts(h.firmId);
      const r = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: booker("Ticked"), consent: { wordingId: wordingId!, givenAt: new Date() }, bookingId: uuid() }));
      const after = await h.counts(h.firmId);
      expect(typeof r.personId === "string" && after.leads === before.leads + 1, "one lead, as without consent", { r, before, after });
    },
  },
  {
    name: "a booker with one open prospect before Consult makes no new person or lead; that prospect is named and moves to Consult with the cause \"consult booked\"",
    async run() {
      const h = await make(), email = booker("Open").email, p = await h.addProspect(h.firmId, email, "BEFORE_CONSULT"), before = await h.counts(h.firmId);
      const r = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...booker("Open"), email }, bookingId: uuid() }));
      const after = await h.counts(h.firmId), s = await h.standing(p.prospectId);
      expect(r.personId === p.personId && r.prospectId === p.prospectId, "the person and the prospect are named", { r, p });
      expect(after.leads === before.leads && after.persons === before.persons, "no new person or lead", { before, after });
      expect(s.at === "CONSULT" && s.consultBooked === 1, "moved to Consult once, cause consult booked", s);
    },
  },
  {
    name: "a prospect already past Consult is never moved back (and is still named)",
    async run() {
      const h = await make(), email = booker("Past").email, p = await h.addProspect(h.firmId, email, "PAST_CONSULT");
      const r = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...booker("Past"), email }, bookingId: uuid() }));
      const s = await h.standing(p.prospectId);
      expect(r.prospectId === p.prospectId && s.at === "PAST_CONSULT" && s.consultBooked === 0, "not moved back", { r, s });
    },
  },
  {
    name: "a booker with two open prospects makes no new lead, names no prospect and moves neither",
    async run() {
      const h = await make(), email = booker("Two").email;
      const a = await h.addProspect(h.firmId, email, "BEFORE_CONSULT"), b = await h.addProspect(h.firmId, email, "BEFORE_CONSULT"), before = await h.counts(h.firmId);
      const r = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...booker("Two"), email }, bookingId: uuid() }));
      const after = await h.counts(h.firmId), sa = await h.standing(a.prospectId), sb = await h.standing(b.prospectId);
      expect(r.prospectId === undefined && after.leads === before.leads, "no prospect named, no new lead", { r, before, after });
      expect(sa.at === "BEFORE_CONSULT" && sb.at === "BEFORE_CONSULT", "neither moves", { sa, sb });
    },
  },
  {
    name: "a staff booking for a person on file makes no lead and moves their only open prospect to Consult once; a repeat moves nothing; another firm's person is null",
    async run() {
      const h = await make(), p = await h.addProspect(h.firmId, booker("Staff").email, "BEFORE_CONSULT"), before = await h.counts(h.firmId), bookingId = uuid();
      const r = await h.tx((t) => h.port.bookingForPerson(t, { firmId: h.firmId, personId: p.personId, bookingId }));
      const again = await h.tx((t) => h.port.bookingForPerson(t, { firmId: h.firmId, personId: p.personId, bookingId }));
      const after = await h.counts(h.firmId), s = await h.standing(p.prospectId);
      expect(r?.prospectId === p.prospectId && again?.prospectId === p.prospectId, "the prospect is named, twice", { r, again });
      expect(after.leads === before.leads && s.at === "CONSULT" && s.consultBooked === 1, "no lead; moved once", { before, after, s });
      const other = await h.tx((t) => h.port.bookingForPerson(t, { firmId: h.otherFirmId, personId: p.personId, bookingId: uuid() }));
      const plain = await h.addPerson(h.firmId, booker("Plain").email);
      const noProspect = await h.tx((t) => h.port.bookingForPerson(t, { firmId: h.firmId, personId: plain, bookingId: uuid() }));
      expect(other === null, "another firm's person is null", other);
      expect(noProspect !== null && noProspect.prospectId === undefined, "a person with no prospect: no prospect named", noProspect);
    },
  },
  {
    name: "contactOf reads the firm's own person only; bookingConsentWording gives the firm's own wording or null",
    async run() {
      const h = await make(), email = booker("Contact").email, personId = await h.addPerson(h.firmId, email);
      const mine = await h.tx((t) => h.port.contactOf(t, h.firmId, personId));
      const theirs = await h.tx((t) => h.port.contactOf(t, h.otherFirmId, personId));
      expect(mine?.email === email, "the firm's own person", mine);
      expect(theirs === null, "another firm reads null", theirs);
      const w = await h.tx((t) => h.port.bookingConsentWording(t, h.firmId)), id = await h.wordingId(h.firmId);
      expect(w?.wordingId === id && typeof w?.text === "string" && w.text.length > 0, "the firm's own wording", { w, id });
    },
  },
  {
    name: "a booker on file with no phone who types one at booking: the contact then has that phone (AG-2-10 rule 3: a booking carries the phone)",
    async run() {
      const h = await make(), email = booker("Phone").email, p = await h.addProspect(h.firmId, email, "BEFORE_CONSULT");
      await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...booker("Phone"), email, phone: "+14165550177" }, bookingId: uuid() }));
      const c = await h.tx((t) => h.port.contactOf(t, h.firmId, p.personId));
      expect(c?.phone === "+14165550177", "the typed phone is the person's contact phone", c);
    },
  },
  {
    name: "FO-9b (P-747): a phone the booking door could not read arrives as typed with phoneReadable false; it is never the contact phone, and an unflagged phone that is not E.164 is refused",
    async run() {
      const h = await make(), b = booker("Unread");
      const r = await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...b, phone: "555 0101", phoneReadable: false }, bookingId: uuid() }));
      const c = await h.tx((t) => h.port.contactOf(t, h.firmId, r.personId));
      expect(c?.email === b.email.toLowerCase() && c.phone === undefined, "the person arrived; the unreadable number is no contact phone", c);
      let refused = false;
      try { await h.tx((t) => h.port.bookingArrived(t, { firmId: h.firmId, person: { ...booker("Raw"), phone: "555 0101" }, bookingId: uuid() })); } catch { refused = true; }
      expect(refused, "an unflagged phone that is not E.164 is refused by the port's input");
    },
  },
  {
    name: "an arrival in a transaction that rolls back leaves no person and no lead",
    async run() {
      const h = await make(), before = await h.counts(h.firmId);
      let threw = false;
      try { await h.tx(async (t) => { await h.port.bookingArrived(t, { firmId: h.firmId, person: booker("Rolled"), bookingId: uuid() }); throw new Error("the booking failed after its arrival"); }); } catch { threw = true; }
      const after = await h.counts(h.firmId);
      expect(threw && after.persons === before.persons && after.leads === before.leads, "nothing left", { before, after });
    },
  },
]);
