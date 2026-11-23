// AUD-3 part 1: our staff's lines on a firm's trail, counted per request (keyed by PF-23's request scope object, so
// nothing outlives the request and nothing is counted outside one). audit-event.ts notes each OUR_STAFF line it writes;
// lines.ts's changes-firm check reads the count. A file of its own, so audit-event.ts and lines.ts never import each other.
import { requestScope } from "../../observability/log.ts";

const written = new WeakMap<object, number>();
export function noteOurStaffLine(): void {
  const s = requestScope.getStore();
  if (s) written.set(s, (written.get(s) ?? 0) + 1);
}
export const ourStaffLinesInRequest = (): number => { const s = requestScope.getStore(); return s ? written.get(s) ?? 0 : 0; };
