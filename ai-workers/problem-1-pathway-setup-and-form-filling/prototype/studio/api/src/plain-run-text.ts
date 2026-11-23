// The one rule for run messages a person reads (S3 early look 1), shared by the run card (runs.ts) and the AI work page
// (ai.ts batch view, C3.3 review M1).
import { logPort } from "./platform/observability/log.ts";
/** S3 early look (1): a run never shows raw technical text (an error code, a stack, a server path), whatever wrote it;
 *  such a message is replaced by plain words and the detail stays in the server log. */
const TECH = /\b(E(NOENT|ACCES|PERM|CONN[A-Z]+|ADDRINUSE|TIMEDOUT|PIPE|NOTDIR|ISDIR|EXIST)|errno|syscall|Node\.js v\d)|\/(Users|home|private|tmp|var)\/|[A-Za-z]:\\|\bat \S+:\d+:\d+|\.(m?[jt]s|json):\d+/;
export function plainRunText(t: string | null, runId?: string): string | null {
  if (!t || !TECH.test(t)) return t;
  logPort.warn("run_message_kept_from_page", { runId, length: t.length });   // PF-23m: a run's message can quote a person's values; never logged
  return "Something went wrong on this computer; what the run spent is on this card. Try again, or attach the forms from the Form library by hand.";
}

/** PF-23m (review m2): a launcher's or provider's refusal as a fixed reason code for the log, never its words (they can
 *  quote a path, an input or a person's value); the words themselves stay in the run file. */
const REASONS: [RegExp, string][] = [[/^\s*guard\b/i, "guard"], [/usage limit/i, "usage_limit"], [/live[ _-]?off|not approved|P-110/i, "live_off"], [/time[d ]?\s?out|ETIMEDOUT/i, "timeout"], [/ENOENT|not found|no such file/i, "not_found"], [/\bcap\b|budget|spend limit|US\$/i, "spend_cap"], [/rate limit|429|overloaded|busy/i, "busy"]];
export function launcherReason(text: string | null | undefined): string {
  const s = String(text ?? "").trim();
  if (!s) return "none";
  return REASONS.find(([re]) => re.test(s))?.[1] ?? "other";
}
