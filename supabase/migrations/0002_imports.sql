-- Eén rij per geüploade bedrijvenlijst. Het originele bestand zelf staat
-- in Supabase Storage (bucket "imports"); hier houden we alleen metadata
-- en, tot de mapping bevestigd is, de preview bij.
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  status text not null default 'pending_mapping'
    check (status in ('pending_mapping', 'completed', 'failed')),
  headers jsonb not null,
  preview_rows jsonb not null,
  row_count integer not null default 0,
  column_mapping jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.imports enable row level security;

create policy "Gebruikers zien alleen hun eigen imports"
  on public.imports for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken imports voor zichzelf aan"
  on public.imports for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen hun eigen imports bij"
  on public.imports for update
  using (auth.uid() = user_id);

-- Eén rij per genormaliseerd bedrijf, pas aangemaakt nadat de gebruiker
-- de kolommapping heeft bevestigd. Losstaand van het originele bestand,
-- zodat een foute mapping herstelbaar is zonder opnieuw te uploaden.
create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  row_index integer not null,
  bedrijfsnaam text,
  kvk_nummer text,
  website text,
  postcode text,
  plaats text,
  contactpersoon text,
  functie text,
  telefoon text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.import_rows enable row level security;

create policy "Gebruikers zien alleen hun eigen import-rijen"
  on public.import_rows for select
  using (auth.uid() = user_id);

create policy "Gebruikers voegen alleen eigen import-rijen toe"
  on public.import_rows for insert
  with check (auth.uid() = user_id);

create index if not exists import_rows_import_id_idx
  on public.import_rows (import_id);

-- Storage-bucket voor de originele CSV/XLSX-bestanden. Privé: alleen
-- toegankelijk via ondertekende URL's of met een ingelogde sessie die
-- aan onderstaande policies voldoet.
insert into storage.buckets (id, name, public)
values ('imports', 'imports', false)
on conflict (id) do nothing;

create policy "Gebruikers lezen alleen eigen geüploade bestanden"
  on storage.objects for select
  using (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Gebruikers uploaden bestanden in hun eigen map"
  on storage.objects for insert
  with check (bucket_id = 'imports' and (storage.foldername(name))[1] = auth.uid()::text);
