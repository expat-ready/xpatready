// AUD-2 part 1: the one sha256 of an archive copy (hex), shared by the fake archive and PF-11c's read-back. Out of
// ports/ because ports/ imports only zod (case-side contract v0.1 §1 rule 3; check_pf0p_ports.ts).
import { createHash } from "node:crypto";

export const sha256Of = (b: Buffer) => createHash("sha256").update(b).digest("hex");
