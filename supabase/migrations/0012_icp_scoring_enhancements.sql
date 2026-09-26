-- ICP-scoring loskoppelen van één specifieke bron: een score is nu
-- mogelijk zodra er, uit welke combinatie van bronnen dan ook (upload,
-- eventueel KVK, website intelligence), genoeg bruikbare informatie is.
-- Voegt transparantie toe over hoe compleet die informatie was en welke
-- bronnen zijn gebruikt, en een nieuwe classificatie voor het geval er
-- écht te weinig informatie is om verantwoord te oordelen.
alter table public.icp_scores
  drop constraint if exists icp_scores_classification_check;

alter table public.icp_scores
  add constraint icp_scores_classification_check
  check (classification is null or classification in ('high_fit', 'medium_fit', 'low_fit', 'insufficient_data'));

alter table public.icp_scores
  add column if not exists data_completeness numeric
    check (data_completeness is null or (data_completeness between 0 and 1)),
  add column if not exists missing_important_data jsonb not null default '[]'::jsonb,
  add column if not exists key_sales_signals jsonb not null default '[]'::jsonb,
  add column if not exists data_sources jsonb not null default '[]'::jsonb;
