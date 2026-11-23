// FO-6 part 3: the signing module's small registry. One SigningPort for the process (the fake until FO-6v), the MailPort
// the completion emails go through, and the handler each other document kind registers for the provider's webhook. The
// webhook (./service.ts) applies RETAINER requests itself; a CONSULTATION request goes to the handler FO-3c registers
// (`registerSigningHandler("CONSULTATION", (call, firmId) => agreements.signingEvent(call, firmId))`, which stores its
// own receipt), and is stored and answered "no handler" until then. Every value is Sample.
import type { MailPort } from "../../../../ports/mail.ts";
import { fakeSigning, type SigningHookCall, type SigningPort } from "./port.ts";

let port: SigningPort | null = null, mail: MailPort | null = null;
/** The process's signing adapter: the in-memory fake (P-561, P-568: no vendor call) unless one was set. */
export const signingPort = (): SigningPort => (port ??= fakeSigning());
/** Sets the adapter (a suite's own fake; FO-6v's vendor adapter). Returns the one before. */
export function useSigningPort(p: SigningPort | null): SigningPort | null { const was = port; port = p; return was; }
/** The MailPort for "Your signed agreement" (the signing feature sets the platform's at start). */
export const signingMail = (): MailPort | null => mail;
export function useSigningMail(m: MailPort | null): MailPort | null { const was = mail; mail = m; return was; }

/** A document kind's own webhook handler: it gets the verified call and the request's firm, and runs as that firm. */
export type SigningKindHandler = (call: SigningHookCall, firmId: string) => Promise<unknown>;
type OtherKind = "CONSULTATION" | "OTHER";   // OTHER: FO-6d registers its handler (features/front-office-signing-any-document.ts)
const handlers = new Map<OtherKind, SigningKindHandler>();
/** Registers a kind's handler once; returns the undo (a suite's clean-up). A second registration is a programming error. */
export function registerSigningHandler(kind: OtherKind, h: SigningKindHandler): () => void {
  if (handlers.has(kind)) throw new Error(`signing: a ${kind} handler is registered already`);
  handlers.set(kind, h);
  return () => { if (handlers.get(kind) === h) handlers.delete(kind); };
}
export const signingHandlerFor = (kind: OtherKind): SigningKindHandler | null => handlers.get(kind) ?? null;
