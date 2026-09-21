-- Ontbrekende schakel tussen import en de KVK/ICP-modules: houdt per
-- geïmporteerd bedrijf bij hoever de end-to-end verwerking is gevorderd,
-- zodat een losstaande batchactie (met voortgang, retries en hervatting)
-- alle rijen kan afhandelen zonder er twee keer aan te beginnen.
create table if not exists public.company_processing (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references public.import_rows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'review_required', 'failed')),
  error_message text,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_row_id)
);

alter table public.company_processing enable row level security;

create policy "Gebruikers zien alleen hun eigen verwerkingsstatus"
  on public.company_processing for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen hun eigen verwerkingsstatus aan"
  on public.company_processing for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen hun eigen verwerkingsstatus bij"
  on public.company_processing for update
  using (auth.uid() = user_id);

create trigger set_company_processing_updated_at
  before update on public.company_processing
  for each row execute procedure public.set_updated_at();

-- Voor het snel claimen van de volgende batch (status + user) en het
-- herkennen van vastgelopen 'processing'-rijen (via updated_at).
create index if not exists company_processing_user_status_idx
  on public.company_processing (user_id, status, updated_at);
