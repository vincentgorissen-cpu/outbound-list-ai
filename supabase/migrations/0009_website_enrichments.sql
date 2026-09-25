-- Website intelligence: een tweede, onafhankelijke verrijkingsbron naast
-- kvk_enrichments. Bewust een aparte tabel (niet samengevoegd met de
-- KVK-tabel) zodat altijd zichtbaar blijft welke bron welk gegeven heeft
-- geleverd, en zodat een ontbrekende/mislukte bron de andere nooit blokkeert.
--
-- Deze migratie levert de kolommen voor de volledige, met de gebruiker
-- afgestemde opzet (inclusief de semantische AI-velden als
-- company_description/products_services/etc.), ook al vult de eerste
-- bouwfase (het veilig ophalen van pagina's) alleen de fetch-gerelateerde
-- kolommen. De AI-extractie die de semantische velden vult, is een latere,
-- losse stap — geen tweede migratie nodig zodra die stap wordt gebouwd.
create table if not exists public.website_enrichments (
  id uuid primary key default gen_random_uuid(),
  import_row_id uuid not null references public.import_rows (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  website_url text,
  website_status text not null default 'pending'
    check (website_status in (
      'pending',
      'accessible',
      'no_url',
      'dns_failed',
      'timeout',
      'blocked',
      'robots_disallowed',
      'http_error',
      'insufficient_content',
      'unsupported_site',
      'failed'
    )),
  website_checked_at timestamptz,
  error_message text,

  -- Ruw materiaal van de fetch-stap: welke pagina's zijn daadwerkelijk
  -- gebruikt en de eruit gehaalde leesbare tekst, vóórdat een AI-stap dit
  -- omzet naar de semantische velden hieronder.
  extracted_page_urls jsonb not null default '[]'::jsonb,
  raw_extracted_text text,

  -- Semantische velden, in te vullen door een latere AI-extractiestap.
  company_description text,
  products_services jsonb not null default '[]'::jsonb,
  industries_served jsonb not null default '[]'::jsonb,
  target_markets jsonb not null default '[]'::jsonb,
  business_model text,
  operational_signals jsonb not null default '[]'::jsonb,
  company_locations jsonb,

  -- 0.0-1.0: hoe compleet/betrouwbaar deze verrijking zelf is (aantal
  -- geslaagde pagina's, hoeveelheid content, etc.) — los van de
  -- confidence die de ICP-scoring later zelf rapporteert.
  source_confidence numeric check (source_confidence is null or (source_confidence between 0 and 1)),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_row_id)
);

alter table public.website_enrichments enable row level security;

create policy "Gebruikers zien alleen hun eigen website-verrijking"
  on public.website_enrichments for select
  using (auth.uid() = user_id);

create policy "Gebruikers maken alleen hun eigen website-verrijking aan"
  on public.website_enrichments for insert
  with check (auth.uid() = user_id);

create policy "Gebruikers werken alleen hun eigen website-verrijking bij"
  on public.website_enrichments for update
  using (auth.uid() = user_id);

create trigger set_website_enrichments_updated_at
  before update on public.website_enrichments
  for each row execute procedure public.set_updated_at();

create index if not exists website_enrichments_user_status_idx
  on public.website_enrichments (user_id, website_status);
