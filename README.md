# Outbound List AI

Nederlandse B2B SaaS: upload een bedrijvenlijst (CSV/XLSX), verrijk en
controleer via de KVK API, en laat AI bepalen hoe goed bedrijven passen
bij je ideale klantprofiel.

Dit is de **technische basis**: projectstructuur, database, authenticatie
en beveiligde routes. CSV-verwerking, KVK-integratie en AI-classificatie
volgen in een latere stap.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage)
- Vitest voor unit tests

## Projectstructuur

```
src/
  app/
    login/           Loginpagina + server actions (sign in/up/out)
    dashboard/        Beveiligde pagina (redirect naar /login zonder sessie)
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
    types/
      database.types.ts Handmatig Database-type (sync met migraties)
    env.ts               Typed environment variabelen met duidelijke errors
    routes.ts            isProtectedPath() + unit test
middleware.ts             Root middleware, roept lib/supabase/middleware.ts aan
supabase/migrations/       SQL-migraties (profiles-tabel + RLS)
```

## Setup

1. Maak een Supabase-project aan op [supabase.com](https://supabase.com).
2. Voer de migratie in `supabase/migrations/0001_profiles.sql` uit
   (via de SQL-editor in Supabase, of `supabase db push` met de CLI).
3. Kopieer `.env.example` naar `.env.local` en vul de Supabase-waarden
   in (Project Settings > API). `ANTHROPIC_API_KEY` en `KVK_API_KEY`
   zijn nog niet nodig voor deze basis.
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
lezen/bijwerken. Dit is de enige tabel in deze basis; bedrijven-,
KVK- en AI-gerelateerde tabellen volgen later.
