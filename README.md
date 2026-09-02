# Jarvis

Dashboard PWA (React + Vite + Tailwind + shadcn/ui) avec authentification
Supabase, gestion de tâches par catégorie (Phase 1) et commandes vocales via
l'API Claude (Phase 2). Pas d'app mobile/widget ni d'agents distants pour
l'instant (voir le prompt projet pour les phases suivantes).

## Lancer le projet en local

```bash
npm install
cp .env.example .env.local   # puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Les valeurs viennent du dashboard Supabase du projet (Project Settings →
API). Le projet Supabase dédié à Jarvis a été créé dans l'organisation
`rnab26's Org` (nom du projet : `jarvis-assistant`).

## Base de données

Le schéma (tables `categories` / `tasks`, RLS par utilisateur) est dans
`supabase/migrations/`. Les migrations ont déjà été appliquées au projet
Supabase distant.

## Commandes vocales (Phase 2)

Le bouton micro appelle la Edge Function `supabase/functions/voice-command`,
qui interprète la commande via l'API Claude et renvoie une action
structurée (le client l'exécute ensuite via Supabase, RLS compris — la
fonction n'écrit jamais directement en base).

Secret requis côté Supabase (Dashboard → Edge Functions → Secrets, ou
Project Settings → Edge Functions) : `ANTHROPIC_API_KEY` (clé obtenue sur
console.anthropic.com). Jamais dans le code ni dans `.env`.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (vérifie aussi les types TypeScript)
- `npm run lint` — lint (oxlint)
