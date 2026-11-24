// AUD-3 part 1: the firms our staff's lines were written for, per request (keyed by PF-23's request scope object, so
// nothing outlives the request and nothing is noted outside one). audit-event.ts notes each OUR_STAFF line it writes;
// lines.ts's changes-firm check then counts, among those firms, only the lines this request committed (round 2: a line
// written in a transaction that rolled back is never counted). A file of its own, so audit-event.ts and lines.ts never
// import each other.
import { requestScope } from "../../observability/log.ts";

const written = new WeakMap<object, Set<string>>();
export function noteOurStaffLine(firmId: string): void {
  const s = requestScope.getStore();
  if (!s) return;
  const set = written.get(s) ?? new Set<string>();
  set.add(firmId.toLowerCase());
  written.set(s, set);
}
export const ourStaffFirmsInRequest = (): string[] => { const s = requestScope.getStore(); return s ? [...(written.get(s) ?? [])] : []; };
