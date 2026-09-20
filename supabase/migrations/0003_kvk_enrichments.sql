-- Verrijkingsgegevens van de KVK, los van de originele import_rows-rij.
-- Eén rij per geïmporteerd bedrijf (unique op import_row_id); een
-- her-controle werkt via upsert en overschrijft alleen deze tabel, nooit
-- de originele uploadgegevens in import_rows.
create table if not exists public.kvk_enrichments (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references public.import_rows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kvk_nummer text not null,
  officiele_naam text not null,
  handelsnamen jsonb not null default '[]'::jsonb,
  rechtsvorm text,
  status text not null check (status in ('actief', 'inactief')),
  sbi_codes jsonb not null default '[]'::jsonb,
  sbi_omschrijvingen jsonb not null default '[]'::jsonb,
  aantal_werkzame_personen integer,
  vestigingsplaats text,
  website text,
  -- Wanneer deze gegevens voor het laatst bij de KVK zijn opgehaald.
  opgehaald_op timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_row_id)
);

alter table public.kvk_enrichments enable row level security;

create policy "Gebruikers zien alleen eigen KVK-verrijkingen"
  on public.kvk_enrichments for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen eigen KVK-verrijkingen aan"
  on public.kvk_enrichments for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen eigen KVK-verrijkingen bij"
  on public.kvk_enrichments for update
  using (auth.uid() = user_id);

create trigger set_kvk_enrichments_updated_at
  before update on public.kvk_enrichments
  for each row execute procedure public.set_updated_at();
