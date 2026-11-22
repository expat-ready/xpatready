// ports/events/firms.ts — the events of a firm's life and its plan (platform: firms, billing, entitlements):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const FIRM_EVENT = {
  /** A firm was created (platform, contracts §1.1). Front office seeds the firm's pipelines on it (FO-1a). */
  FIRM_CREATED: "firm.created",
  /** A firm became Active (Stripe `active`: after a paid invoice, or at trial end with a card while the first invoice is due; PF-5 part 2). */
  FIRM_ACTIVATED: "firm.activated",
  /** A firm's subscription status changed; payload old, new, reason (platform, PF-5 part 2). */
  FIRM_SUBSCRIPTION_CHANGED: "firm.subscription_changed",
  /** A firm went on payment hold: billing and the data download only (platform, PF-5 part 2; SA-4-25). */
  FIRM_PAYMENT_HOLD: "firm.payment_hold",
  /** A firm's plan changed (platform, PF-16 part 1a; PF-15 part 1b's bookings): payload firmId, from and to plan codes, when ("now" or "renewal"). Written last. */
  PLAN_CHANGED: "plan.changed",
} as const;

/** What a `firm.created` consumer needs: the outbox row's type and firm (module_event's envelope, contracts §0.5). */
export const FirmCreated = z.object({ type: z.literal(FIRM_EVENT.FIRM_CREATED), firmId: z.string().uuid() });
export type FirmCreated = z.infer<typeof FirmCreated>;
