-- Menselijke beslissing op een match, apart van de automatische status.
-- Zolang resolution NULL is, staat de match nog open voor review; het
-- review-scherm toont daarom alleen rijen met resolution IS NULL.
alter table public.kvk_matches
  add column if not exists resolution text check (resolution in ('confirmed', 'rejected')),
  add column if not exists resolved_kvk_nummer text,
  add column if not exists resolved_at timestamptz;
