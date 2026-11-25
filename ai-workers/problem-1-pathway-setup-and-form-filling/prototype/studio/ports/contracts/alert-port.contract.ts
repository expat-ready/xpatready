// PF-0c: AlertPort's contract (ports/alert.ts). Run by fakeAlerts and by LogAlerts
// (api/src/platform/observability/alerts.ts). The port file's sentences: raise(kind, detail) raises one alert of a known
// kind; the detail carries ids and rule names only, so a name, an email, a sentence or an unknown field is refused before
// it is raised; `raised` is false only for the same alert again within the adapter's repeat window (so a first alert is
// always raised).
import { defineContract, expect, expectRefused } from "./contract.ts";
import type { AlertPort } from "../alert.ts";

let n = 0;
const fresh = () => `pf0c-${Date.now().toString(36)}-${++n}`;

export const alertPortContract = defineContract("AlertPort", (make: () => AlertPort) => [
  {
    name: "a first alert of a known kind is raised",
    async run() {
      const a = make();
      const r = await a.raise("audit.chain_integrity_failure", { rule: "BR-2", entity: "audit_event", entityKey: fresh() });
      expect(r.raised === true, "raised: true", r);
    },
  },
  {
    name: "two different alerts (another firm, another queue) are both raised",
    async run() {
      const a = make();
      const r1 = await a.raise("job_stuck", { rule: "SA8-D40", queue: "mail", firmId: fresh(), count: 2 });
      const r2 = await a.raise("job_stuck", { rule: "SA8-D40", queue: "render", firmId: fresh(), count: 1 });
      expect(r1.raised && r2.raised, "both raised", { r1, r2 });
    },
  },
  {
    name: "a detail holding an email, a name or a sentence, or an unknown field, or no rule, is refused",
    async run() {
      const a = make();
      await expectRefused(() => a.raise("audit_write_failed", { rule: "BR-5", entityKey: "client.a@example.com" }), "an email");
      await expectRefused(() => a.raise("audit_write_failed", { rule: "BR-5", firmId: "Client A Name" }), "a name with spaces");
      await expectRefused(() => a.raise("audit_write_failed", { rule: "BR-5", note: "free text" } as never), "an unknown field");
      await expectRefused(() => a.raise("audit_write_failed", { entity: "audit_event" } as never), "no rule");
      await expectRefused(() => a.raise("privacy_clock_near", { rule: "NFR5-14", dueAt: "next tuesday" }), "a due time that is not a date-time");
    },
  },
  {
    name: "an unknown alert kind is refused",
    async run() {
      const a = make();
      await expectRefused(() => a.raise("disk_full" as never, { rule: "X-1" }), "an unknown kind");
    },
  },
]);
