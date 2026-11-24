// FO-6 part 2 (BACKLOG row FO-6; contracts §2.4, §7; P-563, P-564): the signing port, vendor-neutral. The front office
// asks a provider to carry one document to its signers, gets each signer's embedded signing link, cancels, fetches the
// sealed file and the provider's audit file once all have signed, and checks a webhook is the provider's own. Every email
// a signer gets is ours (MailPort, the row's API part): the port takes no address and has no vendor-email option, so a send that
// carries one is refused (strict input). No vendor code here: the BoldSign adapter is FO-6v. The fake below is the only
// adapter for now; both pass signingPortContract (./contract.ts). Every value is Sample. Legal points (e-signature
// identity, D-6): Unconfirmed: no counsel.
// For FO-6v (review of #2040): a vendor that needs a signer address to create an envelope or an embedded link gets one
// the adapter makes from the signer id on a non-routable domain (`<signerId>@signers.invalid`), with every vendor email
// off; the vendor's audit file then shows that made-up address next to our own record of who signed (Unconfirmed: no
// counsel). A second send of one request is refused: the adapter finds an envelope it already made by the requestId it
// put in the vendor's metadata, so a lost answer never leaves a second envelope (our table also allows one send per
// version, #2038). The adapter's own test runs signingPortContract (./contract.ts); FO-6v's touch list adds this port
// file to tools/check-port-contracts.mjs's port list (today it reads ports/ and the identity port only).
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const Uuid = z.uuid();
export const SigningProviderName = z.enum(["FAKE", "BOLDSIGN"]);
export type SigningProviderName = z.infer<typeof SigningProviderName>;

/** One signer as the provider sees it: our signer row's id, its side and the name shown. No email address, no phone. */
export const SigningSigner = z.strictObject({ signerId: Uuid, role: z.enum(["CLIENT", "FIRM"]), name: z.string().trim().min(1).max(300) });
export type SigningSigner = z.infer<typeof SigningSigner>;

/** A send: one document, at least one client and at most one firm signer (the firm signs last, on our server), each once.
 *  A retainer or consultation agreement always names its firm signer (our server); a document of kind OTHER names one only
 *  when the sender added one (FO-6d, AG-5-61). */
export const SigningSend = z.strictObject({
  firmId: Uuid,
  requestId: Uuid,
  title: z.string().trim().min(1).max(200),
  document: z.strictObject({ bytes: z.instanceof(Uint8Array).refine((b) => b.length > 0 && b.length <= 25 * 1024 * 1024, "1 byte to 25 MB"), contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+(;.*)?$/, "a media type") }),
  signers: z.array(SigningSigner).min(1).max(10),
}).superRefine((s, ctx) => {
  const firm = s.signers.filter((x) => x.role === "FIRM").length;
  if (firm > 1) ctx.addIssue({ code: "custom", message: "at most one firm signer", path: ["signers"] });
  if (firm === s.signers.length) ctx.addIssue({ code: "custom", message: "at least one client", path: ["signers"] });
  if (new Set(s.signers.map((x) => x.signerId)).size !== s.signers.length) ctx.addIssue({ code: "custom", message: "a signer once", path: ["signers"] });
});
export type SigningSend = z.input<typeof SigningSend>;

/** What a verified webhook says happened. `eventId` is the provider's, unique per document (stored once by the API part,
 *  in fo_signing_hook_receipt, #2038). `type` "other" is a genuine event that changes nothing here (sent, revoked after
 *  our own cancel, a reminder, the vendor's set-up ping): answered 200 and stored, never refused as unverified.
 *  `providerType` is the provider's own name for it. */
export type SigningHookEvent = {
  provider: SigningProviderName;
  providerDocumentId: string;
  eventId: string;
  type: "viewed" | "signed" | "declined" | "completed" | "other";
  providerType: string;
  signerId: string | null;
  at: Date;
};
export type SigningHookCall = { headers: Record<string, string | undefined>; body: Uint8Array };
export type SigningFile = { bytes: Uint8Array; contentType: string };

export interface SigningPort {
  readonly provider: SigningProviderName;
  /** Creates the envelope; resolves with the provider's document id. A second send for one requestId is refused. */
  send(input: SigningSend): Promise<{ providerDocumentId: string }>;
  /** The signer's embedded signing link (shown inside our page, never emailed by the provider). */
  embeddedLink(firmId: string, providerDocumentId: string, signerId: string): Promise<{ url: string; expiresAt: Date }>;
  /** Ends a live envelope so it can never be signed. Again on a cancelled one: no change. A completed or declined one: SigningEnded. */
  cancel(firmId: string, providerDocumentId: string): Promise<void>;
  /** The sealed document and the provider's audit file, once every signer signed (SigningNotCompleted before). */
  fetchFiles(firmId: string, providerDocumentId: string): Promise<{ sealed: SigningFile; audit: SigningFile }>;
  /** The event when the call is the provider's own (its signature checks against the raw body), else null. Never throws
   *  on a malformed call (a signature of another length, a missing or repeated header): a hostile call is null, not a 500. */
  verifyWebhook(call: SigningHookCall): Promise<SigningHookEvent | null>;
}

