-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Cost Calculator + VND currency (spec v5, Module 4 Tab 2).                 ║
-- ║                                                                            ║
-- ║  cost_calculations — each user's PERSONAL saved quotes. A lightweight      ║
-- ║  scratchpad: it never touches the heavy aggregate tables behind Tab 1,     ║
-- ║  and Tab 1 never depends on it. RLS: strictly user_id = auth.uid()         ║
-- ║  (admins included — it's a private notebook, not company data).            ║
-- ║                                                                            ║
-- ║  Currency: company currency seeded to Vietnamese đồng. VND has NO minor    ║
-- ║  unit, so money columns for VND hold whole đồng (the app's formatters      ║
-- ║  are currency-decimal aware: USD→2, VND→0). Amounts in this table are      ║
-- ║  numeric đồng as entered in the calculator.                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table public.cost_calculations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users (id) on delete cascade,
  name                  text not null default '',          -- product name ('' → "Unnamed product")
  material              text not null default 'petg',      -- key from the settings material list
  -- Inputs (as entered; empty fields are stored as 0)
  filament_cost_per_kg  numeric(14,2) not null default 0,  -- ₫/kg
  filament_used_grams   numeric(12,2) not null default 0,
  waste_percent         numeric(6,2)  not null default 10,
  print_time_hours      numeric(8,2)  not null default 0,
  electricity_rate      numeric(14,2) not null default 3500, -- ₫/kWh
  printer_watts         numeric(8,2)  not null default 150,
  labor_cost            numeric(14,2) not null default 0,  -- ₫
  selling_price         numeric(14,2) not null default 0,  -- ₫
  other_costs           numeric(14,2) not null default 0,  -- ₫
  target_margin_percent numeric(6,2)  not null default 20,
  -- Computed at save time (snapshot — re-derivable from inputs)
  filament_with_waste_g numeric(12,2) not null default 0,
  material_cost         numeric(14,2) not null default 0,
  electricity_cost      numeric(14,2) not null default 0,
  total_cost            numeric(14,2) not null default 0,
  profit                numeric(14,2) not null default 0,
  margin_percent        numeric(8,2)  not null default 0,
  roi_percent           numeric(8,2)  not null default 0,
  is_active             boolean not null default true,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now()
);
-- The only access path is "my saves, newest first":
create index idx_cost_calc_user_created on public.cost_calculations (user_id, created_at desc)
  where deleted_at is null;

grant select, insert, update on public.cost_calculations to authenticated;
alter table public.cost_calculations enable row level security;
-- Private notebook: owner-only for EVERY operation (no admin carve-out).
create policy cost_calc_own on public.cost_calculations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Company currency → Vietnamese đồng ───────────────────────────────────────
update public.organization_settings set currency = 'VND' where id = 'org';

-- Loyalty thresholds were seeded at USD magnitudes (Silver $1,000+…). With the
-- company currency now đồng, localize the SAME ladder: Silver 1.000.000₫+,
-- Gold 5M₫+, Platinum 10M₫+, Diamond 50M₫+, Black Diamond 100M₫+ (sub-tiers
-- interpolated as before; all editable in Settings → Loyalty). Stored ×100.
update public.customer_tiers as t
set lifetime_spend_threshold_cents = v.threshold
from (values
  ('bronze',                              0::bigint),
  ('silver',                    100000000::bigint),  --   1.000.000₫
  ('gold',                      500000000::bigint),  --   5.000.000₫
  ('standard_platinum',        1000000000::bigint),  --  10.000.000₫
  ('elite_platinum',           2000000000::bigint),
  ('premier_platinum',         3000000000::bigint),
  ('signature_platinum',       4000000000::bigint),
  ('standard_diamond',         5000000000::bigint),  --  50.000.000₫
  ('elite_diamond',            6500000000::bigint),
  ('premier_diamond',          8000000000::bigint),
  ('signature_diamond',        9000000000::bigint),
  ('standard_black_diamond',  10000000000::bigint),  -- 100.000.000₫
  ('elite_black_diamond',     20000000000::bigint),
  ('premier_black_diamond',   35000000000::bigint),
  ('signature_black_diamond', 50000000000::bigint)
) as v(key, threshold)
where t.key = v.key;

-- Rank-upgrade voucher amounts on the same scale (50.000₫ … 5.000.000₫).
update public.tier_benefits as b
set voucher_amount_cents = case t.group_name
  when 'Bronze'        then 0
  when 'Silver'        then 5000000      --    50.000₫
  when 'Gold'          then 25000000     --   250.000₫
  when 'Platinum'      then 50000000     --   500.000₫
  when 'Diamond'       then 150000000    -- 1.500.000₫
  else 500000000                          -- 5.000.000₫
end
from public.customer_tiers t
where t.id = b.tier_id;

-- Money convention: EVERY *_cents column stores display-value × 100 regardless
-- of currency; formatters divide by 100 and render with the currency's decimal
-- count (VND → 0). Material per-gram costs re-expressed in đồng:
-- PLA ≈ 300.000₫/kg → 300₫/g → 30000 stored. Same relative ladder as before.
update public.organization_settings set material_types = '[
  {"key":"pla","label":"PLA","color":"green","cost_per_gram_cents":30000,"is_active":true},
  {"key":"petg","label":"PETG","color":"blue","cost_per_gram_cents":35000,"is_active":true},
  {"key":"abs","label":"ABS","color":"amber","cost_per_gram_cents":35000,"is_active":true},
  {"key":"asa","label":"ASA","color":"amber","cost_per_gram_cents":45000,"is_active":true},
  {"key":"tpu","label":"TPU","color":"violet","cost_per_gram_cents":55000,"is_active":true},
  {"key":"pc","label":"PC","color":"slate","cost_per_gram_cents":65000,"is_active":true},
  {"key":"pa_nylon","label":"PA / Nylon","color":"indigo","cost_per_gram_cents":75000,"is_active":true},
  {"key":"cf_blend","label":"CF Blends","color":"red","cost_per_gram_cents":110000,"is_active":true},
  {"key":"resin","label":"Resin","color":"violet","cost_per_gram_cents":50000,"is_active":true}
]'::jsonb
where id = 'org';
