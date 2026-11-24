// FO-6 part 2 (P-606 (8)): SigningPort's contract (./port.ts), run by fakeSigning here and by FO-6v's vendor adapter on
// recorded responses, so the fake never promises what the vendor adapter does not do. The port file's sentences: a send
// takes no email and no vendor option, needs at least one client and at most one firm signer (FO-6d: a
// clients-only send is accepted and completes once every client signed); a second send of one
// request is refused; each signer gets an embedded link; another firm's or an unknown document or signer reads as not
// found; a cancelled envelope gives no link and cancelling again changes nothing; the files come only once all signed,
// sealed and audit apart; a webhook verifies only with its own signature on the exact body, a malformed one is null and
// never a throw, and a genuine event that changes nothing is verified as "other" (not refused).
import { defineContract, expect, expectRefused } from "../../../../ports/contracts/contract.ts";
import { SigningEnded, SigningNotCompleted, SigningNotFound, SigningRefused, type SigningHookCall, type SigningPort } from "./port.ts";

const FIRM_A = "0f060f06-0000-4000-8000-0000000000a1", FIRM_B = "0f060f06-0000-4000-8000-0000000000b2";
const id = (n: number) => `0f060f06-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CLIENT_1 = id(11), CLIENT_2 = id(12), FIRM_SIGNER = id(21);
const doc = { bytes: new TextEncoder().encode("Sample retainer agreement v1"), contentType: "application/pdf" };
const signers = [{ signerId: CLIENT_1, role: "CLIENT" as const, name: "Client A" }, { signerId: CLIENT_2, role: "CLIENT" as const, name: "Client B" }, { signerId: FIRM_SIGNER, role: "FIRM" as const, name: "Representative" }];
const send = (p: SigningPort, requestId = id(1), firmId = FIRM_A) => p.send({ firmId, requestId, title: "Sample retainer", document: doc, signers });

/** The harness: an empty adapter, and a way to play a signer's step at the provider (recorded responses for a vendor). */
export type SigningHarness = {
  port: SigningPort;
  act(firmId: string, providerDocumentId: string, signerId: string, step: "viewed" | "signed" | "declined"): Promise<SigningHookCall[]>;
  /** One genuine provider call about the document that changes nothing here (a vendor's sent or revoked event). */
  other(firmId: string, providerDocumentId: string): Promise<SigningHookCall>;
};

export const signingPortContract = defineContract("SigningPort", (make: () => Promise<SigningHarness> | SigningHarness) => [
  {
    name: "a send answers a provider document id; a second send of the same request is refused",
    async run() {
      const { port } = await make(), a = await send(port);
      expect(typeof a.providerDocumentId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(a.providerDocumentId), "a provider document id our table takes", a);
      await expectRefused(() => send(port), "the same request again", (e) => e instanceof SigningRefused);
      const b = await send(port, id(2));
      expect(b.providerDocumentId !== a.providerDocumentId, "another request is another document");
    },
  },
  {
    name: "a send with an email address, a vendor-email option, two firm signers, one signer twice or a firm signer alone is refused",
    async run() {
      const { port } = await make(), base = { firmId: FIRM_A, requestId: id(3), title: "Sample", document: doc };
      await expectRefused(() => port.send({ ...base, signers, sendEmails: true } as never), "a vendor-email option");
      await expectRefused(() => port.send({ ...base, signers: signers.map((s) => ({ ...s, email: "a@example.com" })) } as never), "a signer's email address");
      await expectRefused(() => port.send({ ...base, signers: [...signers, { signerId: id(22), role: "FIRM", name: "Second" }] }), "two firm signers");
      await expectRefused(() => port.send({ ...base, signers: [signers[0], signers[0], signers[2]] }), "one signer twice");
      await expectRefused(() => port.send({ ...base, signers: [signers[2]] }), "a firm signer alone (no client)");
    },
  },
  {
    name: "FO-6d: a send with clients only (no firm signer) is accepted, and its files come once every client signed",
    async run() {
      const h = await make(), only = signers.filter((s) => s.role === "CLIENT");
      const { providerDocumentId: d } = await h.port.send({ firmId: FIRM_A, requestId: id(4), title: "Sample document", document: doc, signers: only });
      await h.act(FIRM_A, d, CLIENT_1, "signed");
      await expectRefused(() => h.port.fetchFiles(FIRM_A, d), "the files before the second client signed", (e) => e instanceof SigningNotCompleted);
      const calls = await h.act(FIRM_A, d, CLIENT_2, "signed");
      expect(calls.length === 2, "the last client's signature brings the completed event");
      const f = await h.port.fetchFiles(FIRM_A, d);
      expect(f.sealed.bytes.length > 0 && f.audit.bytes.length > 0, "the sealed and audit files come once every client signed");
    },
  },
  {
    name: "each signer gets an embedded link; another firm, an unknown document or an unknown signer reads as not found",
    async run() {
      const { port } = await make(), { providerDocumentId: d } = await send(port);
      for (const s of signers) {
        const l = await port.embeddedLink(FIRM_A, d, s.signerId);
        expect(/^https:\/\//.test(l.url) && l.expiresAt instanceof Date, "an https link with its expiry", l);
      }
      await expectRefused(() => port.embeddedLink(FIRM_B, d, CLIENT_1), "firm B's link to firm A's document", (e) => e instanceof SigningNotFound);
      await expectRefused(() => port.embeddedLink(FIRM_A, "fake-never-sent", CLIENT_1), "an unknown document", (e) => e instanceof SigningNotFound);
      await expectRefused(() => port.embeddedLink(FIRM_A, d, id(99)), "an unknown signer", (e) => e instanceof SigningNotFound);
    },
  },
  {
    name: "a signer who signed gets no new link (a link reopens only until its signer signs)",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      await h.act(FIRM_A, d, CLIENT_1, "signed");
      await expectRefused(() => h.port.embeddedLink(FIRM_A, d, CLIENT_1), "a link for a signer who signed", (e) => e instanceof SigningEnded);
      const l = await h.port.embeddedLink(FIRM_A, d, CLIENT_2);
      expect(/^https:\/\//.test(l.url), "the other client still gets theirs", l);
    },
  },
  {
    // The link refusal is the adapter's evidence; the refused act is the harness's (on recorded vendor responses it shows the recording).
    name: "a cancelled document gives no link (and the harness cannot sign it); cancelling again changes nothing; another firm cannot cancel it",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      await expectRefused(() => h.port.cancel(FIRM_B, d), "firm B cancels firm A's document", (e) => e instanceof SigningNotFound);
      await h.port.cancel(FIRM_A, d);
      await h.port.cancel(FIRM_A, d);
      await expectRefused(() => h.port.embeddedLink(FIRM_A, d, CLIENT_1), "a link after cancel", (e) => e instanceof SigningEnded);
      await expectRefused(() => h.act(FIRM_A, d, CLIENT_1, "signed"), "a signature after cancel", (e) => e instanceof SigningEnded);
    },
  },
  {
    name: "the files come only once every signer signed: sealed and audit, two different non-empty files; a completed document cannot be cancelled",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      await h.act(FIRM_A, d, CLIENT_2, "signed");
      await expectRefused(() => h.port.fetchFiles(FIRM_A, d), "files before every signature", (e) => e instanceof SigningNotCompleted);
      await h.act(FIRM_A, d, CLIENT_1, "signed");
      const last = await h.act(FIRM_A, d, FIRM_SIGNER, "signed");
      const events = await Promise.all(last.map((c) => h.port.verifyWebhook(c)));
      expect(events.some((e) => e?.type === "completed" && e.providerDocumentId === d), "the last signature brings a completed event", events);
      const f = await h.port.fetchFiles(FIRM_A, d);
      expect(f.sealed.bytes.length > 0 && f.audit.bytes.length > 0 && Buffer.compare(Buffer.from(f.sealed.bytes), Buffer.from(f.audit.bytes)) !== 0, "two different files", { sealed: f.sealed.bytes.length, audit: f.audit.bytes.length });
      await expectRefused(() => h.port.fetchFiles(FIRM_B, d), "firm B's fetch", (e) => e instanceof SigningNotFound);
      await expectRefused(() => h.port.cancel(FIRM_A, d), "cancel after completion", (e) => e instanceof SigningEnded);
    },
  },
  {
    name: "a webhook verifies only with its own signature on the exact body; each event has its own id",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      const [viewed] = await h.act(FIRM_A, d, CLIENT_1, "viewed"), [declined] = await h.act(FIRM_A, d, CLIENT_2, "declined");
      const v = await h.port.verifyWebhook(viewed), x = await h.port.verifyWebhook(declined);
      expect(v?.type === "viewed" && v.signerId === CLIENT_1 && v.providerDocumentId === d && v.provider === h.port.provider, "the viewed event", v);
      expect(x?.type === "declined" && x.eventId !== v?.eventId, "the declined event, another id", x);
      const altered = new Uint8Array(viewed.body); altered[altered.length - 2] ^= 1;
      expect(await h.port.verifyWebhook({ headers: viewed.headers, body: altered }) === null, "an altered body is not verified");
      expect(await h.port.verifyWebhook({ headers: {}, body: viewed.body }) === null, "no signature is not verified");
      expect(await h.port.verifyWebhook({ headers: Object.fromEntries(Object.keys(viewed.headers).map((k) => [k, "0".repeat(64)])), body: viewed.body }) === null, "a wrong signature is not verified");
      await expectRefused(() => h.port.embeddedLink(FIRM_A, d, CLIENT_1), "a link after a decline", (e) => e instanceof SigningEnded);
      await expectRefused(() => h.port.cancel(FIRM_A, d), "a cancel after a decline (a withdraw racing the decline)", (e) => e instanceof SigningEnded);
    },
  },
  {
    name: "a malformed signature (shorter, longer, empty, not hex, a repeated header) is null and never a throw",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      const [call] = await h.act(FIRM_A, d, CLIENT_1, "viewed");
      for (const [k, v] of Object.entries(call.headers)) {
        if (typeof v !== "string") continue;
        for (const bad of [v.slice(0, -1), `${v}0`, "", "zz", [v, v] as unknown as string]) {
          let got: unknown = "threw";
          try { got = await h.port.verifyWebhook({ headers: { ...call.headers, [k]: bad }, body: call.body }); } catch (e) { got = `threw ${e instanceof Error ? e.name : String(e)}`; }
          if (k.toLowerCase() === "content-type") continue;
          expect(got === null, `header ${k} set to a malformed value is null`, { value: String(bad).slice(0, 80), got: got && typeof got === "object" ? "an event" : got });
        }
      }
    },
  },
  {
    name: "a genuine event that changes nothing is verified as other (answered, never refused as unverified)",
    async run() {
      const h = await make(), { providerDocumentId: d } = await send(h.port);
      const e = await h.port.verifyWebhook(await h.other(FIRM_A, d));
      expect(e !== null && e.type === "other" && e.providerDocumentId === d && typeof e.providerType === "string" && e.providerType.length > 0, "a verified other event", e);
    },
  },
]);
