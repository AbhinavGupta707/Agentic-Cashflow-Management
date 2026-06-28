export const CASE_STATE_SCHEMA_ASSUMPTIONS = [
  "companies.external_id is the stable demo company identifier",
  "customers.external_id and contacts.external_id are stable seed identifiers",
  "invoices, obligations, forecast_runs, action_plans, actions, and memory_chunks are tenant-scoped through company_id",
  "forecast_runs.case_id and action_plans.case_id identify the current demo case",
  "money is stored as integer cents with ISO currency columns where applicable",
  "memory_chunks stores fact_text plus an optional vector(1024) embedding",
] as const;

export const DEFAULT_DEMO_COMPANY_ID = "cmp_marlow_finch";
export const DEFAULT_DEMO_CASE_ID = "case_payroll_2026_05_08";
