// FO-14 part A (BACKLOG row FO-14; R1.62; AG-15-29, -30, -54): the client's progress stream. Every client door we own (the
// signing door now; pay links, booking self-service and the client portal as they come) records what the client did
// through this port, in the door's own transaction, so a refused door write leaves no event. An event is insert-only
// (fo_portal_activity_event; the database refuses update, delete and truncate), names the firm's own fo_person (another
// firm's person is refused), and carries the database's time. `recent` reads one person's newest events of one firm,
// newest first; another firm's events never appear. The adapter is api/src/front-office/activity/adapter.ts, the fake
// ports/fakes/portal-activity.fake.ts, the contract ports/contracts/portal-activity-port.contract.ts. This file imports
// only zod (§1 rule 3).
import { z } from "zod";

/** The injection token the API binds the adapter to (api/src/features/front-office-activity.ts). */
export const PORTAL_ACTIVITY_PORT = Symbol.for("front-office.PortalActivityPort");

export const PORTAL_ACTIVITY_KINDS = ["SIGN_IN", "VIEW", "UPLOAD", "QUESTIONNAIRE_PROGRESS", "SUBMIT", "SIGNED", "PAID"] as const;
export type PortalActivityKind = (typeof PORTAL_ACTIVITY_KINDS)[number];

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).transform((v) => v.toLowerCase());
/** The door, one lower-case word ("signing", "pay-link", "booking", "portal"): the table's check, said again here. */
export const ACTIVITY_SOURCE = /^[a-z]+(-[a-z]+)*$/;

export const PortalActivityRecord = z.strictObject({
  firmId: Id,
  personId: Id,
  kind: z.enum(PORTAL_ACTIVITY_KINDS),
  caseId: Id.optional(),
  source: z.string().max(40).regex(ACTIVITY_SOURCE),
  /** The door's own row id (a signer, a pay link, a booking). */
  sourceRef: z.string().min(1).max(200).regex(/^[^\p{Cc}]*$/u).optional(),
});
export type PortalActivityRecord = z.input<typeof PortalActivityRecord>;

export type PortalActivityItem = { kind: PortalActivityKind; caseId: string | null; source: string; at: Date };

/** A record the port refuses: a bad shape, or a person who is not one of the firm's people. */
export class PortalActivityRefused extends Error { override name = "PortalActivityRefused"; }

export interface PortalActivityPort<Tx = unknown> {
  /** Records one event inside the caller's transaction `tx`. */
  record(tx: Tx, e: PortalActivityRecord): Promise<void>;
  /** The person's newest `limit` events in the firm (1..100), newest first. */
  recent(firmId: string, personId: string, limit: number): Promise<PortalActivityItem[]>;
}
