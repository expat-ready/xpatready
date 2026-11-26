// CS-W1 part 2 (R1.3): every case now needs its platform firm (runtime_case.firm_id NOT NULL, filled from firm_key even
// under session_replication_role = replica). A scratch database built from the migrations has no platform_firm rows, so
// a suite that writes a case there adds the two Sample firms first with this SQL (idempotent: a firm already there, by
// key or address, is left as it is). The ids are fixed so a suite may refer to them; PF-3's seed makes its own on a copy.
export const SAMPLE_FIRM_ID = { "sample-firm": "5a3b1e00-0000-4000-8000-000000000001", "sample-solo": "5a3b1e00-0000-4000-8000-000000000002" } as const;

export const SAMPLE_FIRMS_SQL = `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values
  ('${SAMPLE_FIRM_ID["sample-firm"]}', 'sample-firm', 'Sample Firm', 'CA', 'office@sample-firm.example.com', now()),
  ('${SAMPLE_FIRM_ID["sample-solo"]}', 'sample-solo', 'Sample Solo', 'CA', 'office@sample-solo.example.com', now())
  on conflict do nothing;`;

// A suite that writes cases under its own made-up firm keys gives each key a platform firm too (same idempotent shape).
export const firmsSql = (...keys: string[]) => `insert into platform_firm (id, key, operating_name, country_code, contact_email, updated_at) values
  ${keys.map((k) => `(gen_random_uuid(), '${k}', '${k}', 'CA', 'office@${k}.example.com', now())`).join(",\n  ")}
  on conflict do nothing;`;

// CS-W1 part 2's migration folder starts with this; a suite seeding old-shape rows adds the firms just before it.
export const CSW1_PART2 = "20261126160000";
