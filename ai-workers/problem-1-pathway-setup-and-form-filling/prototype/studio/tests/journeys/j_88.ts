// J-88 (map row 88, R1.88: the firm reads its own audit log; concept screens/AUD-4s/concept.md "Tests"): the join-and-walk of
// AUD-4 (#2339, the read and the export) and AUD-4s (My account → Activity log). It adds no feature: the walk is AUD-4s's own
// browser check, run here on the journey's copy under R1.88's number (automatic proof looks for tests/journeys/j_<n>.ts per
// item, P-728 (3)): W1 the Owner's 8 steps by keyboard (the last 7 days, "ExpatReady staff access", a line opened with its
// before and after, the person who left, the export and its own line, a range over a year, Show more), the Admin's steps, the
// Case Officer refused (DW1), and DW1b-DW8, each with its fail. The browser is the check's own chromium. Sample lines only;
// US$0, no model call; live AI off. Run from prototype/:
//   zsh studio/tools/isolated.sh j88 4448 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j88 4448 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_88.ts j88 4448
// <name> <port>, as tests/journeys/walk.mjs calls a journey; the check reads <port> <db>.
const [NAME, PORT] = [process.argv[2] ?? "j88", process.argv[3] ?? "4448"];
process.argv[2] = PORT; process.argv[3] = `xr_studio_${NAME}`;
await import("../check_aud4s_activity_log_browser.ts");
