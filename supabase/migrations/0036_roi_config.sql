-- ROI / Investment configuration tunables (Module 15 Settings section).
-- A JSONB blob on the singleton organization_settings row, alongside the other
-- module configs (trending_config, feedback_config, …). Categories & projects
-- stay as their own tables (investment_categories / investment_projects, 0035)
-- because they are FK targets; only the scalar tunables live here.
alter table public.organization_settings
  add column if not exists roi_config jsonb;

comment on column public.organization_settings.roi_config is
  'ROI module tunables: { target_roi_pct, default_payback_months, trailing_window_months, auto_attribution_enabled }.';

notify pgrst, 'reload schema';
