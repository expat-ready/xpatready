// AUD-1c part 1 (SA-11-4@4cfd3199, NFR5-08): the TypeScript mirror of the database's canonical form of an audit line,
// aud_event_canonical in migration 20261125153000_audit__aud1c_audit_chain, byte for byte. Pure: no database, no clock.
// entryHash = sha256(prevHash || UTF-8 of canonical(line)). AUD-1c part 2's checker recomputes each line's hash with it.
// A line is read from SQL as text (never through a JS Date, which keeps milliseconds only, or a parsed detail, which
// loses `1.0`): `at` as to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), `detail` as detail::text. The
// detail text is normalised here exactly as jsonb prints it, so a line given its JSON source text hashes the same.
import { createHash } from "node:crypto";

/** One audit line's chained fields, as text (null where SQL has null). `detail` is JSON text (jsonb's or any source). */
export type CanonicalLine = {
  chainKey: string; seq: string | bigint | number; id: string; at: string; workspaceId: string; firmId: string | null; caseId: string | null;
  combinationId: string | null; actor: string; actorType: string; action: string; entity: string; entityKey: string | null; summary: string;
  correlationId: string | null; supportSessionId: string | null; detail: string | null;
};

export const ZERO_HASH = Buffer.alloc(32);
const VERSION = "aud1c/1";

/** One field: its UTF-8 length in bytes, ':' and the text; '~' for null (aud_chain_field). */
const field = (v: string | null): string => (v === null ? "~" : `${Buffer.byteLength(v, "utf8")}:${v}`);

/** The canonical text of a line (aud_event_canonical): the version word, then the fields in this fixed order. */
export function canonical(l: CanonicalLine): string {
  return VERSION + [l.chainKey, String(l.seq), l.id, l.at, l.workspaceId, l.firmId, l.caseId, l.combinationId, l.actor, l.actorType, l.action, l.entity,
    l.entityKey, l.summary, l.correlationId, l.supportSessionId, l.detail === null ? null : jsonbText(l.detail)].map(field).join("");
}

/** sha256(prevHash || UTF-8 of canonical(line)), as the insert trigger aud_event_zchain computes it. */
export function entryHash(prevHash: Uint8Array, l: CanonicalLine): Buffer {
  return createHash("sha256").update(prevHash).update(canonical(l), "utf8").digest();
}

// ------------------------------------------------------------------------------------------- jsonb's text
type J = { t: "s"; v: string } | { t: "n"; v: string } | { t: "lit"; v: "true" | "false" | "null" } | { t: "a"; v: J[] } | { t: "o"; v: [string, J][] };

/** JSON text as PostgreSQL's jsonb prints it (jsonb_out): object keys shorter first, then by UTF-8 bytes, the last of
 *  a repeated key kept; ", " and ": " between items; numbers as numeric prints them (`1.0` stays, `1e2` is `100`);
 *  strings with jsonb's escapes only (\" \\ \b \f \n \r \t, other controls \u00xx, everything else as is). */
export function jsonbText(src: string): string {
  let i = 0;
  const ws = () => { while (i < src.length && " \t\n\r".includes(src[i])) i++; };
  const fail = (what: string): never => { throw new Error(`jsonbText: ${what} at ${i}`); };
  const str = (): string => {
    if (src[i] !== '"') fail("expected a string");
    i++; let out = "";
    for (;;) {
      if (i >= src.length) fail("unterminated string");
      const c = src[i++];
      if (c === '"') return out;
      if (c === "\\") {
        const e = src[i++];
        if (e === "u") {
          const h = src.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail("bad \\u escape"); i += 4;
          const cp = parseInt(h, 16); if (cp === 0) fail("\\u0000 is not allowed in jsonb");
          if (cp >= 0xd800 && cp <= 0xdbff) {
            if (src.slice(i, i + 2) !== "\\u") fail("lone high surrogate");
            const lo = parseInt(src.slice(i + 2, i + 6), 16); if (!(lo >= 0xdc00 && lo <= 0xdfff)) fail("bad low surrogate");
            i += 6; out += String.fromCharCode(cp, lo);
          } else if (cp >= 0xdc00 && cp <= 0xdfff) fail("lone low surrogate");
          else out += String.fromCharCode(cp);
        } else {
          const m: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
          if (!(e in m)) fail("bad escape"); out += m[e];
        }
      } else if (c < " ") fail("control character in a string");
      else out += c;
    }
  };
  const value = (): J => {
    ws();
    const c = src[i];
    if (c === "{") {
      i++; const items: [string, J][] = []; ws();
      if (src[i] === "}") { i++; return { t: "o", v: items }; }
      for (;;) { ws(); const k = str(); ws(); if (src[i++] !== ":") fail("expected ':'"); items.push([k, value()]); ws(); const d = src[i++]; if (d === "}") break; if (d !== ",") fail("expected ',' or '}'"); }
      return { t: "o", v: items };
    }
    if (c === "[") {
      i++; const items: J[] = []; ws();
      if (src[i] === "]") { i++; return { t: "a", v: items }; }
      for (;;) { items.push(value()); ws(); const d = src[i++]; if (d === "]") break; if (d !== ",") fail("expected ',' or ']'"); }
      return { t: "a", v: items };
    }
    if (c === '"') return { t: "s", v: str() };
    for (const lit of ["true", "false", "null"] as const) if (src.startsWith(lit, i)) { i += lit.length; return { t: "lit", v: lit }; }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) fail("unexpected character");
    i += m![0].length;
    return { t: "n", v: numericText(m![0]) };
  };
  const root = value(); ws(); if (i !== src.length) fail("trailing text");
  return print(root);
}

