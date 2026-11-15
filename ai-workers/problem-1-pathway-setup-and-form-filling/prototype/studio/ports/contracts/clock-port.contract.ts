// PF-0c: ClockPort's contract (ports/clock.ts). Run by FakeClock and by systemClock. The port's one promise is `now()`:
// a valid time, and code that decides by time asks the clock each time. What callers rely on (tests/check_pf0p_ports.ts,
// "a caller changing the Date it got does not move the clock"): each call gives a fresh Date, and the clock never runs
// backward between two reads.
import { defineContract, expect } from "./contract.ts";
import type { ClockPort } from "../clock.ts";

export const clockPortContract = defineContract("ClockPort", (make: () => ClockPort) => [
  {
    name: "now() is a valid time",
    async run() {
      const t = make().now();
      expect(t instanceof Date && Number.isFinite(t.getTime()) && t.getUTCFullYear() >= 2000, "a Date from 2000 on", String(t));
    },
  },
  {
    name: "a caller changing the Date it got does not move the clock",
    async run() {
      const c = make(), a = c.now(), was = a.getTime();
      a.setUTCFullYear(1999);
      expect(c.now().getTime() >= was, "the next read is not the changed Date", c.now().toISOString());
      expect(c.now() !== c.now(), "each read is its own Date");
    },
  },
  {
    name: "two reads never go backward",
    async run() {
      const c = make();
      for (let i = 0, last = c.now().getTime(); i < 50; i++) { const t = c.now().getTime(); expect(t >= last, "read " + i + " went backward", { last, t }); last = t; }
    },
  },
]);
