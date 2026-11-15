// PF-0c: ConsentPort's contract (ports/consent.ts). Run by fakeConsent and by ConsentStore
// (api/src/platform/messages/consent/consent-store.ts). The port file's sentences: marketing needs a live MARKETING consent
// on the channel; a WhatsApp message that is not marketing needs the live opt-in (SERVICE); service and transactional
// email need none; a withdrawal ends every consent of its key given at or before it (a late-processed one never ends
// a consent given after it), and a decision for a withdrawn
// purpose is refused (WITHDRAWN) until a new consent is given after it; a suppressed address (in any spelling) stops
// every class, and a second suppression changes nothing; a consent names its firm's wording of that channel and purpose
// (another firm's is refused); wording versions count up from the last; no consent is given in the future; a SERVICE
// consent for email is refused. The CASL reading behind these rules is Unconfirmed: no counsel.
import { defineContract, expect, expectRefused } from "./contract.ts";
import { ConsentRefused, sha256Hex, type ConsentPort, type ConsentRecordInput, type Subject } from "../consent.ts";

/** What a consent adapter's test hands the contract. */
export type ConsentHarness = {
  consent: ConsentPort<unknown>;
  /** Runs `fn` in a transaction that commits (writes need the caller's transaction). */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** What allows() reads through (a client, a transaction or anything for the fake). */
  reader: unknown;
  /** The adapter's clock. */
  now(): Date;
  /** Two firms the adapter's store knows (real platform_firm rows for the real store). */
  firmA: string;
  firmB: string;
  /** A recorder actor (`staff:<id>`, `system:<door>` or `seed:<row>`). */
  by: string;
};

const uuid = () => globalThis.crypto.randomUUID();
const person = (): Subject => ({ kind: "FO_PERSON", id: uuid() });
const ago = (h: ConsentHarness, minutes: number) => new Date(h.now().getTime() - minutes * 60_000);
const mailbox = () => `pf0c.${uuid().slice(0, 8)}@example.com`;

async function wording(h: ConsentHarness, firmId: string, channel: "EMAIL" | "WHATSAPP", purpose: "MARKETING" | "SERVICE") {
  return h.tx((t) => h.consent.publishWording(t, { firmId, channel, purpose, locale: "en", text: `Sample consent wording ${uuid()}.`, by: h.by }));
}
function given(h: ConsentHarness, subject: Subject, wordingId: string, o: Partial<ConsentRecordInput> = {}): ConsentRecordInput {
  return { firmId: h.firmA, subject, channel: "EMAIL", purpose: "MARKETING", wordingId, source: "WEB_FORM", locale: "en", recordedKind: "SELF_SERVICE", recordedBy: "system:web-form", ...o };
}

