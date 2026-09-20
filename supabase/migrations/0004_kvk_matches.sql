-- Matchresultaten voor bedrijven zonder aangeleverd kvk_nummer: het
-- resultaat van het scoringsmechanisme, los van (en nooit in plaats
-- van) de originele import_rows-rij en los van kvk_enrichments (dat
-- alleen bevestigde/definitieve gegevens bevat).
create table if not exists public.kvk_matches (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references public.import_rows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('high_confidence', 'review_required', 'no_reliable_match')),
  -- Beste kandidaat, ook bij een lage score. NULL alleen als de zoekopdracht
  -- helemaal niets opleverde. Status/confidence bepalen of dit ooit als
  -- definitief mag gelden — de applicatie mag dit nooit automatisch als
  -- bevestigd kvk_nummer behandelen bij status <> 'high_confidence'.
  chosen_kvk_nummer text,
  confidence integer check (confidence is null or (confidence between 0 and 100)),
  -- Alle beoordeelde kandidaten (incl. de gekozen), aflopend gesorteerd op score.
  candidates jsonb not null default '[]'::jsonb,
  gecontroleerd_op timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_row_id)
);

alter table public.kvk_matches enable row level security;

create policy "Gebruikers zien alleen eigen KVK-matches"
  on public.kvk_matches for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen eigen KVK-matches aan"
  on public.kvk_matches for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen eigen KVK-matches bij"
  on public.kvk_matches for update
  using (auth.uid() = user_id);

create trigger set_kvk_matches_updated_at
  before update on public.kvk_matches
  for each row execute procedure public.set_updated_at();
