// PF-0c: MessagePort's contract (ports/messages.ts). Run by fakeMessages and by Messages
// (api/src/platform/messages/send/messages.ts). The port file's sentences: marketing without a live consent is written
// SUPPRESSED with the gate's reason and never sent; a suppressed address gets nothing, transactional included; the same
// idempotency key in a firm answers the first row; dispatch sends a QUEUED row once, however often it is called; a message
// carries its own firm's sender name and Reply-To; a template field without a value is refused. PF-19p: a platform
// account message (no firm) is sent once per key as ExpatReady with no firm's name; with a firm too, or as marketing, refused.
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { ConsentPort } from "../consent.ts";
import { MessageRefused, PLATFORM_ACCOUNT_NAME, type MessagePort, type Rendered } from "../messages.ts";

export type MessageHarness = {
  messages: MessagePort<unknown>;
  consent: ConsentPort<unknown>;
  /** Runs `fn` in a transaction that commits. */
  tx<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
  /** Runs whatever dispatch queued (the real runner's due jobs). */
  settle(): Promise<void>;
  /** The messages delivered to an address, oldest first. */
  sentTo(address: string): Promise<Rendered[]>;
  firmA: string; firmB: string;
  senders: Record<string, { name: string; replyTo: string }>;
  /** A template of firm A whose subject or body names the field `name`. */
  templateKey: string;
};

const uuid = () => globalThis.crypto.randomUUID();
const box = () => `pf19b.${uuid().slice(0, 8)}@example.com`;
const words = { subject: "Sample notice", text: "Sample text." };

export const messagePortContract = defineContract("MessagePort", (make: () => MessageHarness) => [
  { name: "marketing without consent is SUPPRESSED with the reason and never sent", run: async () => {
    const h = make(), to = box();
    const r = await h.tx((t) => h.messages.send(t, { firmId: h.firmA, person: { kind: "FO_PERSON", id: uuid() }, channel: "EMAIL", class: "MARKETING", address: to, content: words, idempotencyKey: uuid() }));
    await h.messages.dispatch(h.firmA, [r.outboxId]); await h.settle();
    expect(r.state === "SUPPRESSED" && r.reason === "NO_CONSENT: MARKETING", "SUPPRESSED, NO_CONSENT: MARKETING", r);
    expect((await h.sentTo(to)).length === 0, "nothing sent");
  } },
  { name: "a suppressed address gets nothing, transactional included", run: async () => {
    const h = make(), to = box();
    await h.tx((t) => h.consent.suppress(t, { firmId: h.firmA, channel: "EMAIL", address: to, reason: "HARD_BOUNCE", by: "system:pf0c" }));
    const r = await h.tx((t) => h.messages.send(t, { firmId: h.firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: to.toUpperCase(), content: words, idempotencyKey: uuid() }));
    await h.messages.dispatch(h.firmA, [r.outboxId]); await h.settle();
    expect(r.state === "SUPPRESSED" && r.reason === "SUPPRESSED: HARD_BOUNCE" && (await h.sentTo(to)).length === 0, "suppressed, nothing sent", r);
  } },
  { name: "the same idempotency key answers the first row; dispatch twice sends once", run: async () => {
    const h = make(), to = box(), key = uuid();
    const send = () => h.tx((t) => h.messages.send(t, { firmId: h.firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: to, content: words, idempotencyKey: key }));
    const a = await send(), b = await send();
    expect(a.state === "QUEUED" && !a.repeated && b.repeated && b.outboxId === a.outboxId, "one row for one key", { a, b });
    await h.messages.dispatch(h.firmA, [a.outboxId]); await h.settle();
    await h.messages.dispatch(h.firmA, [a.outboxId]); await h.settle();
    expect((await h.sentTo(to)).length === 1, "sent once", (await h.sentTo(to)).length);
  } },
  { name: "each firm's message carries its own sender name and Reply-To", run: async () => {
    const h = make(), to = box();
    for (const firmId of [h.firmA, h.firmB]) {
      const r = await h.tx((t) => h.messages.send(t, { firmId, channel: "EMAIL", class: "TRANSACTIONAL", address: to, content: words, idempotencyKey: uuid() }));
      await h.messages.dispatch(firmId, [r.outboxId]);
    }
    await h.settle();
    const got = await h.sentTo(to), a = h.senders[h.firmA], b = h.senders[h.firmB];
    expect(got.length === 2 && got.every((m) => {
      const own = m.firmId === h.firmA ? a : b, other = m.firmId === h.firmA ? b : a;
      return m.from.name === own.name && m.replyTo === own.replyTo && !m.html.includes(other.name) && m.replyTo !== other.replyTo;
    }), "own sender and Reply-To only", got.map((m) => [m.firmId, m.from.name, m.replyTo]));
  } },
  { name: "PF-19p: a platform account message is sent once per key as ExpatReady, no firm's name; with a firm, or as marketing, refused", run: async () => {
    const h = make(), to = box(), key = uuid();
    const send = () => h.tx((t) => h.messages.send(t, { platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: to, content: words, idempotencyKey: key }));
    const a = await send(), b = await send();
    await h.messages.dispatch(null, [a.outboxId]); await h.settle();
    await h.messages.dispatch(null, [a.outboxId]); await h.settle();
    const got = await h.sentTo(to), firms = Object.values(h.senders);
    expect(a.state === "QUEUED" && !a.repeated && b.repeated && b.outboxId === a.outboxId && got.length === 1 && got[0].from.name === PLATFORM_ACCOUNT_NAME
      && !firms.some((f) => got[0].html.includes(f.name) || got[0].replyTo === f.replyTo), "one message, from ExpatReady, no firm's name or Reply-To", { a, b, got: got.map((m) => [m.from.name, m.replyTo]) });
    await expectRefused(() => h.tx((t) => h.messages.send(t, { platformAccount: true, firmId: h.firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: to, content: words, idempotencyKey: uuid() } as never)), "both a firm and platformAccount");
    await expectRefused(() => h.tx((t) => h.messages.send(t, { platformAccount: true, channel: "EMAIL", class: "MARKETING", address: to, content: words, idempotencyKey: uuid() } as never)), "a marketing platform account message");
  } },
  { name: "a template field without a value is refused", run: async () => {
    const h = make();
    await expectRefused(() => h.tx((t) => h.messages.send(t, { firmId: h.firmA, channel: "EMAIL", class: "TRANSACTIONAL", address: box(), content: { templateKey: h.templateKey, values: {} }, idempotencyKey: uuid() })),
      "missing field", (e) => e instanceof MessageRefused && /"name"/.test(e.message));
  } },
]);
