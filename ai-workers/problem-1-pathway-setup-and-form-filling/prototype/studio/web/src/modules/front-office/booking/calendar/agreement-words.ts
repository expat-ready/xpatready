// FO-3c part 2 (review r2-2): the booking panel's next step while its consultation agreement holds Attended. A No-show
// booking cannot be rescheduled (the booking service answers 409 for it), so the panel never advises a reschedule there:
// it says to make a new booking, which sends its own agreement. No imports: the row's suite checks it at the services.
export const NEXT_RESCHEDULE = "If the meeting time has passed, reschedule it: the client can sign before the new time.";
export const NEXT_NO_SHOW = "This booking is marked No-show, so it cannot be rescheduled: to meet the client, make a new booking, and a new agreement is sent for it.";
export const agreementNextStep = (bookingStatus?: string) => (bookingStatus === "NO_SHOW" ? NEXT_NO_SHOW : NEXT_RESCHEDULE);
