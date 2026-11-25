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

// AUD-3 breach read (R1.87 P6, #3491's stated limit): the firms a read across firms named in its answer (one breach's affected and
// notified firms), noted by the service once it has read them, so lines.ts writes one firm-read line on each of their
// trails beside the platform's cross_tenant.access line. Only a route declared @ReadsAcrossFirms writes them; a note
// made in any other request is never read.
const named = new WeakMap<object, Set<string>>();
export function noteFirmsRead(firmIds: readonly string[]): void {
  const s = requestScope.getStore();
  if (!s) return;
  const set = named.get(s) ?? new Set<string>();
  for (const f of firmIds) if (typeof f === "string") set.add(f.toLowerCase());
  named.set(s, set);
}
export const firmsReadInRequest = (): string[] => { const s = requestScope.getStore(); return s ? [...(named.get(s) ?? [])] : []; };
