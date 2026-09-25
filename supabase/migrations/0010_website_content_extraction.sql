-- Vervangt de ruwe, ongestructureerde tekstopslag door de resultaten van
-- de nieuwe, uitgebreide content-extractie: per pagina het opgeschoonde
-- (opgeschoond = navigatie/footer/cookies/privacy/team-secties/PII eruit)
-- tekstresultaat + metadata, plus de gededupliceerde, gecombineerde tekst
-- die daadwerkelijk als AI-invoer gebruikt gaat worden.
--
-- Deze tabel is minder dan een dag geleden aangemaakt (migratie 0009) en
-- bevat geen productiedata — vervangen in plaats van naast elkaar laten
-- bestaan voorkomt dubbele/verwarrende kolommen.
alter table public.website_enrichments
  drop column if exists raw_extracted_text,
  drop column if exists extracted_page_urls;

alter table public.website_enrichments
  add column if not exists cleaned_text_per_page jsonb not null default '[]'::jsonb,
  add column if not exists combined_cleaned_text text;
