// AUD-4 (SA-11-30: each change in words as "field: old → new", the raw before and after under Advanced; SA-11-14: a
// deactivated person keeps their name; AG-13-43, P-687: before and after values in full to holders of
// agent/audit:read): one audit line as the firm sees it. `changesOf` is the one reader of a line's before/after pairs;
// a new pair shape is added here. The shapes it reads:
//   { key, from, to }                      a setting change (the field is `key`)
//   { <f>_from, <f>_to }
//   { <f>_before, <f>_after }              a lone _before is a removal, a lone _after an addition
import { AREAS, AuditActionNames, areaOf, type AreaCode } from "./action-names.ts";

export type Change = { field: string; from: string; to: string; words: string };
const show = (v: unknown): string => (v === undefined ? "(none)" : v === null ? "(empty)" : typeof v === "string" ? v : JSON.stringify(v));
const change = (field: string, a: unknown, b: unknown): Change => ({ field, from: show(a), to: show(b), words: `${field}: ${show(a)} → ${show(b)}` });

/** The before/after pairs a line's detail carries, in the order its fields were written; none when it carries none. */
export function changesOf(detail: unknown): Change[] {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
  const d = detail as Record<string, unknown>, out: Change[] = [];
  if ("from" in d || "to" in d) out.push(change(typeof d.key === "string" ? d.key : "value", d.from, d.to));
  const seen = new Set<string>();
  for (const k of Object.keys(d)) {
    const m = /^(.+)_(from|to|before|after)$/.exec(k);
    if (!m || seen.has(m[1])) continue;
    const [before, after] = m[2] === "from" || m[2] === "to" ? ["from", "to"] : ["before", "after"];
    if (!(`${m[1]}_${before}` in d) && !(`${m[1]}_${after}` in d)) continue;
    seen.add(m[1]);
    out.push(change(m[1], d[`${m[1]}_${before}`], d[`${m[1]}_${after}`]));
  }
  return out;
}

/** The firm's staff by actor word: `staff:<id>` and, for the simulated people, their actor id (`user-R`). */
export type People = Map<string, { staffId: string; name: string; active: boolean }>;

export type Row = { id: string; at: string; actor: string; actor_type: string; action: string; entity: string; entity_key: string | null; case_id: string | null;
  correlation_id: string | null; support_session_id: string | null; summary: string; detail: unknown };

/** Who did it, in words. Our staff: "ExpatReady support" under a support session, "ExpatReady staff" otherwise (no
 *  name for our staff can be read yet: contract gap). A firm-staff word with no staff row of this firm is said so,
 *  never named or called a former member. */
export function whoOf(r: Pick<Row, "actor" | "actor_type" | "support_session_id">, people: People): string {
  if (r.support_session_id) return "ExpatReady support";
  if (r.actor_type === "OUR_STAFF") return "ExpatReady staff";
  if (r.actor_type === "SYSTEM") return "The system";
  if (r.actor_type === "SEED") return "Sample data";
  if (r.actor_type === "CLIENT") return "A client";
  return people.get(r.actor)?.name ?? "Staff member not on this firm's team list";
}

export type FirmLine = { id: string; at: string; who: string; staffId: string | null; area: AreaCode; areaWords: string; action: string; actionWords: string | null; summary: string;
  changes: Change[]; advanced: { action: string; actor: string; actorType: string; entity: string; entityKey: string | null; caseId: string | null; correlationId: string | null; supportSessionId: string | null; detail: unknown } };

export function renderLine(r: Row, people: People): FirmLine {
  const area = areaOf(r.entity);
  return { id: r.id, at: r.at, who: whoOf(r, people), staffId: r.actor_type === "FIRM_STAFF" ? people.get(r.actor)?.staffId ?? null : null, area, areaWords: AREAS[area],
    action: r.action, actionWords: AuditActionNames.label(r.action) ?? null, summary: r.summary, changes: changesOf(r.detail),
    advanced: { action: r.action, actor: r.actor, actorType: r.actor_type, entity: r.entity, entityKey: r.entity_key, caseId: r.case_id, correlationId: r.correlation_id, supportSessionId: r.support_session_id, detail: r.detail ?? null } };
}

export const CSV_HEADER = ["When (UTC)", "Who", "Actor type", "Area", "Action", "What", "Changes", "Entity", "Entity key", "Case", "Correlation id", "Support session", "Detail"];
export const csvCells = (l: FirmLine): unknown[] => [l.at, l.who, l.advanced.actorType, l.areaWords, l.actionWords ?? l.action, l.summary, l.changes.map((c) => c.words).join("; "),
  l.advanced.entity, l.advanced.entityKey, l.advanced.caseId, l.advanced.correlationId, l.advanced.supportSessionId, l.advanced.detail];
