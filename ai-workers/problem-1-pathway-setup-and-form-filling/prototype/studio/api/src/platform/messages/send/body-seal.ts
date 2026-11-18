// PF-19e (AG-1-70; Lead B brief rev 16.64): a TRANSACTIONAL message's rendered body (codes, invitation and reset links)
// is stored sealed by SecretBoxPort, purpose "message-body", for its firm (a platform account message: the platform's
// own space, PLATFORM_FILES_SPACE). The stored file is then `{"sealed":"msgseal1","parts":[…]}`: the rendered JSON cut
// into parts (the box seals at most 8192 characters), each sealed for an owner that also names the outbox id, the part
// and the number of parts, so a part moved to another message, reordered or dropped is refused. The row's rendered_hash
// is the hash of these sealed bytes (Messages.send stores what this returns). SERVICE and MARKETING bodies stay plain.
// Only the send worker and the demo inbox open a body; nothing here logs or returns one.
import { randomBytes } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Rendered } from "../../../../../ports/messages.ts";
import { SecretRefused, type SecretBoxPort, type SecretOwner } from "../../../../../ports/secret-box.ts";
import { STUDIO } from "../../../core.ts";
import { platformConfig, type SecretBoxKeys } from "../../config/settings.ts";
import { Secret } from "../../config/secret.ts";
import { aesGcmSecretBox } from "../../secret-box/aes-gcm.ts";

export const BODY_PURPOSE = "message-body";
export const SEALED_BODY_SCHEME = "msgseal1";
/** Characters per sealed part (under the box's 8192). */
const PART = 8000;

type SealedBodyFile = { sealed: typeof SEALED_BODY_SCHEME; parts: string[] };

const ownerOf = (space: string, outboxId: string, n: number, total: number): SecretOwner => ({ firmId: space, personId: `msg:${outboxId}:${n}:${total}`, purpose: BODY_PURPOSE });

/** Cuts text into parts of at most PART characters, never between the two halves of a surrogate pair. */
function cut(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length;) {
    let j = Math.min(i + PART, s.length);
    if (j < s.length && /[\uD800-\uDBFF]/.test(s[j - 1])) j--;
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

/** The bytes to store for a rendered message: sealed when TRANSACTIONAL, the plain JSON otherwise (unchanged). */
export function storedBody(box: SecretBoxPort, space: string, r: Rendered): Uint8Array {
  const json = JSON.stringify(r);
  if (r.class !== "TRANSACTIONAL") return new TextEncoder().encode(json);
  const parts = cut(json);
  const file: SealedBodyFile = { sealed: SEALED_BODY_SCHEME, parts: parts.map((p, n) => box.seal(ownerOf(space, r.outboxId, n, parts.length), p)) };
  return new TextEncoder().encode(JSON.stringify(file));
}

/** True when the stored bytes are a sealed body (no key needed). */
export function isSealedBody(bytes: Uint8Array): boolean {
  try { const f = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SealedBodyFile>; return f?.sealed === SEALED_BODY_SCHEME && Array.isArray(f.parts); } catch { return false; }
}

/**
 * Opens a stored body for the worker or the demo inbox. A sealed body opens only in its own space, for its own outbox
 * id, with every part in place; otherwise SecretRefused. A plain file is read as before (bodies stored before PF-19e;
 * the row's hash still guards them). Never log what this returns.
 */
export function openStoredBody(box: SecretBoxPort, space: string, outboxId: string, bytes: Uint8Array): Rendered {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SealedBodyFile> & Partial<Rendered>;
  if (parsed?.sealed !== SEALED_BODY_SCHEME) return parsed as Rendered;
  const parts = Array.isArray(parsed.parts) ? parsed.parts : [];
  if (!parts.length || parts.some((p) => typeof p !== "string")) throw new SecretRefused("NOT_SEALED", "Not a sealed message body.");
  return JSON.parse(parts.map((p, n) => box.open(ownerOf(space, outboxId, n, parts.length), p)).join("")) as Rendered;
}

let appBox: SecretBoxPort | null = null;
/**
 * The app's message-body box: the configured key ring (PLATFORM_SECRET_BOX_KEYS; required outside local, so test and
 * production always seal with it). On a local server with no key ring (the Mac, a lane copy), a local-only key kept in
 * studio/var (git-ignored), made once, so queued and sent bodies still open after a restart. Never a real key.
 */
export function messageBodyBox(keys?: SecretBoxKeys): SecretBoxPort {
  if (keys) return aesGcmSecretBox(keys);   // a given key ring (tests: SecretBoxPort's shared contract runs through here)
  if (appBox) return appBox;
  const config = platformConfig();
  if (config.secretBox) return (appBox = aesGcmSecretBox(config.secretBox));
  if (config.environment !== "local") throw new SecretRefused("NOT_CONFIGURED", "No message-body sealing key on this server: set PLATFORM_SECRET_BOX_KEYS and PLATFORM_SECRET_BOX_KEY_VERSION.");
  const file = join(process.env.STUDIO_VAR ?? join(STUDIO, "var"), "local-message-body.key");
  let key = "";
  try { key = readFileSync(file, "utf8").trim(); } catch {
    mkdirSync(dirname(file), { recursive: true });
    // Written whole to a file of its own, then linked into place (fails if another process linked first): never half a key.
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}`;
    writeFileSync(tmp, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
    try { linkSync(tmp, file); } catch { /* another process made it first */ } finally { unlinkSync(tmp); }
    key = readFileSync(file, "utf8").trim();
  }
  if (Buffer.from(key, "base64").length !== 32) throw new SecretRefused("NOT_CONFIGURED", "The local message-body key file (studio/var/local-message-body.key) is not 32 bytes: delete it to make a new one.");
  return (appBox = aesGcmSecretBox({ current: 1, keys: new Map([[1, new Secret("local message-body key v1", key)]]) }));
}
