// CS-DL3 part 1 (R1.74, QA-591; brief design/build-lead-c-briefs/CS-DL3.md; Doc 3 Agent Console line 3337 CaseMilestone):
// the contract of a case's government steps, in its own file so it never collides with contracts/runtime.ts.
//   GET  /api/runtime/cases/:id/milestones              (agent/case:show)  → CaseMilestonesView
//   POST /api/runtime/cases/:id/milestones              (agent/case:edit)  RecordMilestoneBody → MilestoneView (201)
//   POST /api/runtime/cases/:id/milestones/:mid/cancel  (agent/case:edit)  CancelMilestoneBody → MilestoneView
// There is no update route: a due date is never edited; a wrong one is cancelled and recorded again (AG-7-96 r7). The due
// date is the one on IRCC's letter, typed by staff; the app never computes a government deadline (P-170).
import { z } from "zod";

/** Sample (pack-defined in the source, Doc 3 line 3337) until the configurator defines them per program. */
export const MILESTONE_KEYS = ["biometrics", "medical", "adr", "ppr", "procedural_fairness", "other"] as const;
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
/** Each key's plain words (Sample). */
export const MILESTONE_WORDS: Record<MilestoneKey, string> = {
  biometrics: "Biometrics instruction letter",
  medical: "Medical exam request",
  adr: "Additional documents request (ADR)",
  ppr: "Passport request (PPR)",
  procedural_fairness: "Procedural fairness letter",
  other: "Other (see note)",
};
export const MILESTONE_REFERENCE_MAX = 100, MILESTONE_NOTE_MAX = 2000, MILESTONE_REASON_MAX = 500;

/** Words a person reads: no NUL or other control character but tab and new line. */
const BAD_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/** Spaces and invisible characters only count as empty. */
const blank = (t: string) => !t.replace(/[\s​-‍⁠﻿]/g, "");
type Ctx = { addIssue: (i: { code: "custom"; message: string; path?: (string | number)[]; params?: Record<string, unknown> }) => void };
const realDate = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d && d >= "1900-01-01" && d <= "2200-12-31";
const day = z.unknown().transform((d, ctx: Ctx) => { if (realDate(d)) return d; ctx.addIssue({ code: "custom", message: "A real date as YYYY-MM-DD." }); return z.NEVER; });
const optText = (max: number) => z.unknown().transform((v, ctx: Ctx) => {
  if (v == null) return null;
  if (typeof v === "string" && !BAD_TEXT.test(v) && v.trim().length <= max) return blank(v) ? null : v.trim();
  ctx.addIssue({ code: "custom", message: `Plain text, at most ${max} characters.` }); return z.NEVER;
});
const notHere = (what: string) => ({ error: (i: { code: string; keys?: string[] }) => i.code === "unrecognized_keys" ? `Not a field of ${what}: ${(i.keys ?? []).join(", ")}.` : `Give ${what} as an object.` });

/** POST …/milestones. dueOn is optional (a letter may give none); when given it is never before occurredOn (400 at dueOn). */
export const RecordMilestoneBody = z.strictObject({
  milestoneKey: z.unknown().transform((k, ctx: Ctx) => {
    if (typeof k === "string" && (MILESTONE_KEYS as readonly string[]).includes(k)) return k as MilestoneKey;
    ctx.addIssue({ code: "custom", message: `One of ${MILESTONE_KEYS.join(", ")} (Sample list).` }); return z.NEVER;
  }),
  occurredOn: day,
  dueOn: z.unknown().transform((d, ctx: Ctx) => { if (d == null || d === "") return null; if (realDate(d)) return d; ctx.addIssue({ code: "custom", message: "A real date as YYYY-MM-DD." }); return z.NEVER; }).optional(),
  reference: optText(MILESTONE_REFERENCE_MAX).optional(),
  note: optText(MILESTONE_NOTE_MAX).optional(),
}, notHere("a government step")).superRefine((b, ctx: Ctx) => {
  if (b.dueOn && b.dueOn < b.occurredOn) ctx.addIssue({ code: "custom", path: ["dueOn"], message: "The due date can't be before the letter's date." });
  if (b.milestoneKey === "other" && !b.note) ctx.addIssue({ code: "custom", path: ["note"], message: "Say what the step is in the note." });
});
export type RecordMilestoneBody = z.infer<typeof RecordMilestoneBody>;

/** POST …/milestones/:mid/cancel. */
export const CancelMilestoneBody = z.strictObject({
  reason: z.unknown().transform((v, ctx: Ctx) => {
    const r = typeof v === "string" ? v.trim() : "";
    if (BAD_TEXT.test(r)) { ctx.addIssue({ code: "custom", message: "Plain text only." }); return z.NEVER; }
    if (blank(r)) { ctx.addIssue({ code: "custom", message: "Give a reason.", params: { code: "REASON_REQUIRED" } }); return z.NEVER; }
    if (r.length > MILESTONE_REASON_MAX) { ctx.addIssue({ code: "custom", message: `At most ${MILESTONE_REASON_MAX} characters.` }); return z.NEVER; }
    return r;
  }),
}, notHere("a cancel"));

/** A due date as the case shows it (as CS-DL1's stage deadline): never moved, its weekday, a weekend or closed-day mark,
 *  Missed once before today in the firm's zone, and the days left (negative: overdue). */
export type MilestoneDue = { due: string; weekday: string | null; mark: "weekend" | "closed day" | null; shown: string | null; missed: boolean; daysLeft: number };
export type MilestoneView = {
  id: string; key: MilestoneKey | string; words: string; occurredOn: string; dueOn: string | null; reference: string | null; note: string | null;
  recordedAt: string; recordedBy: { staffId: string; name: string | null };
  cancelled: null | { at: string; by: { staffId: string; name: string | null }; reason: string };
  /** Open, with a due date: the deadline as shown, and the reminder days planned (Sample offsets, the firm's open days). */
  deadline: MilestoneDue | null;
  reminders: { offset: number; day: string }[];
};
export type CaseMilestonesView = { caseId: string; milestones: MilestoneView[]; keys: { key: MilestoneKey; words: string }[]; sample: true; canRecord: boolean };
/** On the case's stages read (GET /runtime/cases/:id/stages), beside the stage deadline: every open step with a due date. */
export type MilestoneDeadline = { id: string; key: string; words: string; reference: string | null } & MilestoneDue;
