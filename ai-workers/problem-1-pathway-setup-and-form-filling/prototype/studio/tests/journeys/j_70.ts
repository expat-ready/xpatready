// J-70 (R1.70 expiry, translation and notarisation flags on each document; CS-D7c + CS-D7): the case officer's walk, by
// screens and keyboard only, is check_csd5_flags_browser.ts, run here on its own copy under R1.70's number (automatic proof
// looks for tests/journeys/j_<n>.ts per item, P-728 (3)). Its steps: the document type's cited defaults (CS-D7c, test
// words) are approved by a second person and released; a case on wp.family; the passport uploaded; on the case page's
// Documents panel the line's menu → "Document flags…" → Spanish → the "Translation + translator's affidavit" line appears;
// Provided without a detail is refused in the server's words; with it, Provided; an expiry in the past warns and blocks
// nothing; English takes the line away; one audit line per flag changed; axe 0 serious, 1440/1024/375 px. The API rules
// behind it: check_csd5c_type_defaults.ts and check_csd5_flags.ts. Sample rows only; live AI off; US$0. Run from prototype/:
//   zsh studio/tools/isolated.sh j70 4470 start --ttl 30 && trap 'zsh studio/tools/isolated.sh j70 4470 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_70.ts j70 4470
const [NAME, PORT] = [process.argv[2] ?? "j70", process.argv[3] ?? "4470"];
// The suite reads <port> <database> (acceptance/lib/m3.ts); the journey is called with <copy name> <port>.
process.argv.splice(2, process.argv.length - 2, PORT, `xr_studio_${NAME}`);
await import("../check_csd5_flags_browser.ts");
