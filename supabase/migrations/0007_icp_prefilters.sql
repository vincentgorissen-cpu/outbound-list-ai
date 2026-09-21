-- Deterministische voorfilters vóór AI ICP-scoring: voorkomt onnodige
-- Anthropic-aanroepen door bedrijven die overduidelijk niet passen
-- (op basis van status, rechtsvorm, SBI-code, aantal medewerkers of
-- provincie/regio) al uit te sluiten vóórdat er AI aan te pas komt.

-- Eén JSON-configuratie per gebruiker, naast het bestaande vrije-tekst
-- klantprofiel. Een lege/ontbrekende configuratie sluit niets uit
-- (veilige standaardwaarde, bestaand gedrag blijft ongewijzigd).
alter table public.icp_profiles
  add column if not exists prefilter_config jsonb;

-- Elk bedrijf krijgt nu ook vastgelegd of het door de voorfilters is
-- uitgesloten (en waarom), los van of de AI-aanroep zelf is gelukt.
alter table public.icp_scores
  add column if not exists prefilter_status text not null default 'passed'
    check (prefilter_status in ('passed', 'excluded')),
  add column if not exists prefilter_reason text;

alter table public.icp_scores
  drop constraint if exists icp_scores_status_check;

alter table public.icp_scores
  add constraint icp_scores_status_check
  check (status in ('scored', 'ai_processing_failed', 'excluded_by_prefilter'));