/** No such envelope or signer in this firm (another firm's id reads the same: nothing leaks). */
export class SigningNotFound extends Error { constructor() { super("no such signing document"); this.name = "SigningNotFound"; } }
/** The envelope is cancelled, declined or completed: nothing more can be signed. */
export class SigningEnded extends Error { constructor(readonly state: string) { super(`signing document is ${state}`); this.name = "SigningEnded"; } }
export class SigningNotCompleted extends Error { constructor() { super("not every signer has signed"); this.name = "SigningNotCompleted"; } }
export class SigningRefused extends Error { constructor(why: string) { super(why); this.name = "SigningRefused"; } }

const LINK_MINUTES = 10;   // Sample: the provider's embedded link is short-lived; our signing session (30 min, the API part) asks again
const SIG = "x-fake-signing-signature";

type Envelope = {
  firmId: string; requestId: string; providerDocumentId: string; title: string; document: SigningFile;
  signers: Map<string, SigningSigner & { viewed: boolean; signed: boolean; declined: boolean }>;
  state: "live" | "cancelled" | "declined" | "completed"; events: number;
};

/** What the stand-in page (part 4c, ./fake-page.ts) learns from a live nonce: never a name or an address. */
export type FakePageTicket = { firmId: string; providerDocumentId: string; signerId: string; title: string; role: "CLIENT" | "FIRM" };
const NONCE = /^[A-Za-z0-9_-]{43}$/;

/** The fake: in memory, per firm. Webhooks are signed with an HMAC key made for this instance (a made-up value, never a
 *  secret). `act` plays a signer's step and returns the webhook calls the provider would make, in the order asked, so a
 *  test can force an out-of-order one: the order rule is our server's. */
