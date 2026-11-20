// PF-19b part 1: the `local` email adapter of the reference app. It sends nothing out: the worker marks the row SENT with
// provider id `local:<outbox id>`, and the demo-only GET /api/demo/platform-inbox (../../demo-inbox.ts) lists those rows
// with their stored words. It never writes demo_message (its link_id is a required key to person_link: Lead B, #1816).
// Part 2 adds the SES adapter (ca-central-1) beside it, chosen by setting.
// PF-19b part 3 (R1.48, "the provider's test events"): once the app connects the notice handler (connectLocalNotices,
// features/platform-messages.ts), each email this adapter takes gives one test event through the same handler as SES's
// notices (SesNotices.apply, matching only `local:` ids): a Delivery, or a hard Bounce for an address on
// SAMPLE_BOUNCE_ADDRESSES. The event runs after the worker's transaction: its row lock waits for the send to commit (a
// send that rolls back leaves a QUEUED row, and the event is ignored and logged). Suites that use the adapter without
// connecting it see SENT, as before.
// QA-601 (R1.48 "or Failed"): an address on SAMPLE_REFUSED_ADDRESSES is refused as a provider refuses a send (the
// adapter throws, nothing is sent and no event follows), so the worker's tries end the row FAILED on a local copy too.
import { currentFirm, withFirm } from "../../../firm-scope.ts";
import type { ChannelAdapter } from "../../send/messages.ts";
import type { SesMessage, SesNotices } from "./bounces.ts";

export const LOCAL_PROVIDER = "local";
/** Sample (the demo's test seed): addresses whose local test event is a hard bounce (the address is then suppressed). */
export const SAMPLE_BOUNCE_ADDRESSES: readonly string[] = Object.freeze(["bounce@example.com", "bounce.sample@example.com"]);
/** Sample (the demo's test seed): addresses the local adapter refuses, as SES refuses a send (MessageRejected). */
export const SAMPLE_REFUSED_ADDRESSES: readonly string[] = Object.freeze(["refused@example.com", "refused.sample@example.com"]);
/** The local adapter's refusal (shaped as SES's MessageRejected: its name is all the worker logs). */
export class LocalRefused extends Error { override name = "MessageRejected"; }

let notices: Pick<SesNotices, "apply"> | null = null, log: (line: string) => void = (l) => console.warn(l);
const pending = new Set<Promise<unknown>>();
/** Connects the adapter's test events to the notice handler (the running app; a suite that tests them). `null` disconnects. */
export function connectLocalNotices(n: Pick<SesNotices, "apply"> | null, logLine?: (line: string) => void) { notices = n; if (logLine) log = logLine; }
/** Resolves when every test event started so far has been applied (suites). */
export async function localNoticesSettled(): Promise<void> { while (pending.size) await Promise.allSettled([...pending]); }

/** The SES-shaped test event for one sent message: SES's Delivery, or a Permanent Bounce for a Sample bounce address. */
export function localTestEvent(firmId: string, outboxId: string, to: string): SesMessage {
  const mail = { messageId: outboxId, tags: { firm: [firmId], outbox: [outboxId] } };
  return SAMPLE_BOUNCE_ADDRESSES.includes(to.toLowerCase())
    ? { notificationType: "Bounce", mail, bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: to }] } }
    : { notificationType: "Delivery", mail, delivery: { recipients: [to], smtpResponse: "250 OK (local test event)" } };
}

export const localEmail: ChannelAdapter = {
  provider: LOCAL_PROVIDER,
  async deliver(_tx, r) {
    if (SAMPLE_REFUSED_ADDRESSES.includes(r.to.toLowerCase())) throw new LocalRefused("Sample: the local adapter refuses this address");
    const providerId = `${LOCAL_PROVIDER}:${r.outboxId}`, n = notices, firmId = r.firmId;
    // A platform account message (no firm) has no events (PF-19p); its row is never matched by a firm's notice.
    if (n && firmId) {
      const m = localTestEvent(firmId, r.outboxId, r.to);
      const run = (async () => {
        await new Promise((ok) => setImmediate(ok));   // after this call returns: the worker then commits, and the lock below waits for it
        const go = () => n.apply(firmId, r.outboxId, providerId, `local-${m.notificationType!.toLowerCase()}:${r.outboxId}`, m);
        await (currentFirm() === firmId ? go() : withFirm(firmId, go));
      })().catch((e: unknown) => log(`messages: local test event for outbox ${r.outboxId} failed (${e instanceof Error ? e.name : "error"})`));
      pending.add(run); void run.finally(() => pending.delete(run));
    }
    return { providerId };
  },
};