const utf8Cmp = (a: string, b: string): number => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
/** jsonb's key order: shorter (in bytes) first, then by bytes. */
const keyCmp = (a: string, b: string): number => (Buffer.byteLength(a, "utf8") - Buffer.byteLength(b, "utf8")) || utf8Cmp(a, b);

function print(j: J): string {
  switch (j.t) {
    case "s": return quote(j.v);
    case "n": case "lit": return j.v;
    case "a": return `[${j.v.map(print).join(", ")}]`;
    case "o": {
      const last = new Map<string, J>(); for (const [k, v] of j.v) last.set(k, v);   // the last of a repeated key wins
      return `{${[...last.keys()].sort(keyCmp).map((k) => `${quote(k)}: ${print(last.get(k)!)}`).join(", ")}}`;
    }
  }
}

/** escape_json: \" \\ \b \f \n \r \t, other characters below U+0020 as \u00xx (lower-case hex), the rest as is. */
function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const m: Record<string, string> = { '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
    if (ch in m) out += m[ch];
    else if (ch < " ") out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

/** A JSON number as PostgreSQL's numeric prints it: no exponent, the scale kept (max(0, fraction digits − exponent)),
 *  no leading zeros, no negative zero (`-0.0` is `0.0`). Exact on strings, never through a JS number. */
export function numericText(lexeme: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(lexeme);
  if (!m) throw new Error(`numericText: not a number: ${lexeme}`);
  const neg = m[1] === "-", int = m[2], frac = m[3] ?? "", exp = Number(m[4] ?? 0);
  const scale = Math.max(0, frac.length - exp);
  // The digits with the point moved `exp` places right: value = digits × 10^(exp − frac.length).
  const digits = int + frac, pointAt = int.length + exp;   // the point's place counted from the left of `digits`
  let whole: string, part: string;
  if (pointAt <= 0) { whole = "0"; part = "0".repeat(-pointAt) + digits; }
  else if (pointAt >= digits.length) { whole = digits + "0".repeat(pointAt - digits.length); part = ""; }
  else { whole = digits.slice(0, pointAt); part = digits.slice(pointAt); }
  part = (part + "0".repeat(scale)).slice(0, scale);   // numeric keeps exactly `scale` digits (the dropped ones are zeros)
  whole = whole.replace(/^0+(?=\d)/, "");
  const zero = /^0*$/.test(whole + part);
  return `${neg && !zero ? "-" : ""}${whole}${scale ? `.${part}` : ""}`;
}

/** The shared test vector (tests/check_aud1c_chain.ts checks the database gives the same text and hash for each). */
const base: CanonicalLine = { chainKey: "00000000-0000-4000-8000-0000000a1cf1", seq: "7", id: "00000000-0000-4000-8000-0000000a1c01", at: "2026-11-18T09:30:15.123456Z",
    workspaceId: "00000000-0000-4000-8000-0000000a1c0a", firmId: "00000000-0000-4000-8000-0000000a1cf1", caseId: null, combinationId: null, actor: "staff:00000000-0000-4000-8000-0000000a1c5f",
    actorType: "FIRM_STAFF", action: "check", entity: "aud1c", entityKey: "vector", summary: "Sample line", correlationId: null, supportSessionId: null, detail: null };
export const VECTOR: { name: string; line: CanonicalLine }[] = [
    { name: "nulls everywhere they may be", line: base },
    { name: "keys of different lengths, nested objects, a repeated key", line: { ...base, detail: '{"zz": 1, "a": {"bbb": [true, null], "cc": "x"}, "ab": 2, "a": {"dd": [], "c": {}}}' } },
    { name: "numbers: 1.0, 1e2, 1.50E-1, -0, -0.0, 0.00e3, 12345678901234567890.5", line: { ...base, detail: '[1.0, 1e2, 1.50E-1, -0, -0.0, 0.00e3, 12345678901234567890.5, 2E+1, 1.23e1]' } },
    { name: "a non-Latin string, escapes and controls", line: { ...base, summary: "Échantillon: 申请人 — résumé ✓", detail: '{"note": "Привет \\"quoted\\" \\/ tab\\t nl\\n \\u0001 \\u001f \\u001F \\u00e9 \\ud83d\\ude00", "é": "ü"}' } },
    { name: "a platform line with every optional field", line: { ...base, chainKey: "platform", firmId: null, caseId: "00000000-0000-4000-8000-0000000a1cca", combinationId: "00000000-0000-4000-8000-0000000a1ccb", correlationId: "req-1", supportSessionId: "00000000-0000-4000-8000-0000000a1cdd", actor: "system", actorType: "SYSTEM", entityKey: "", detail: '"just a string"' } },
    { name: "JSON null as detail, seq 1", line: { ...base, seq: "1", detail: "null" } },
];
