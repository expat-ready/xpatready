// CS-C1b (map row 77; brief design/build-lead-c-briefs/CS-C1b.md): the case side's active-case count, the read PF-15's
// plan limits use (BACKLOG PF-15: "the case side's case-count read port"). An adapter is bound to one firm by its
// caller (the session's firm), never by an argument a client can send. Active (SA-3-47): a case counts from its creation
// until a decision on every filing or its withdrawal; a reopened case counts again; after-decision work never counts.
// "Stream changed" also ends it (SA-3-47), but no such close outcome exists yet (STREAM_CHANGED comes later), so it is
// not counted here. The group (SA-3-4, SA-1-60) is the client type of the case's Pathway: CORPORATE → corporate,
// everything else (family cases included) → individual. This folder imports only zod and its own files.
import { z } from "zod";

export const ActiveCounts = z.strictObject({ individual: z.number().int().min(0), corporate: z.number().int().min(0) });
export type ActiveCounts = z.infer<typeof ActiveCounts>;

export interface CaseCountPort {
  /** The firm's active cases by group. `tx`: the caller's transaction, so the count sees what that transaction sees. */
  activeCounts(tx?: unknown): Promise<ActiveCounts>;
}

/** The fake: returns the numbers the test sets (`set`), the same with or without a transaction. */
export function fakeCaseCount(start: ActiveCounts = { individual: 0, corporate: 0 }): CaseCountPort & { set(next: ActiveCounts): void } {
  let now = ActiveCounts.parse(start);
  return {
    async activeCounts() { return { ...now }; },
    set(next) { now = ActiveCounts.parse(next); },
  };
}
