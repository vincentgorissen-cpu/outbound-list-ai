-- AI-extractiestap voor website intelligence: zet de al opgeschoonde
-- paginatekst (cleaned_text_per_page) om naar de semantische velden die
-- migratie 0009 al voorzag (company_description/products_services/etc.),
-- plus een eigen status/betrouwbaarheid/bewijs voor de extractie zelf —
-- los van source_confidence, dat de betrouwbaarheid van de fetch-stap
-- uitdrukt (aantal geslaagde pagina's), niet van de AI-extractie.
alter table public.website_enrichments
  add column if not exists extraction_status text not null default 'not_attempted'
    check (extraction_status in ('not_attempted', 'extracted', 'extraction_failed')),
  add column if not exists extraction_confidence numeric
    check (extraction_confidence is null or (extraction_confidence between 0 and 1)),
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists extracted_at timestamptz;
