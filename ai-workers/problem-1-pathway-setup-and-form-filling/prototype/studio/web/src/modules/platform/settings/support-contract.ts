// PF-18s part 2 (concept screens/PF-18s §4 boards D and E, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-63; R1.92):
// the shapes the "?" panel and Help & support read from PF-18b's routes (/api/platform/support), parsed at the edge, and the pages'
// pure helpers. No imports from the app, so a test reads it in Node. The server decides every rule (who sees what, limits, Closed).
import { z } from "zod";

export const SUPPORT_LIST_KEY = "agent/support-ticket:list";
export const SUPPORT_CREATE_KEY = "agent/support-ticket:create";
/** PF-18b's limits (support.ts BODY_MAX, MAX_FILES; the file size is a Sample limit): shown to the person, decided by the server. */
export const BODY_MAX = 5000, MAX_FILES = 3;
export const FILE_TYPES = "application/pdf,image/png,image/jpeg,text/plain";

export const Status = z.enum(["OPEN", "WAITING_ON_FIRM", "WAITING_ON_SUPPORT", "CLOSED"]);
export type Status = z.infer<typeof Status>;
/** The words and tooltips of concept §5; Waiting on firm is the one "needs you" (orange). */
export const STATUS: Record<Status, { label: string; tip: string }> = {
  OPEN: { label: "Open", tip: "Sent; we haven't answered yet." },
  WAITING_ON_FIRM: { label: "Waiting on firm", tip: "We've answered and are waiting for you." },
  WAITING_ON_SUPPORT: { label: "Waiting on support", tip: "We have your message." },
  CLOSED: { label: "Closed", tip: "No more messages on this ticket." },
};
export const Message = z.object({ id: z.string(), authorKind: z.enum(["FIRM_STAFF", "SUPPORT"]), authorId: z.string(), authorName: z.string().nullable().optional(), body: z.string(), files: z.array(z.number()), createdAt: z.string() });
export type Message = z.infer<typeof Message>;
export const Ticket = z.object({ id: z.string(), raisedBy: z.string(), page: z.string(), status: Status, createdAt: z.string(), updatedAt: z.string(),
  subject: z.string().optional(), raisedByName: z.string().nullable().optional(), messages: z.array(Message).optional() });
export type Ticket = z.infer<typeof Ticket>;
export const TicketList = z.object({ items: z.array(Ticket), allFirm: z.boolean() });
export const Raised = Ticket.extend({ emailed: z.boolean() });
export const Link = z.object({ url: z.string(), expiresAt: z.string() });

/** The page a ticket notes: the app path only, never its query or fragment (AG-16-63 "current page noted"; challenge m7). */
export const pageOf = (pathname: string) => pathname.split(/[?#]/)[0] || "/";
/** Who wrote a message, in words: You, the colleague's name, or our team. */
export const authorLine = (m: Message, myId: string) =>
  m.authorKind === "SUPPORT" ? "ExpatReady support" : m.authorId.toLowerCase() === myId.toLowerCase() ? "You" : m.authorName ?? "A colleague";
/** The 422's `fields` map (support.ts), the body's and the files' words. */
export const fieldOf = (fields: unknown, key: "body" | "files") => {
  if (!fields || typeof fields !== "object") return undefined;
  const f = fields as Record<string, unknown>, hits = Object.entries(f).filter(([k, v]) => (k === key || k.startsWith(`${key}.`)) && typeof v === "string") as [string, string][];
  // Review m-2: the server's words are lower-case fragments ("write what you need help with"): shown as sentences. Break m7: each
  // refused file is named by its number ("File 2: …").
  const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?]$/.test(s) ? "" : "."}`;
  return hits.length ? hits.map(([k, v]) => (/\.\d+$/.test(k) ? `File ${Number(k.split(".").pop()) + 1}: ${sentence(v)}` : sentence(v))).join(" ") : undefined;
};
