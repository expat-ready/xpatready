// ports/events/staff.ts — the events of a firm's staff (platform: identity):
// their names (module_event.type) and the shapes their consumers read. One file per owner module (P-785 (2)): a new
// event is added here by its module, or in a new file of this folder by a new module or part; nothing lists the
// files. Imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

/** Event names (module_event.type), one per line. */
export const STAFF_EVENT = {
  /** A staff member's roles changed (platform, PF-4; contracts §1.2 events out). */
  STAFF_ROLES_CHANGED: "staff.roles_changed",
  /** A staff member was deactivated: their sessions ended at once (platform, PF-4; contracts §1.2 events out). */
  STAFF_DEACTIVATED: "staff.deactivated",
  /** A staff member joined by accepting an invitation (platform, PF-4b; contracts §1.2 events out). */
  STAFF_JOINED: "staff.joined",
} as const;

/** The payload PF-4 writes for `staff.roles_changed` and `staff.deactivated`: ids only (no name, email, role words or
 *  licence; a consumer reads the person's current roles from the platform). The firm is the outbox row's firm_id. */
export const StaffEventPayload = z.object({ staffId: z.string().uuid() }).strict();
export type StaffEventPayload = z.infer<typeof StaffEventPayload>;
/** The payload PF-4b writes for `staff.joined`: ids only (the staff member and the invitation accepted). */
export const StaffJoinedPayload = z.object({ staffId: z.string().uuid(), invitationId: z.string().uuid() }).strict();
export type StaffJoinedPayload = z.infer<typeof StaffJoinedPayload>;
/** What a consumer of either staff event needs: the outbox row's type and firm, and the payload's staff id. */
export const StaffRolesChanged = z.object({ type: z.literal(STAFF_EVENT.STAFF_ROLES_CHANGED), firmId: z.string().uuid(), payload: StaffEventPayload });
export type StaffRolesChanged = z.infer<typeof StaffRolesChanged>;
export const StaffDeactivated = z.object({ type: z.literal(STAFF_EVENT.STAFF_DEACTIVATED), firmId: z.string().uuid(), payload: StaffEventPayload });
export type StaffDeactivated = z.infer<typeof StaffDeactivated>;
