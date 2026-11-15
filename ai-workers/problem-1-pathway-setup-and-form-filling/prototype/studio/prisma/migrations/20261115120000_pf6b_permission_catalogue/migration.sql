-- PF-6b (P-600, P-601 (1); BACKLOG row PF-6b rows rev 16.10 as narrowed by Lead B's brief, rulings 1-3; SA-6-24, SA-6-27,
-- SA-06 v3.15 §10b; schema file prisma/schema/platform-permissions.prisma, owner Lead B (platform)). One new table, the
-- permission-key catalogue; no existing table, column or row changes, and no foreign key to platform_role_permission.
--   * one row for every distinct key in platform_role_permission when this runs (PF-3's 231 and PF-21's 2): a later row
--     that seeds a new key adds its catalogue row in its own migration (tests/check_pf6b_permission_rules.ts DW1).
--   * scope: OWN for `…:view.own`, ALL for `…:view.all`, otherwise NONE; the database refuses any other pairing.
--   * class: LICENCE for the three sign-off keys (keys.ts DUTY_KEYS.represent); MONEY for the invoice, payment, refund,
--     payment-rail, billing, billing-config, billing-report and trust areas, and for agent/expense:create (SA-06 v3.15
--     §10b, "Money keys, no new key … Bill this and Add cost make a draft with agent/invoice:create and
--     agent/expense:create"); otherwise GENERAL.
-- Rollback: DROP TABLE "platform_permission_key"; DROP TYPE "PlatformPermissionClass", "PlatformPermissionScope".

CREATE TYPE "PlatformPermissionScope" AS ENUM ('OWN', 'ALL', 'NONE');
CREATE TYPE "PlatformPermissionClass" AS ENUM ('GENERAL', 'MONEY', 'LICENCE');

CREATE TABLE "platform_permission_key" (
    "key" TEXT NOT NULL,
    "scope" "PlatformPermissionScope" NOT NULL,
    "class" "PlatformPermissionClass" NOT NULL,
    CONSTRAINT "platform_permission_key_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "platform_permission_key_shape" CHECK ("key" ~ '^agent/[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$'),
    CONSTRAINT "platform_permission_key_scope" CHECK ("scope" = CASE WHEN "key" LIKE '%:view.own' THEN 'OWN'::"PlatformPermissionScope"
      WHEN "key" LIKE '%:view.all' THEN 'ALL'::"PlatformPermissionScope" ELSE 'NONE'::"PlatformPermissionScope" END)
);

INSERT INTO "platform_permission_key" ("key", "scope", "class")
SELECT k,
  CASE WHEN k LIKE '%:view.own' THEN 'OWN' WHEN k LIKE '%:view.all' THEN 'ALL' ELSE 'NONE' END::"PlatformPermissionScope",
  CASE WHEN k IN ('agent/case:form-approve', 'agent/case:review-approve', 'agent/retainer:countersign') THEN 'LICENCE'
       WHEN split_part(split_part(k, '/', 2), ':', 1) IN ('invoice', 'payment', 'refund', 'payment-rail', 'billing', 'billing-config', 'billing-report', 'trust')
         OR k = 'agent/expense:create' THEN 'MONEY'
       ELSE 'GENERAL' END::"PlatformPermissionClass"
FROM (SELECT DISTINCT "permission_key" AS k FROM "platform_role_permission") keys;
