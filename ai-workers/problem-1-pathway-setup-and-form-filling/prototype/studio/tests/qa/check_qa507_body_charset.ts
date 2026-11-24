// qa, PF-0bp (#2087, "body-parser errors are problem answers, never 500"; STANDARDS §6): QA-507 through a running copy,
// over HTTP. The body parser refuses a JSON body whose charset it does not know (415 charset.unsupported) or whose
// Content-Encoding it cannot undo (415 encoding.unsupported) before any route; today ProblemErrors turns only the
// parser's 400 entity.* errors into a problem answer, so these two fall through to the generic 500.
//   B1 an unknown charset (application/json; charset=klingon) → 415 BODY_CHARSET in words, the charset not repeated, not 500;
//   B2 an unknown Content-Encoding → 415 BODY_ENCODING in words with Accept-Encoding, the encoding not repeated, not 500;
//   B3 broken JSON still answers 400 BODY_NOT_JSON (PF-0bp DW1; passes today, so the probe reaches the parser);
//   B4 no answer quotes a stack, a server path or the parser's own words.
// Any POST under /api reaches the parser first; the probe uses the public sign-in door, which changes nothing.
// Run from prototype/ (an isolated copy; never :4400):
//   zsh studio/tools/isolated.sh qa507 4473 start --ttl 20 && trap 'zsh studio/tools/isolated.sh qa507 4473 stop' EXIT \
//     && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa507_body_charset.ts 4473
// No database write, no model call; US$0.
import { recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4473), URL_ = `http://localhost:${PORT}/api/platform/session/local`;
const { ok, summary } = recorder();
const post = async (headers: Record<string, string>, body: string) => {
  const r = await fetch(URL_, { method: "POST", headers, body });
  const text = await r.text();
  let json: { status?: number; detail?: string; code?: string } | null = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, type: r.headers.get("content-type") ?? "", accept: r.headers.get("accept-encoding") ?? "", text, json };
};
const leaks = (t: string) => /at [A-Za-z.<>]+ \(|\/api\/src\/|node_modules|unsupported charset|unsupported content encoding/i.test(t);

const charset = await post({ "content-type": "application/json; charset=klingon" }, "{}");
ok("QA-507 B1: an unknown charset → 415 BODY_CHARSET, a problem answer in words that does not repeat the sent charset (not 500)", charset.status === 415 && charset.json?.code === "BODY_CHARSET" && charset.type.startsWith("application/problem+json") && !!charset.json?.detail && !/klingon/i.test(charset.text), [charset.status, charset.json?.code, charset.json?.detail]);
const encoding = await post({ "content-type": "application/json", "content-encoding": "zstd-nope" }, "{}");
ok("QA-507 B2: an unknown Content-Encoding → 415 BODY_ENCODING in words, naming the encodings it reads (Accept-Encoding), not repeating the sent one (not 500)", encoding.status === 415 && encoding.json?.code === "BODY_ENCODING" && encoding.type.startsWith("application/problem+json") && !!encoding.json?.detail && /gzip/.test(encoding.accept) && !/zstd-nope/i.test(encoding.text), [encoding.status, encoding.json?.code, encoding.accept, encoding.json?.detail]);
const broken = await post({ "content-type": "application/json" }, '{"email":');
ok("QA-507 B3 (control): broken JSON still answers 400 BODY_NOT_JSON", broken.status === 400 && broken.json?.code === "BODY_NOT_JSON", [broken.status, broken.json?.code]);
ok("QA-507 B4: no answer quotes a stack, a server path or the parser's words", ![charset, encoding, broken].some((a) => leaks(a.text)));
process.exit(summary() ? 1 : 0);