//  Part 4c: with `linkBase` giving a base (a lane copy, PLATFORM_ENVIRONMENT=local only: features/front-office-signing.ts),
//  `embeddedLink` answers the copy's own stand-in page `<base>/api/public/sign-fake/<document>/<signer>/<nonce>`; the nonce
//  (32 random bytes) is kept here with its firm, document, signer and the link's 10 minutes, and is used once. Without a
//  base it answers signing.fake.invalid, as before (the contract and every suite's own fake are unchanged).
export function fakeSigning(opts: { now?: () => Date; linkBase?: () => string | null } = {}): SigningPort & {
  act(firmId: string, providerDocumentId: string, signerId: string, step: "viewed" | "signed" | "declined"): Promise<SigningHookCall[]>;
  /** A genuine call about the document that changes nothing here (the provider's "sent" event). */
  other(firmId: string, providerDocumentId: string): Promise<SigningHookCall>;
  readonly calls: ReadonlyArray<{ op: string; providerDocumentId?: string }>;
  /** Part 4c: the ticket of a live, unused, unexpired nonce for this document and signer, else null. Reads only. */
  pageTicket(providerDocumentId: string, signerId: string, nonce: string): FakePageTicket | null;
  /** Part 4c: takes the nonce (once, synchronously, so two Signs at once cannot both pass), answers its ticket or null. */
  claimTicket(providerDocumentId: string, signerId: string, nonce: string): FakePageTicket | null;
} {
  const now = opts.now ?? (() => new Date());
  const key = randomUUID(), envelopes = new Map<string, Envelope>(), byRequest = new Set<string>();
  const calls: { op: string; providerDocumentId?: string }[] = [];
  const nonces = new Map<string, { firmId: string; providerDocumentId: string; signerId: string; expiresAt: number }>();
  const endNonces = (doc: string, signerId?: string) => { for (const [k, v] of nonces) if (v.providerDocumentId === doc && (!signerId || v.signerId === signerId)) nonces.delete(k); };
  const ticketOf = (doc: string, signerId: string, nonce: string): FakePageTicket | null => {
    if (typeof nonce !== "string" || !NONCE.test(nonce)) return null;
    const n = nonces.get(nonce);
    if (!n || n.providerDocumentId !== String(doc) || n.signerId !== String(signerId)) return null;
    if (n.expiresAt <= now().getTime()) { nonces.delete(nonce); return null; }
    const e = envelopes.get(n.providerDocumentId), s = e?.signers.get(n.signerId);
    if (!e || !s || e.state !== "live" || s.signed || s.declined) return null;
    return { firmId: e.firmId, providerDocumentId: e.providerDocumentId, signerId: s.signerId, title: e.title, role: s.role };
  };
  const mac = (body: Uint8Array) => createHmac("sha256", key).update(body).digest("hex");
  const find = (firmId: string, id: string) => {
    const e = envelopes.get(String(id));
    if (!e || e.firmId !== String(firmId).toLowerCase()) throw new SigningNotFound();
    return e;
  };
  const hook = (e: Envelope, type: string, signerId: string | null): SigningHookCall => {
    const body = new TextEncoder().encode(JSON.stringify({ documentId: e.providerDocumentId, eventId: `${e.providerDocumentId}.${++e.events}`, type, signerId, at: now().toISOString() }));
    return { headers: { [SIG]: mac(body), "content-type": "application/json" }, body };
  };
  return {
    provider: "FAKE",
    async send(input) {
      const s = SigningSend.parse(input), firmId = s.firmId.toLowerCase();
      if (byRequest.has(`${firmId}|${s.requestId}`)) throw new SigningRefused("this request was sent already");
      byRequest.add(`${firmId}|${s.requestId}`);
      const providerDocumentId = `fake-${randomUUID()}`;
      envelopes.set(providerDocumentId, { firmId, requestId: s.requestId, providerDocumentId, title: s.title, document: { bytes: new Uint8Array(s.document.bytes), contentType: s.document.contentType },
        signers: new Map(s.signers.map((x) => [x.signerId, { ...x, viewed: false, signed: false, declined: false }])), state: "live", events: 0 });
      calls.push({ op: "send", providerDocumentId });
      return { providerDocumentId };
    },
    async embeddedLink(firmId, providerDocumentId, signerId) {
      const e = find(firmId, providerDocumentId), s = e.signers.get(signerId);
      if (!s) throw new SigningNotFound();
      if (e.state !== "live") throw new SigningEnded(e.state);
      if (s.signed || s.declined) throw new SigningEnded(s.signed ? "signed" : "declined");
      calls.push({ op: "embeddedLink", providerDocumentId });
      const expiresAt = new Date(now().getTime() + LINK_MINUTES * 60_000), base = opts.linkBase?.() ?? null;
      if (!base) return { url: `https://signing.fake.invalid/sign/${providerDocumentId}/${signerId}/${randomUUID()}`, expiresAt };
      const nonce = randomBytes(32).toString("base64url");
      nonces.set(nonce, { firmId: e.firmId, providerDocumentId, signerId, expiresAt: expiresAt.getTime() });
      return { url: `${base.replace(/\/+$/, "")}/api/public/sign-fake/${encodeURIComponent(providerDocumentId)}/${signerId}/${nonce}`, expiresAt };
    },
    async cancel(firmId, providerDocumentId) {
      const e = find(firmId, providerDocumentId);
      if (e.state === "completed" || e.state === "declined") throw new SigningEnded(e.state);
      e.state = "cancelled"; endNonces(e.providerDocumentId);
      calls.push({ op: "cancel", providerDocumentId });
    },
    async fetchFiles(firmId, providerDocumentId) {
      const e = find(firmId, providerDocumentId);
      if (e.state !== "completed") throw new SigningNotCompleted();
      const names = [...e.signers.values()].map((x) => `${x.role} ${x.name}`).join("; ");
      return {
        sealed: { bytes: new TextEncoder().encode(`FAKE SEALED DOCUMENT\n${e.title}\nsigned by: ${names}\n${Buffer.from(e.document.bytes).toString("base64")}\n`), contentType: "application/pdf" },
        audit: { bytes: new TextEncoder().encode(`FAKE AUDIT TRAIL\n${e.providerDocumentId}\n${names}\n`), contentType: "application/pdf" },
      };
    },
    async verifyWebhook(call) {
      const given: unknown = call.headers[SIG] ?? call.headers[SIG.toUpperCase()];
      if (typeof given !== "string" || !/^[0-9a-f]{64}$/.test(given)) return null;
      const want = Buffer.from(mac(call.body), "hex");
      if (!timingSafeEqual(want, Buffer.from(given, "hex"))) return null;
      try {
        const j = z.strictObject({ documentId: z.string().min(1).max(200), eventId: z.string().min(1).max(200), type: z.string().regex(/^[a-z][a-z_.]{0,59}$/), signerId: Uuid.nullable(), at: z.iso.datetime() }).parse(JSON.parse(new TextDecoder().decode(call.body)));
        const known = ["viewed", "signed", "declined", "completed"] as const, type = (known as readonly string[]).includes(j.type) ? j.type as typeof known[number] : "other";
        return { provider: "FAKE", providerDocumentId: j.documentId, eventId: j.eventId, type, providerType: j.type, signerId: j.signerId, at: new Date(j.at) };
      } catch { return null; }
    },
    async act(firmId, providerDocumentId, signerId, step) {
      const e = find(firmId, providerDocumentId), s = e.signers.get(signerId);
      if (!s) throw new SigningNotFound();
      if (e.state !== "live") throw new SigningEnded(e.state);
      const out = [hook(e, step, signerId)];
      if (step === "viewed") s.viewed = true;
      if (step === "declined") { s.declined = true; e.state = "declined"; endNonces(e.providerDocumentId); }
      if (step === "signed") {
        s.signed = true; endNonces(e.providerDocumentId, signerId);   // part 4c: every link this signer was given ends (challenge m1)
        if ([...e.signers.values()].every((x) => x.signed)) { e.state = "completed"; out.push(hook(e, "completed", null)); }
      }
      return out;
    },
    async other(firmId, providerDocumentId) { return hook(find(firmId, providerDocumentId), "sent", null); },
    get calls() { return [...calls]; },
    pageTicket: (doc, signerId, nonce) => ticketOf(doc, signerId, nonce),
    claimTicket(doc, signerId, nonce) { const t = ticketOf(doc, signerId, nonce); if (t) nonces.delete(nonce); return t; },
  };
}
