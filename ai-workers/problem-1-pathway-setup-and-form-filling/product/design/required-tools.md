# Required tools for the Pathway Configurator (P-632; the tech lead keeps this list)

Every check compares this list with the session's connectors (B198). A row that is not connected goes to the founder at once: what, why, the fix. No workaround in its place.

| Tool | Kind | Needed for | Rule | If missing: the founder's fix |
|---|---|---|---|---|
| Gmail (company mailbox, read-only) | claude.ai connector | **on demand (P-633)**: only when a task needs an outside account's mail (AWS, BoldSign, Google verification, Meta); the Lead names the task and asks | P-633, P-618 | claude.ai › Settings › Connectors › Gmail: connect, read-only, when asked |
| Google Drive (read-only) | claude.ai connector | the team's requirement snapshots (`sources/drive-snapshot-*`) | AGENTS rule 2 | claude.ai › Settings › Connectors › Google Drive: connect |
| GitHub access (gh token on the Mac; cloud GitHub connection) | account | every PR, label, merge and check | P-82 | `gh auth login` on the Mac; claude.ai › Settings › GitHub for cloud |
| Built-in browser, signed in to claude.ai | desktop app | the app view every check (lanes on claude.ai/code) | P-326, B197 | sign in to claude.ai in the browser pane |
| Playwright | plugin | builders' and qa's browser tests | STANDARDS, journey-test | desktop app › Plugins › playwright: enable |
| Context7 | desktop extension | current library documentation for builders | P-502 | desktop app › Extensions › Context7: enable |
| Scheduled checks (CronCreate) and session tools | built in | the 30-minute check, starting and steering lanes | P-291, P-286 | never turned off (no setting) |
| Artifact (the founder's board) | built in | the board | P-593 | never turned off |

Not needed here (may stay off): Google Calendar, Slack, Notion, Asana, Linear, Jira, Monday, ClickUp, Figma, Amplitude, Pendo, Intercom, Fireflies, Similarweb, PagerDuty, Datadog, the iOS simulator, and the Productivity, Product management and Engineering plugins.
