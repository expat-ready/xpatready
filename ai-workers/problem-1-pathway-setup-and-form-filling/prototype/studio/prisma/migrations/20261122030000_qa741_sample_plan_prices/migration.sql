-- QA-741 (R1.89; the tech lead's ruling on #2912): the public pricing page reads a plan's price from the plan table
-- (monthly_price_cents, yearly_price_cents, currency) on a server with no Stripe key. PF-3 seeded the three Sample
-- plans with no price, so no price could show. Data only: no table, column, constraint or policy changes.
-- These prices are SAMPLE (AGENTS rule 4): placeholders for the demo, not the founder's prices and not charged to
-- anyone (a charge only ever uses a Stripe price id). The plan names already read "(Sample)" and the pricing page says
-- "Plan names and prices are Sample". Only a seeded plan that still has no price is touched.
UPDATE "platform_plan" p
SET "monthly_price_cents" = v.monthly, "yearly_price_cents" = v.yearly
FROM (VALUES ('solo', 4900, 49000), ('team', 9900, 99000), ('firm', 19900, 199000)) AS v(code, monthly, yearly)   -- Sample, CAD cents
WHERE p."code" = v.code AND p."monthly_price_cents" IS NULL AND p."yearly_price_cents" IS NULL;
