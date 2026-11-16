// PF-21i (STANDARDS §4 "[M] Idempotent creates and job launches"; BACKLOG row PF-21i rev 16.24): the one helper for an
// idempotent create behind an `Idempotency-Key` header, written once so later creates reuse it (the first door on main
// is POST /api/platform/complaints; a cross-module use moves it to ports/). Three parts:
//   * readIdempotencyKey: the header's value, 1-255 visible ASCII characters (0x21-0x7E); a quoted string (the IETF
//     httpapi draft's Structured Field String form, "…") is accepted with its quotes stripped (and \" \\ unescaped).
//     None → 400 IDEMPOTENCY_KEY_MISSING; any other shape (too long, a space, a control character, the header twice)
//     → 400 IDEMPOTENCY_KEY_INVALID.
//   * requestHash: the SHA-256 (hex) of the canonical request body: JSON with every object's keys sorted, so a body that
//     differs only in key order is the same request.
//   * lockRequestKey: pg_advisory_xact_lock on "<scope>:<firm>:<key>" for the rest of the transaction (the same
//     transaction-lock pattern as rule-facts.ts and form-masters.ts): two parallel requests with one key run one after
//     the other, so the second finds the first's row once it has committed.
import { HttpException, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const IDEMPOTENCY_HEADER = "idempotency-key";
const MAX = 255;
const VISIBLE = /^[\x21-\x7e]+$/;

const problem = (status: number, code: string, title: string, detail: string): never => {
  throw new HttpException({ type: `https://expatready.local/problems/${code}`, title, status, detail, code: code.toUpperCase().replace(/-/g, "_") }, status as HttpStatus);
};

/** The key from the header's raw value. Node joins a repeated header into one string with ", ", which the space
 *  refuses; an array (any other caller) is refused too. A value that starts with a quote must be one whole quoted
 *  string (no parameters such as `;p=1`, no lone quote). */
export function readIdempotencyKey(raw: unknown, missing: string): string {
  if (raw === undefined || raw === null || raw === "") return problem(400, "idempotency-key-missing", "Idempotency-Key needed", missing);
  const invalid = () => problem(400, "idempotency-key-invalid", "Idempotency-Key not valid", `The Idempotency-Key header is one value of 1 to ${MAX} visible characters (letters, digits and punctuation, no spaces).`);
  if (typeof raw !== "string") return invalid();
  let key = raw;
  if (key.startsWith("\"")) {
    if (key.length < 2 || !key.endsWith("\"")) return invalid();
    let out = "";
    const inner = key.slice(1, -1);
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "\"") return invalid();   // a bare quote inside: not one quoted string
      if (ch === "\\") { const nx = inner[++i]; if (nx !== "\"" && nx !== "\\") return invalid(); out += nx; } else out += ch;
    }
    key = out;
  }
  if (key.length < 1 || key.length > MAX || !VISIBLE.test(key)) return invalid();
  return key;
}

/** JSON with every object's keys sorted (arrays keep their order): the canonical form of a request body. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonicalJson(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

/** The SHA-256 (lowercase hex) of the canonical request body. */
export const requestHash = (body: unknown): string => createHash("sha256").update(canonicalJson(body ?? {}), "utf8").digest("hex");

/** Holds "<scope>:<firm>:<key>" for the rest of the transaction. */
export async function lockRequestKey(tx: Prisma.TransactionClient, scope: string, firmId: string, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${scope}:${firmId}:${key}`}))`;
}
