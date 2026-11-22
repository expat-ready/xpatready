// FO-3st1, FO-3st3 (concept fo-3-booking r2 §2 "area Bookings: Calendar · Settings: Booking types, Timings"): the
// Bookings area's menu, shared by its pages. Calendar needs agent/booking:list; Booking types its view key
// agent/booking-event-type:list, and so does Timings (FO-3st3b). A person with neither (Billing and finance) has no menu (BR-12, J-T4).
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Area } from "@/modules/platform/frame";
import { TIMINGS_HOME } from "./settings/timings-contract";   // FO-3st3b

export const BOOKINGS_HOME = "/front-office/bookings";
export const TYPES_HOME = "/front-office/settings/booking-types";
const LIST_KEY = "agent/booking:list", TYPES_KEY = "agent/booking-event-type:list";
const item = ({ isActive }: { isActive: boolean }) => cn("flex min-h-9 items-center rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");

export const BOOKINGS_AREA: Area = {
  label: "Bookings", home: BOOKINGS_HOME,
  menu: (me) => me.keys.includes(LIST_KEY) || me.keys.includes(TYPES_KEY) ? (
    <nav aria-label="Bookings" className="hidden w-52 shrink-0 border-r border-border bg-surface-raised p-3 md:block">
      {me.keys.includes(LIST_KEY) ? <><p className="px-3 pb-2 text-xs font-medium text-text-muted">Bookings</p><NavLink to={BOOKINGS_HOME} end className={item}>Calendar</NavLink></> : null}
      {me.keys.includes(TYPES_KEY) ? <><p className="px-3 pb-2 pt-4 text-xs font-medium text-text-muted">Settings</p><NavLink to={TYPES_HOME} className={item} data-menu-booking-types>Booking types</NavLink><NavLink to={TIMINGS_HOME} className={item} data-menu-timings>Timings</NavLink></> : null}
    </nav>
  ) : null,
};