export const consentPortContract = defineContract("ConsentPort", (make: () => Promise<ConsentHarness> | ConsentHarness) => [
  {
    name: "marketing email: no consent is refused (NO_CONSENT); after record() it is allowed and names that consent",
    async run() {
      const h = await make(), p = person(), to = mailbox(), w = await wording(h, h.firmA, "EMAIL", "MARKETING");
      const q = { firmId: h.firmA, subject: p, channel: "EMAIL" as const, address: to, class: "MARKETING" as const };
      const before = await h.consent.allows(h.reader, q);
      expect(!before.allowed && before.reason === "NO_CONSENT", "no consent yet", before);
      const c = await h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: ago(h, 60) })));
      const after = await h.consent.allows(h.reader, q);
      expect(after.allowed && after.reason === "CONSENT" && after.consentId === c.id, "allowed by that consent", after);
    },
  },
  {
    name: "a withdrawn purpose is refused (WITHDRAWN) until a new consent is given after the withdrawal",
    async run() {
      const h = await make(), p = person(), to = mailbox(), w = await wording(h, h.firmA, "EMAIL", "MARKETING");
      const q = { firmId: h.firmA, subject: p, channel: "EMAIL" as const, address: to, class: "MARKETING" as const };
      await h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: ago(h, 120) })));
      const out = await h.tx((t) => h.consent.withdraw(t, { firmId: h.firmA, subject: p, channel: "EMAIL", purpose: "MARKETING", via: "UNSUBSCRIBE", by: "system:unsubscribe", at: ago(h, 60) }));
      expect(out.withdrawn === 1 && typeof out.withdrawalId === "string", "the withdrawal ends the one consent", out);
      const refused = await h.consent.allows(h.reader, q);
      expect(!refused.allowed && refused.reason === "WITHDRAWN", "refused as withdrawn", refused);
      const again = await h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: ago(h, 30) })));
      const back = await h.consent.allows(h.reader, q);
      expect(back.allowed && back.consentId === again.id, "a consent given after the withdrawal allows again", back);
    },
  },
  {
    name: "a late-processed withdrawal never ends a consent given after its time",
    async run() {
      const h = await make(), p = person(), to = mailbox(), w = await wording(h, h.firmA, "EMAIL", "MARKETING");
      const c = await h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: ago(h, 10) })));
      const out = await h.tx((t) => h.consent.withdraw(t, { firmId: h.firmA, subject: p, channel: "EMAIL", purpose: "MARKETING", via: "STAFF", by: "system:late-import", at: ago(h, 30) }));
      expect(out.withdrawn === 0, "the withdrawal ended nothing", out);
      const d = await h.consent.allows(h.reader, { firmId: h.firmA, subject: p, channel: "EMAIL", address: to, class: "MARKETING" });
      expect(d.allowed && d.consentId === c.id, "the later consent still allows", d);
    },
  },
  {
    name: "service and transactional email need no consent; a WhatsApp service message needs the opt-in",
    async run() {
      const h = await make(), p = person();
      const svc = await h.consent.allows(h.reader, { firmId: h.firmA, subject: p, channel: "EMAIL", address: mailbox(), class: "SERVICE" });
      const trx = await h.consent.allows(h.reader, { firmId: h.firmA, channel: "EMAIL", address: mailbox(), class: "TRANSACTIONAL" });
      expect(svc.allowed && svc.reason === "SERVICE_EMAIL" && trx.allowed && trx.reason === "TRANSACTIONAL", "both allowed with their reason", { svc, trx });
      const phone = `+1416555${String(Math.floor(Math.random() * 9000) + 1000)}`;
      const wa = { firmId: h.firmA, subject: p, channel: "WHATSAPP" as const, address: phone, class: "SERVICE" as const };
      const no = await h.consent.allows(h.reader, wa);
      expect(!no.allowed && no.reason === "NO_CONSENT" && no.purpose === "SERVICE", "no opt-in, no WhatsApp service message", no);
      const w = await wording(h, h.firmA, "WHATSAPP", "SERVICE");
      await h.tx((t) => h.consent.record(t, given(h, p, w.id, { channel: "WHATSAPP", purpose: "SERVICE", source: "WHATSAPP_OPT_IN_REPLY", givenAt: ago(h, 10) })));
      const yes = await h.consent.allows(h.reader, wa);
      expect(yes.allowed && yes.reason === "CONSENT", "the opt-in allows it", yes);
    },
  },
  {
    name: "a suppressed address stops every class (in any spelling); a second suppression changes nothing",
    async run() {
      const h = await make(), p = person(), to = mailbox(), w = await wording(h, h.firmA, "EMAIL", "MARKETING");
      await h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: ago(h, 60) })));
      const first = await h.tx((t) => h.consent.suppress(t, { firmId: h.firmA, channel: "EMAIL", address: to, reason: "HARD_BOUNCE", by: "system:mail-events" }));
      const second = await h.tx((t) => h.consent.suppress(t, { firmId: h.firmA, channel: "EMAIL", address: ` <${to.toUpperCase()}> `, reason: "COMPLAINT", by: "system:mail-events" }));
      expect(first.created === true && second.created === false, "created once", { first, second });
      for (const cls of ["MARKETING", "SERVICE", "TRANSACTIONAL"] as const) {
        const d = await h.consent.allows(h.reader, { firmId: h.firmA, subject: p, channel: "EMAIL", address: to.toUpperCase(), class: cls });
        expect(!d.allowed && d.reason === "SUPPRESSED" && d.suppression === "HARD_BOUNCE", `${cls} is stopped`, d);
      }
      const other = await h.consent.allows(h.reader, { firmId: h.firmB, channel: "EMAIL", address: to, class: "TRANSACTIONAL" });
      expect(other.allowed, "firm A's suppression does not stop firm B", other);
    },
  },
  {
    name: "a consent naming another firm's wording is refused; firm A's consent never allows for firm B",
    async run() {
      const h = await make(), p = person(), to = mailbox(), wA = await wording(h, h.firmA, "EMAIL", "MARKETING"), wB = await wording(h, h.firmB, "EMAIL", "MARKETING");
      await expectRefused(() => h.tx((t) => h.consent.record(t, given(h, p, wB.id))), "firm B's wording on firm A's consent", (e) => e instanceof ConsentRefused);
      await h.tx((t) => h.consent.record(t, given(h, p, wA.id, { givenAt: ago(h, 60) })));
      const b = await h.consent.allows(h.reader, { firmId: h.firmB, subject: p, channel: "EMAIL", address: to, class: "MARKETING" });
      expect(!b.allowed && b.reason === "NO_CONSENT", "firm B has no consent from this person", b);
    },
  },
  {
    name: "wording versions count up from the last, with the text's SHA-256",
    async run() {
      const h = await make(), text = `Sample marketing wording ${uuid()}.`;
      const v1 = await h.tx((t) => h.consent.publishWording(t, { firmId: h.firmA, channel: "EMAIL", purpose: "MARKETING", locale: "fr-CA", text, by: h.by }));
      const v2 = await h.tx((t) => h.consent.publishWording(t, { firmId: h.firmA, channel: "EMAIL", purpose: "MARKETING", locale: "fr-CA", text: text + " v2", by: h.by }));
      expect(v2.version === v1.version + 1 && v1.textHash === await sha256Hex(text) && v1.id !== v2.id, "the next version, hashed", { v1, v2 });
    },
  },
  {
    name: "a consent given in the future, or a SERVICE consent for email, is refused",
    async run() {
      const h = await make(), p = person(), w = await wording(h, h.firmA, "EMAIL", "MARKETING");
      await expectRefused(() => h.tx((t) => h.consent.record(t, given(h, p, w.id, { givenAt: new Date(h.now().getTime() + 3600_000) }))), "given an hour ahead", (e) => e instanceof ConsentRefused);
      await expectRefused(() => h.tx((t) => h.consent.record(t, given(h, p, w.id, { purpose: "SERVICE" }))), "a SERVICE consent for email");
    },
  },
]);
