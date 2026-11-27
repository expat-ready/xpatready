// ports/events/firm-lock.ts — PF-27 (R1.22, SA-2-34, SA-2-8): our Platform Owner's security lock of a firm and its lift.
// Their own file (P-785 (2)); imports only zod. tests/check_ports_events.ts keeps every name unique across the folder.
import { z } from "zod";

export const FIRM_LOCK_EVENT = {
  /** A firm was put under a security lock; payload firmId and the prior status the lift returns to (PF-27). Written last. */
  FIRM_LOCKED: "firm.locked",
  /** A firm's security lock was lifted; payload firmId and the status it returned to (PF-27, SA-2-8). Written last. */
  FIRM_UNLOCKED: "firm.unlocked",
} as const;

/** The statuses a lock can start from, and so the ones a lift returns to: SA-02 §6 allows only Trial, Active and Payment
 *  hold → Security lock (SA-2-4: only the transitions in §6; review M4: never PROVISIONING, ABANDONED, DELETED or a lock). */
export const LOCKABLE_STATUSES = ["TRIAL", "ACTIVE", "PAYMENT_HOLD"] as const;
export const FirmLocked = z.object({ firmId: z.string().uuid(), prior: z.enum(LOCKABLE_STATUSES) });
export type FirmLocked = z.infer<typeof FirmLocked>;
export const FirmUnlocked = z.object({ firmId: z.string().uuid(), to: z.enum(LOCKABLE_STATUSES) });
export type FirmUnlocked = z.infer<typeof FirmUnlocked>;
