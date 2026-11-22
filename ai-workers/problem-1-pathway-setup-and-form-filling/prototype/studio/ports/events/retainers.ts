// ports/events/retainers.ts — the events of retainers and consultation agreements (front office: retainers):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const RETAINER_EVENT = {
  /** A retainer or consultation agreement was drafted from a template (front office, FO-5; contracts §2.3). */
  RETAINER_DRAFTED: "retainer.drafted",
  /** A retainer passed its send check and was sent (front office, FO-5; FO-6 adds the signing request; contracts §2.3). */
  RETAINER_SENT: "retainer.sent",
  /** A sent retainer was withdrawn with a reason (front office, FO-5; AG-5-34). */
  RETAINER_WITHDRAWN: "retainer.withdrawn",
  /** A retainer was recorded as signed on paper (front office, FO-5; AG-5-39; contracts §7 §2.3-§2.4). */
  RETAINER_SIGNED_OFFLINE: "retainer.signed_offline",
  /** A sent retainer's open request ended because an edit made a newer version (front office, FO-5f; payload `version` =
   *  the ended version, `reason` UPDATED). FO-6 cancels the signing request on it. */
  RETAINER_REQUEST_ENDED: "retainer.request_ended",
} as const;

/** The payload FO-5 writes for every retainer.* event: ids and facts only (no name, email or licence; a consumer reads the
 *  retainer itself). The firm is the outbox row's firm_id. */
export const RetainerEventPayload = z.object({
  retainerId: z.string().uuid(),
  kind: z.enum(["RETAINER", "CONSULTATION"]),
  prospectId: z.string().uuid().nullable(),
  version: z.number().int().min(1),
  /** Signed offline only: whether this made the prospect WON (false when it already was, or for a consultation agreement). */
  prospectWon: z.boolean().optional(),
  /** retainer.request_ended only: why the request ended (an edit made a newer version). */
  reason: z.enum(["UPDATED"]).optional(),
}).strict();
export type RetainerEventPayload = z.infer<typeof RetainerEventPayload>;
