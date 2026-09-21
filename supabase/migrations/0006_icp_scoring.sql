-- Eén ideaal-klantprofiel (ICP) per gebruiker, in vrije tekst.
create table if not exists public.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.icp_profiles enable row level security;

create policy "Gebruikers zien alleen hun eigen ICP-profiel"
  on public.icp_profiles for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen hun eigen ICP-profiel aan"
  on public.icp_profiles for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen hun eigen ICP-profiel bij"
  on public.icp_profiles for update
  using (auth.uid() = user_id);

create trigger set_icp_profiles_updated_at
  before update on public.icp_profiles
  for each row execute procedure public.set_updated_at();

-- ICP-fit-score per geïmporteerd bedrijf, los van import_rows en
-- kvk_enrichments. Bij een mislukte AI-call blijft het bedrijfsrecord
-- gewoon bestaan; alleen deze rij krijgt status 'ai_processing_failed'
-- (geen automatische retries).
create table if not exists public.icp_scores (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references public.import_rows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('scored', 'ai_processing_failed')),
  score integer check (score is null or (score between 0 and 100)),
  classification text check (classification is null or classification in ('high_fit', 'medium_fit', 'low_fit')),
  reasons jsonb not null default '[]'::jsonb,
  concerns jsonb not null default '[]'::jsonb,
  confidence numeric check (confidence is null or (confidence between 0 and 1)),
  error_message text,
  scored_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_row_id)
);

alter table public.icp_scores enable row level security;

create policy "Gebruikers zien alleen hun eigen ICP-scores"
  on public.icp_scores for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen hun eigen ICP-scores aan"
  on public.icp_scores for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen hun eigen ICP-scores bij"
  on public.icp_scores for update
  using (auth.uid() = user_id);

create trigger set_icp_scores_updated_at
  before update on public.icp_scores
  for each row execute procedure public.set_updated_at();
