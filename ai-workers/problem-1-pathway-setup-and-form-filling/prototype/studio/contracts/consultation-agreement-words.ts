// FO-3c part 2 (review r2-2, break P2R3-4): the booking panel's next step while its consultation agreement is unsigned. Only a
// booking still to happen (Scheduled, Rescheduled) can be rescheduled and is sent a fresh agreement; for a No-show,
// Attended or cancelled booking the booking service refuses a reschedule (409) and the catch-up sends nothing, so the
// panel never advises one there. No imports: the row's suite checks it at the services.
export const ACTIVE = ["SCHEDULED", "RESCHEDULED"];
export const NEXT_RESCHEDULE = "If the meeting time has passed and it did not take place, reschedule it: the client can sign before the new time.";
export const NEXT_NO_SHOW = "This booking is marked No-show, so it cannot be rescheduled: to meet the client, make a new booking, and a new agreement is sent for it.";
export const NEXT_COMPLETED = "This booking is already marked Attended, so it cannot be rescheduled: to meet the client again, make a new booking, and a new agreement is sent for it.";
export const NEXT_CANCELLED = "This booking is cancelled: nothing more is sent for it.";
/** Whether a fresh agreement is sent for this booking once its agreement has ended (unknown status: the panel's old answer). */
export const sendsFresh = (bookingStatus?: string) => bookingStatus === undefined || ACTIVE.includes(bookingStatus);
export const agreementNextStep = (bookingStatus?: string) =>
  bookingStatus === "NO_SHOW" ? NEXT_NO_SHOW : bookingStatus === "COMPLETED" ? NEXT_COMPLETED : bookingStatus === "CANCELLED" ? NEXT_CANCELLED : NEXT_RESCHEDULE;
