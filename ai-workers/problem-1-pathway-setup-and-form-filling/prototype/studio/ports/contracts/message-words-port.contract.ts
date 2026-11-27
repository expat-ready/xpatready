// PF-21rs R0 (QA-757): MessageWordsPort's contract (ports/messages.ts). Run by every adapter (Messages today). What the
// breach register relies on: a firm's message gives back exactly its subject and text; anything else gives null, never
// an error: another firm's message, a stored message that changed since it was written, a malformed id.
import { defineContract, expect } from "./contract.ts";
import type { MessageWordsPort } from "../messages.ts";

/** The harness: the adapter, one firm's message with the words it was written with, another firm, and one message of
 *  the first firm whose stored copy no longer matches what was written. */
export type MessageWordsHarness = {
  port: MessageWordsPort; firmId: string; outboxId: string; words: { subject: string; text: string }; otherFirmId: string; changedOutboxId: string;
};

const safely = async (f: () => Promise<unknown>) => { try { return { v: await f() }; } catch (e) { return { e: String(e) }; } };

export const messageWordsPortContract = defineContract("MessageWordsPort", (make: () => MessageWordsHarness) => [
  {
    name: "a firm's message gives back exactly its subject and text",
    async run() {
      const h = make(), got = await h.port.storedWords(h.firmId, h.outboxId);
      expect(!!got && got.subject === h.words.subject && got.text === h.words.text && Object.keys(got).sort().join(",") === "subject,text", "the words written, and nothing else", got);
      const upper = await h.port.storedWords(h.firmId.toUpperCase(), h.outboxId.toUpperCase());
      expect(!!upper && upper.subject === h.words.subject, "ids in upper case read the same message", upper);
    },
  },
  {
    name: "another firm's message gives null",
    async run() { const h = make(), r = await safely(() => h.port.storedWords(h.otherFirmId, h.outboxId)); expect("v" in r && r.v === null, "null, not an error", r); },
  },
  {
    name: "a stored message that changed since it was written gives null",
    async run() { const h = make(), r = await safely(() => h.port.storedWords(h.firmId, h.changedOutboxId)); expect("v" in r && r.v === null, "null, not an error", r); },
  },
  {
    name: "a malformed or unknown message id gives null",
    async run() {
      const h = make();
      for (const id of ["not-an-id", "00000000-0000-0000-0000-000000000000"]) { const r = await safely(() => h.port.storedWords(h.firmId, id)); expect("v" in r && r.v === null, `${id}: null, not an error`, r); }
    },
  },
]);
