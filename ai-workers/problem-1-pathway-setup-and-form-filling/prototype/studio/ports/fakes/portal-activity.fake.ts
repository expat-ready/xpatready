// FO-14 part A: PortalActivityPort's fake (ports/portal-activity.ts), for a door's own tests. It keeps the events in memory
// and knows the people it is told of (`person`); both it and the real adapter run
// ports/contracts/portal-activity-port.contract.ts.
import { PortalActivityRecord, PortalActivityRefused, type PortalActivityItem, type PortalActivityPort } from "../portal-activity.ts";

export function fakePortalActivity(): PortalActivityPort & { person(firmId: string, personId: string): void } {
  const people = new Set<string>(), events: (PortalActivityItem & { firmId: string; personId: string })[] = [];
  let last = 0;
  return {
    person(firmId, personId) { people.add(`${firmId.toLowerCase()}/${personId.toLowerCase()}`); },
    async record(_tx, input) {
      const p = PortalActivityRecord.safeParse(input);
      if (!p.success) throw new PortalActivityRefused("not an activity event");
      const e = p.data;
      if (!people.has(`${e.firmId}/${e.personId}`)) throw new PortalActivityRefused("the person is not one of the firm's people");
      last = Math.max(last + 1, Date.now());
      events.push({ firmId: e.firmId, personId: e.personId, kind: e.kind, caseId: e.caseId ?? null, source: e.source, at: new Date(last) });
    },
    async recent(firmId, personId, limit) {
      const f = firmId.toLowerCase(), id = personId.toLowerCase(), n = Math.min(Math.max(Math.trunc(limit), 1), 100);
      return events.filter((e) => e.firmId === f && e.personId === id).reverse().slice(0, n).map(({ kind, caseId, source, at }) => ({ kind, caseId, source, at }));
    },
  };
}
