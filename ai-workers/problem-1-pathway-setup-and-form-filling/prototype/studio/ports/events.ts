// The shared events contract (case-side contract v0.1 §1 rule 3, §4; platform-and-front-office contracts §0.5): the names
// of the events modules write to the outbox (module_event, PF-3) and the shapes their consumers read. No module spells
// an event name itself. This folder imports only zod and its own files.
// P-785 (2), 22 Nov: the names and shapes live in ports/events/<module>.ts, one file per owner module, so two lanes
// never edit the same file to add an event. THIS FILE ONLY RE-EXPORTS and is frozen: every import written before the
// split still works, and tests/check_ports_events.ts refuses a new event, shape or module added here. A new event goes
// in its module's file under ports/events/ (a new module or part adds its own file there) and is imported from that file.
import { FIRM_EVENT } from "./events/firms.ts";
import { STAFF_EVENT } from "./events/staff.ts";
import { BOOKING_EVENT } from "./events/booking.ts";
import { COMPLAINT_EVENT } from "./events/complaints.ts";
import { SUPPORT_EVENT } from "./events/support.ts";
import { RETAINER_EVENT } from "./events/retainers.ts";
import { COMPLIANCE_EVENT } from "./events/compliance.ts";
import { SALES_EVENT } from "./events/sales.ts";
import { CASE_EVENT } from "./events/cases.ts";
import { PERSON_MERGE_EVENT } from "./events/person-merge.ts";

/** Every event name of the modules that existed at the split (module_event.type). New code imports its module's own
 *  names (`BOOKING_EVENT`, ...) from ports/events/<module>.ts; a name added to one of these files shows here too. */
export const EVENT = {
  ...FIRM_EVENT,
  ...STAFF_EVENT,
  ...BOOKING_EVENT,
  ...COMPLAINT_EVENT,
  ...SUPPORT_EVENT,
  ...RETAINER_EVENT,
  ...COMPLIANCE_EVENT,
  ...SALES_EVENT,
  ...CASE_EVENT,
  ...PERSON_MERGE_EVENT,
} as const;
export type EventName = (typeof EVENT)[keyof typeof EVENT];

export * from "./events/firms.ts";
export * from "./events/staff.ts";
export * from "./events/booking.ts";
export * from "./events/complaints.ts";
export * from "./events/support.ts";
export * from "./events/retainers.ts";
export * from "./events/compliance.ts";
export * from "./events/sales.ts";
export * from "./events/cases.ts";
export * from "./events/person-merge.ts";
