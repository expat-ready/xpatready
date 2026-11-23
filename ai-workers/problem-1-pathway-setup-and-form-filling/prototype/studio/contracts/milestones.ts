// CS-DL3 part 1 (R1.74, QA-591; Doc 3 line 3337 CaseMilestone): a case's government steps, apart from contracts/runtime.ts.
// GET|POST /api/runtime/cases/:id/milestones, POST …/milestones/:mid/cancel. No update route (AG-7-96 r7); the due date
// is IRCC's letter's, typed by staff, never computed (P-170).
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

/** Words a person reads: no control character but tab and new line, no bidi override (break m3), no lone surrogate (m1). */
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const badText = (t: string) => BAD.test(t) || LONE.test(t);
/** Characters, not UTF-16 units (break m2). */
const len = (t: string) => [...t].length;
/** Spaces and invisible characters only count as empty. */
const blank = (t: string) => !t.replace(/[\s​-‍⁠﻿]/g, "");
type Ctx = { addIssue: (i: { code: "custom"; message: string; path?: (string | number)[]; params?: Record<string, unknown> }) => void };
const realDate = (d: unknown): d is string =>
  typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d && d >= "1900-01-01" && d <= "2200-12-31";
const day = z.unknown().transform((d, ctx: Ctx) => { if (realDate(d)) return d; ctx.addIssue({ code: "custom", message: "A real date as YYYY-MM-DD." }); return z.NEVER; });
const optText = (max: number) => z.unknown().transform((v, ctx: Ctx) => {
  if (v == null) return null;
  if (typeof v === "string" && !badText(v) && len(v.trim()) <= max) return blank(v) ? null : v.trim();
  ctx.addIssue({ code: "custom", message: `Plain text, at most ${max} characters.` }); return z.NEVER;
});
const notHere = (what: string) => ({ error: (i: { code: string; keys?: string[] }) => i.code === "unrecognized_keys" ? `Not a field of ${what}: ${(i.keys ?? []).join(", ")}.` : `Give ${what} as an object.` });

/** POST …/milestones. dueOn is optional (a letter may give none); when given it is never before occurredOn (400 at dueOn). */
export const RecordMilestoneBody = z.strictObject({
  /** STANDARDS §4: the same key again returns the first line (replayed), never a second one. */
  idempotencyKey: z.unknown().transform((k, ctx: Ctx) => {
    if (k == null) return null;
    if (typeof k === "string" && /^[A-Za-z0-9._:-]{1,100}$/.test(k)) return k;
    ctx.addIssue({ code: "custom", message: "1-100 letters, digits, . _ : -" }); return z.NEVER;
  }).optional(),
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
    if (badText(r)) { ctx.addIssue({ code: "custom", message: "Plain text only." }); return z.NEVER; }
    if (blank(r)) { ctx.addIssue({ code: "custom", message: "Give a reason.", params: { code: "REASON_REQUIRED" } }); return z.NEVER; }
    if (len(r) > MILESTONE_REASON_MAX) { ctx.addIssue({ code: "custom", message: `At most ${MILESTONE_REASON_MAX} characters.` }); return z.NEVER; }
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
  /** true when an idempotency key replayed an earlier record. */
  replayed?: true;
};
export type CaseMilestonesView = { caseId: string; milestones: MilestoneView[]; keys: { key: MilestoneKey; words: string }[]; sample: true; /** The case is OPEN (a step can be recorded); the person's keys come from /platform/me. */ caseOpen: boolean };
/** On the case's stages read (GET /runtime/cases/:id/stages), beside the stage deadline: every open step with a due date. */
export type MilestoneDeadline = { id: string; key: string; words: string; reference: string | null } & MilestoneDue;
