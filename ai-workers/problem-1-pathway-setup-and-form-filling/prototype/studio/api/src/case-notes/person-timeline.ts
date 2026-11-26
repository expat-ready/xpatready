// CS-NT1t (map row 76, "each case, person and prospect has its own timeline"; BACKLOG row CS-NT1t, the Lead's ruling
// 23 Nov; j_76 W5): one person's own timeline, a read view (no table), newest first, 50 lines a page. It merges three
// sources and adds no rule of its own:
//   * the person's own notes (CS-NT1 part 3's case_client_id notes; one line per note at its first version, current words);
//   * each case they are the client of, as that case's own timeline reads it (case-notes/timeline.ts `pageAfter`: the same
//     firm rule and the reader's caseScope; a case outside it is left out, never named);
//   * their won prospect's lines (FO-2 part 4's prospect timeline, front-office/sales/timeline.ts), once, when
//     case_client.prospect_id is set and the front office is on.
// The cursor is the case timeline's key {µs, source, id} in the "C" order, so pages never skip or repeat a line. Staff
// only (agent/case:show); no client-facing read here, so no internal note reaches a client. Another firm's person → 404.
import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Db } from "../core.ts";
import { problem, type StaffContext } from "../platform/identity/keys.ts";
import { CaseNotes } from "./service.ts";
import { CaseTimeline, cmp, TIMELINE_PAGE, type CaseTimelineLine, type Key } from "./timeline.ts";
import { Timeline as ProspectTimeline } from "../front-office/sales/timeline.ts";

type Source = "audit" | "note" | "prospect";
export type PersonTimelineLine = Omit<CaseTimelineLine, "source"> & { source: Source; caseId: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIGINT_MAX = 9223372036854775807n;
const invalid = (field: string, detail: string): never => problem(400, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });
const encode = (k: Key) => Buffer.from(JSON.stringify([k.us.toString(), k.source, k.id])).toString("base64url");
function decode(c: string): Key {
  try {
    const [us, source, id] = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as [string, string, string];
    if (/^\d{1,19}$/.test(us) && BigInt(us) <= BIGINT_MAX && ["audit", "note", "prospect"].includes(source) && typeof id === "string" && /^[0-9a-z-]{1,64}$/i.test(id)) return { us: BigInt(us), source, id: id.toLowerCase() };
  } catch { /* below */ }
  return invalid("cursor", "This cursor is not one this timeline gave; start from the first page.");
}
export const PersonTimelineQuery = z.strictObject({ cursor: z.string({ message: "Give it once." }).optional() }, { message: "Only cursor." });
/** Prospect lines in the case timeline's kinds. */
const KIND: Record<string, CaseTimelineLine["kind"]> = { NOTE: "NOTE", CALL: "ACTIVITY", AUDIT: "ACTIVITY", EVENT: "ACTIVITY" };

@Injectable()
export class PersonTimeline {
  constructor(@Inject(Db) private readonly db: Db, @Inject(CaseNotes) private readonly notes: CaseNotes, @Inject(CaseTimeline) private readonly cases: CaseTimeline,
    @Optional() @Inject(ProspectTimeline) private readonly prospects?: ProspectTimeline) {}

  /** GET /api/runtime/clients/:id/timeline?cursor= (agent/case:show). */
  async read(ctx: StaffContext, clientId: string, q: unknown) {
    const parsedQ = PersonTimelineQuery.safeParse(q && typeof q === "object" && !Array.isArray(q) ? q : {});
    if (!parsedQ.success) return invalid("cursor", parsedQ.error.issues[0].message);
    const cursor = parsedQ.data.cursor ? decode(parsedQ.data.cursor) : null;
    const s = await this.notes.subjectFor(ctx, "client", clientId);   // 404: another firm's person, or no such person
    const older = (k: Key) => !cursor || cmp(k, cursor) < 0;
    const items: { line: PersonTimelineLine; k: Key }[] = [];
    let floor: Key | null = null;   // a source that may hold older lines not read yet: nothing older than its last line shows
    const lift = (k: Key | null) => { if (k && (!floor || cmp(k, floor) > 0)) floor = k; };

    // 1. The person's own notes.
    const own = await this.notes.list(ctx, s.id, "client");
    const noteLines = own.notes.map((n) => ({ k: { us: BigInt(Date.parse(n.writtenAt)) * 1000n, source: "note", id: n.id } as Key, line: {
      at: n.writtenAt, kind: "NOTE" as const, type: "note", actor: `staff:${n.author.staffId}`, actorName: n.author.name, summary: n.text, refId: n.id, source: "note" as const, caseId: null, visibility: n.visibility, pinned: n.pinned } }));
    items.push(...noteLines.filter((x) => older(x.k)));

    // 2. Each case they are the client of, as its own timeline reads it (outside the reader's caseScope: left out).
    const caseIds = (await this.db.case.findMany({ where: { clientId: s.id }, select: { id: true }, orderBy: { id: "asc" } })).map((c) => c.id);
    for (const caseId of caseIds) {
      const page = await this.cases.pageAfter(ctx, caseId, cursor).catch((e: unknown) => { if ((e as { status?: number })?.status === 404 || (e as { getStatus?: () => number })?.getStatus?.() === 404) return null; throw e; });
      if (!page) continue;
      items.push(...page.lines.map(({ line, k }) => ({ k, line: { ...line, caseId } })));
      if (page.more) lift(page.last);
    }

    // 3. Their won prospect's lines, once (FO-8's link).
    const prospectId = (await this.db.caseClient.findUnique({ where: { id: s.id }, select: { prospectId: true } }))?.prospectId ?? null;
    if (prospectId && this.prospects) {
      const p = await this.prospects.prospect(ctx, prospectId).catch(() => null);   // 404 for this reader: left out
      for (const l of p?.lines ?? []) {
        const k: Key = { us: BigInt(Date.parse(l.at)) * 1000n, source: "prospect", id: l.refId && UUID.test(l.refId) ? l.refId.toLowerCase() : createHash("sha256").update(`${l.kind}|${l.type}|${l.at}|${l.refId ?? ""}`).digest("hex").slice(0, 32) };
        if (older(k)) items.push({ k, line: { at: l.at, kind: KIND[l.kind] ?? "ACTIVITY", type: l.type, actor: l.actor ?? "system:front-office", actorName: l.actorName, summary: l.summary, refId: k.id, source: "prospect", caseId: null } });
      }
      if (p?.more) lift(items.filter((x) => x.k.source === "prospect").sort((a, b) => cmp(a.k, b.k))[0]?.k ?? null);
    }

    const merged = items.filter((x) => !floor || cmp(x.k, floor) >= 0).sort((a, b) => cmp(b.k, a.k));
    const page = merged.slice(0, TIMELINE_PAGE);
    const more = merged.length > TIMELINE_PAGE || floor !== null;
    const last = page.at(-1)?.k ?? null;
    return { lines: page.map((x) => x.line), more, nextCursor: more && last ? encode(last) : null, pageSize: TIMELINE_PAGE };
  }
}
