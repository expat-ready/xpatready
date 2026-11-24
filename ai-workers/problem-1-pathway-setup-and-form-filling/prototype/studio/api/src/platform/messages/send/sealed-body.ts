// PF-19e (AG-1-70; PF-19b part 2's held binding): every TRANSACTIONAL message's rendered file is stored sealed by
// SecretBoxPort (purpose "message-body"): a firm's under that firm's key, a platform account message (PF-19p) under the
// platform's own (its file space id as the owner). The box seals at most 8192 characters, so the rendered JSON is sealed
// in parts; each part's owner names its outbox id, its place and the number of parts (`<outbox id>.<n>.<of>`), so a part
// never opens as another message's or in another place, and a dropped or added part is refused. The outbox row's hash is
// of these sealed bytes. Only the send worker and the demo inbox open it; nothing here logs, audits or answers the body.
// SERVICE and MARKETING files are stored as before (plain JSON).
import { createHash } from "node:crypto";
import type { Rendered } from "../../../../../ports/messages.ts";
import { SecretRefused, type SecretBoxPort, type SecretOwner } from "../../../../../ports/secret-box.ts";
import { Secret } from "../../config/secret.ts";
import type { PlatformConfig } from "../../config/settings.ts";
import { aesGcmSecretBox } from "../../secret-box/aes-gcm.ts";

type MessageClass = Rendered["class"];

export const MESSAGE_BODY_PURPOSE = "message-body";
/** The sealed file's mark (its only other field is `parts`). */
const SCHEME = "msg-sealed-1";
/** Characters per sealed part (the box takes 1 to 8192). */
const PART = 8000;
/** The platform's own owner id for PF-19p's platform account messages (PLATFORM_FILES_SPACE: no firm's id). */
const PLATFORM_OWNER = "00000000-0000-0000-0000-000000000000";

/** Whether a message of this class is stored sealed. */
export const sealedClass = (cls: MessageClass) => cls === "TRANSACTIONAL";

const ownerOf = (firmId: string | null, outboxId: string, n: number, of: number): SecretOwner =>
  ({ firmId: firmId ?? PLATFORM_OWNER, personId: `${outboxId.toLowerCase()}.${n}.${of}`, purpose: MESSAGE_BODY_PURPOSE });

/** Splits text in parts of at most PART UTF-16 units, never between the two halves of a surrogate pair. */
function partsOf(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + PART, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

/** The bytes stored for a rendered message: sealed for a TRANSACTIONAL one, else its JSON as before. */
export function storedBytes(box: SecretBoxPort, r: Rendered): Uint8Array {
  const json = JSON.stringify(r);
  if (!sealedClass(r.class)) return new TextEncoder().encode(json);
  const parts = partsOf(json);
  return new TextEncoder().encode(JSON.stringify({ sealed: SCHEME, parts: parts.map((p, n) => box.seal(ownerOf(r.firmId, r.outboxId, n, parts.length), p)) }));
}

/** The rendered message from its stored bytes, for the row's class. A TRANSACTIONAL file that is not sealed, or does not
 *  open for its own firm and outbox id, is refused (SecretRefused); a sealed file for another class is refused too. */
export function openStored(box: SecretBoxPort, firmId: string | null, outboxId: string, cls: MessageClass, bytes: Uint8Array): Rendered {
  const v = JSON.parse(new TextDecoder().decode(bytes)) as { sealed?: unknown; parts?: unknown };
  const sealed = typeof v === "object" && v !== null && v.sealed === SCHEME;
  if (sealedClass(cls) !== sealed) throw new SecretRefused("NOT_SEALED", sealed ? "A sealed body for a class stored plain." : "A transactional body stored unsealed.");
  if (!sealed) return v as Rendered;
  const parts = Array.isArray(v.parts) ? v.parts : [];
  if (!parts.length || !parts.every((p) => typeof p === "string")) throw new SecretRefused("NOT_SEALED", "Not a sealed message body.");
  return JSON.parse(parts.map((p: string, n) => box.open(ownerOf(firmId, outboxId, n, parts.length), p)).join("")) as Rendered;
}

/** A local copy with no PLATFORM_SECRET_BOX_KEYS (the Mac, lanes, CI's copies) seals with one fixed key derived from a
 *  constant, the same in every process, so a body a test or a seed wrote opens in the server's worker. It is no secret:
 *  local copies hold Sample data only (the brief's amendment: demo and test copies may keep the token readable); every
 *  other environment needs the key ring (bodyBoxOf). */
let localBox: SecretBoxPort | null = null;
const localRing = () => ({ current: 1, keys: new Map([[1, new Secret("message-body local key", createHash("sha256").update("expat-ready local copies: message-body sealing (not a secret)").digest("base64"))]]) });

/** The local copies' box (MessagePort's and the demo inbox's default: a test that builds its own Messages). */
export const LOCAL_BODY_CONFIG = { environment: "local", secretBox: null } as const;

/** The app's box for message bodies: the configured key ring; a local copy without one, the fixed local key; elsewhere every
 *  seal is refused, saying which settings to supply (a transactional body is never stored unsealed). */
export function bodyBoxOf(config: Pick<PlatformConfig, "environment" | "secretBox">): SecretBoxPort {
  if (config.secretBox) return aesGcmSecretBox(config.secretBox);
  if (config.environment === "local") return (localBox ??= aesGcmSecretBox(localRing()));   // local only: the fixed key above
  const refuse = (): never => { throw new SecretRefused("NOT_CONFIGURED", "No message-body sealing key on this server: set PLATFORM_SECRET_BOX_KEYS and PLATFORM_SECRET_BOX_KEY_VERSION (deploy/RUNBOOK-secrets.md)."); };
  return { currentVersion: refuse, seal: refuse, open: refuse, versionOf: refuse, reseal: refuse };
}
