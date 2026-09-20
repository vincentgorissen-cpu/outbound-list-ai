# Outbound List AI

Nederlandse B2B SaaS: upload een bedrijvenlijst (CSV/XLSX), verrijk en
controleer via de KVK API, en laat AI bepalen hoe goed bedrijven passen
bij je ideale klantprofiel.

Naast de technische basis (auth, database, beveiligde routes) bevat dit
project nu ook de **importmodule**: CSV/XLSX uploaden, kolommen
automatisch herkennen, en na controle door de gebruiker importeren.
KVK-verrijking en AI-fit scoring volgen in een latere stap.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage)
- Anthropic API (alleen als fallback bij kolomherkenning)
- Vitest voor unit tests

## Projectstructuur

```
src/
  app/
    login/           Loginpagina + server actions (sign in/up/out)
    dashboard/
      import/          Importmodule: upload, mapping-UI, server actions
      layout.tsx         Beveiligde layout (redirect naar /login zonder sessie)
      page.tsx            Dashboard-startpagina
    layout.tsx         Root layout
    page.tsx            Redirect naar /dashboard of /login
  components/
    ui/                Kale UI-primitieven (Button, Input, Label)
    layout/            Layout-onderdelen (DashboardNav)
  lib/
    supabase/
      client.ts        Supabase-client voor Client Components
      server.ts        Supabase-client voor Server Components/Actions
      middleware.ts     Sessie verversen + route-bescherming
    import/
      targetFields.ts    De 9 te herkennen velden + hun synoniemen
      normalizeHeader.ts  Normaliseert kolomkoppen voor matching
      matchColumns.ts     Deterministische (exacte) kolomherkenning
      aiColumnMatcher.ts  AI-fallback voor niet-herkende kolommen
      buildMappingSuggestions.ts  Combineert beide tot één suggestielijst
      parseFile.ts        CSV/XLSX inlezen (papaparse / exceljs)
      normalizeRecord.ts  Past bevestigde mapping toe op ruwe rijen
    types/
      database.types.ts Handmatig Database-type (sync met migraties)
    env.ts               Typed environment variabelen met duidelijke errors
    routes.ts            isProtectedPath() + unit test
middleware.ts             Root middleware, roept lib/supabase/middleware.ts aan
supabase/migrations/       SQL-migraties (profiles, imports, import_rows, storage)
```

## Setup

1. Maak een Supabase-project aan op [supabase.com](https://supabase.com).
2. Voer de migraties in `supabase/migrations/` uit, in volgorde
   (via de SQL-editor in Supabase, of `supabase db push` met de CLI).
   `0002_imports.sql` maakt ook de private Storage-bucket `imports` aan.
3. Kopieer `.env.example` naar `.env.local` en vul de Supabase-waarden
   in (Project Settings > API). Vul `ANTHROPIC_API_KEY` in als je wilt
   dat niet-herkende kolommen door AI gesuggereerd worden — zonder key
   blijven die kolommen gewoon leeg staan voor handmatige koppeling.
   `KVK_API_KEY` is nog niet nodig.
4. Installeer dependencies en start de dev-server:

   ```bash
   npm install
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). Zonder sessie
   kom je op `/login` terecht; na inloggen op `/dashboard`.

## Scripts

```bash
npm run dev         # development server
npm run build        # productie build
npm run lint          # ESLint
npm run typecheck      # tsc --noEmit
npm run test             # Vitest
```

## Authenticatie & beveiligde routes

- `middleware.ts` ververst de Supabase-sessie op elk request en stuurt
  niet-ingelogde gebruikers vanaf `/dashboard` naar `/login`.
- `src/app/dashboard/layout.tsx` controleert de sessie nogmaals
  server-side (defense in depth).
- Welke paden beveiligd zijn staat in `src/lib/routes.ts`
  (`isProtectedPath`), met unit tests in `src/lib/__tests__`.

## Database

`supabase/migrations/0001_profiles.sql` maakt een `profiles`-tabel aan
die via een trigger automatisch gevuld wordt bij registratie, met
row-level security zodat gebruikers alleen hun eigen profiel kunnen
lezen/bijwerken.

`supabase/migrations/0002_imports.sql` voegt toe:
- de Storage-bucket `imports` voor de originele CSV/XLSX-bestanden;
- tabel `imports`: metadata, headers en preview per upload;
- tabel `import_rows`: de genormaliseerde bedrijfsrecords, pas
  aangemaakt nadat de gebruiker de mapping heeft bevestigd.

Alles is met RLS afgeschermd op `user_id`, zodat gebruikers alleen hun
eigen imports en bestanden kunnen zien.

## Importmodule

Flow van upload tot import (`src/app/dashboard/import`):

1. **Upload** — gebruiker kiest een CSV of XLSX. Het bestand wordt
   direct opgeslagen in Supabase Storage (het origineel blijft altijd
   bewaard) en server-side geparsed.
2. **Kolomherkenning** — voor elke kolom wordt eerst geprobeerd de kop
   *deterministisch* te matchen tegen een lijst bekende synoniemen per
   veld (`lib/import/matchColumns.ts`). Alleen kolommen die zo niet
   betrouwbaar herkend worden, en alleen voor velden die nog open staan,
   worden aan de Anthropic API voorgelegd (`lib/import/aiColumnMatcher.ts`).
   Zonder `ANTHROPIC_API_KEY`, of als de aanroep faalt, blijft de kolom
   gewoon ongemapt — er wordt nooit geraden.
3. **Preview + correctie** — de gebruiker ziet een voorbeeld van
   maximaal 20 rijen met de voorgestelde koppeling per kolom (met een
   badge: automatisch herkend / AI-suggestie / niet herkend) en kan elke
   koppeling wijzigen voordat er iets definitiefs gebeurt.
4. **Bevestigen** — pas na bevestiging wordt het bestand opnieuw
   ingelezen, de mapping toegepast, en worden de genormaliseerde
   records in `import_rows` geschreven. Het originele bestand (Storage)
   en de genormaliseerde records (database) staan dus los van elkaar.

De herkenningslogica (matching, parsing, normalisatie) is puur en
volledig unit-getest, inclusief een gemockte AI-client zodat de tests
geen netwerkverbinding nodig hebben.
