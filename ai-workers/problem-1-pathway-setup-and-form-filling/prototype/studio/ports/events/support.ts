// ports/events/support.ts — the events of support tickets a firm raises to us (platform: support):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const SUPPORT_EVENT = {
  /** A firm's staff member raised a support ticket to us (platform, PF-18b; AG-16-63). The name is SA-10's domain event
   *  (04-Doc-2-SuperAdmin-Console.md: "support.ticket_created"), which our console (PF-17) consumes. */
  SUPPORT_TICKET_RAISED: "support.ticket_created",
} as const;

const Uuid = z.string().uuid();
// PF-18b (AG-16-63): a support ticket raised, ids only (never the ticket's words, its page or a file: a consumer reads the
// ticket). The firm is the outbox row's firm_id and module_event.subject_id is the ticket id.
export const SupportTicketRaised = z.strictObject({
  type: z.literal(SUPPORT_EVENT.SUPPORT_TICKET_RAISED), firmId: Uuid, ticketId: Uuid, raisedBy: Uuid, files: z.number().int().min(0).max(3),
  createdAt: z.iso.datetime({ offset: true }),
});
export type SupportTicketRaised = z.infer<typeof SupportTicketRaised>;
