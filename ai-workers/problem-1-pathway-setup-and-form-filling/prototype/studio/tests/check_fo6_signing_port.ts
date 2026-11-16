// FO-6 part 2 (BACKLOG row FO-6; contracts §2.4, §7; P-563, P-564, P-606 (8)): SigningPort's contract on its fake adapter,
// and the proof that the contract catches an adapter that would let the provider email (a send with a vendor-email option
// or a signer's address must be refused). No server, no database, no network, no model call (US$0). Every value is Sample.
//   tsx studio/tests/check_fo6_signing_port.ts
import { runContract } from "../ports/contracts/contract.ts";
import { signingPortContract } from "../api/src/front-office/signing/contract.ts";
import { fakeSigning } from "../api/src/front-office/signing/port.ts";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); };

await runContract(signingPortContract, "fakeSigning", () => { const p = fakeSigning(); return { port: p, act: p.act, other: p.other }; }, ok);
{ // the contract catches a fake that would let the vendor email (DW3-style: a broken adapter fails it)
  const p = fakeSigning();
  const loose = Object.assign(Object.create(null), p, { provider: p.provider, send: (i: Record<string, unknown>) => { const { sendEmails: _drop, ...rest } = i; return p.send({ ...rest, signers: (rest.signers as { signerId: string; role: "CLIENT" | "FIRM"; name: string }[]).map(({ signerId, role, name }) => ({ signerId, role, name })) } as never); } });
  const r = await runContract(signingPortContract, "looseFake", () => ({ port: loose, act: p.act, other: p.other }), null);
  ok("FO-6 fail (the contract works): an adapter that takes a vendor-email option or a signer's email fails the contract", r.failed.some((n) => /email/.test(n)), r);
  // An adapter that compares the signature without checking its length first (timingSafeEqual throws RangeError on a
  // shorter value): a hostile webhook would become a 500. The contract must catch it (review M2 on #2040).
  const unsafe = { ...p, provider: p.provider, verifyWebhook: async (c: Parameters<typeof p.verifyWebhook>[0]) => {
    const v = Object.values(c.headers).find((x) => typeof x === "string" && x.length !== 64 && !/json/.test(x));
    if (v !== undefined) throw new RangeError("Input buffers must have the same byte length");
    return p.verifyWebhook(c);
  } };
  const r2 = await runContract(signingPortContract, "lengthUnsafeFake", () => ({ port: unsafe, act: p.act, other: p.other }), null);
  ok("FO-6 fail (the contract works): an adapter that throws on a signature of another length fails the contract", r2.failed.some((n) => /malformed/.test(n)), r2);
}

{ // the fake's own promises the contract does not name: the provider never emails, links are short-lived, nothing leaks
  const p = fakeSigning({ now: () => new Date("2026-11-16T10:00:00Z") });
  const firm = "0f060f06-0000-4000-8000-0000000000a1", s = (n: number) => `0f060f06-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const { providerDocumentId } = await p.send({ firmId: firm, requestId: s(1), title: "Sample", document: { bytes: new Uint8Array([1]), contentType: "application/pdf" },
    signers: [{ signerId: s(2), role: "CLIENT", name: "Client A" }, { signerId: s(3), role: "FIRM", name: "Representative" }] });
  const l = await p.embeddedLink(firm, providerDocumentId, s(2));
  ok("FO-6 pass: the fake's embedded link lives 10 minutes (Sample) on the injected clock", l.expiresAt.toISOString() === "2026-11-16T10:10:00.000Z", l);
  ok("FO-6 pass: the fake records no email call: send, link only", p.calls.map((c) => c.op).join(",") === "send,embeddedLink", p.calls);
  const [h] = await p.act(firm, providerDocumentId, s(2), "viewed");
  ok("FO-6 pass: a webhook body carries ids and facts only (no name, no email)", !/Client A|@/.test(new TextDecoder().decode(h.body)), new TextDecoder().decode(h.body));
  const other = fakeSigning();
  ok("FO-6 fail: another fake instance (another key) does not verify this webhook", await other.verifyWebhook(h) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
