# PF-19s build notes (R1.46; thin PF-19c part 1), 23 Nov

## What was built
* API `api/src/platform/messages/templates/` (registry, service, routes) and `api/src/features/platform-templates.ts`. No migration:
  uses PF-19a's `msg_template` / `msg_template_version`. The preview's leads come through the `TemplateRecords` port; its adapter is
  `api/src/front-office/sales/template-records.ts`, so platform code imports no front-office code.
* Web `web/src/modules/platform/messages/templates/` (contract, list and editor pages); routes `/platform/templates` and
  `/platform/templates/:key`; My account → Templates (`agent/template:list`).
* Suite `tests/check_pf19s_templates_browser.ts`: 28 lines, each with a pass and a fail (T1-T6), on a fresh isolated copy.

## Challenge answers (see challenge.md "Lead response")
B1: the starters stay in code. Platform rows need a data-only migration, which is a question for the tech lead (PF-19c part 2).
The footer says "used when this message is sent", and the suite proves the send path's lookup picks the published firm version.
M1-M4 and m1-m4 are fixed.

## Choices
* Saving is publishing (no drafts in this slice; AG-12-65 drafts are in PF-19c part 2). Both `:edit` and `:publish` are needed.
* The conflict rule: the PUT carries `baseVersion`. An advisory lock per firm and key serialises publishers, so a stale or
  concurrent publish gets 409 STALE_VERSION and never a 500.
* "Insert field" is a native select plus an Insert button (keyboard-safe; a closed native select fires change on arrow keys in
  some browsers). It inserts at the remembered cursor of the subject or the message, then puts focus back there.
* Preview values are React text nodes. A field the message cannot use is marked "[not a field: {{ x }}]"; a value the record
  lacks is marked "[missing: label]" and listed.
* The body limit (10,000 characters) and all starter wording are Sample.

## Not built (PF-19c part 2)
Drafts, French, must-keep, "Send me a test", history, restore, reset, compare, where-used, the platform starter rows,
clients and cases as record types.

## How to run
`zsh studio/tools/isolated.sh pf19s 4461 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf19s_templates_browser.ts 4461 xr_studio_pf19s` (from prototype/).
