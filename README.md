# Jarvis — Phase 1

Dashboard PWA (React + Vite + Tailwind + shadcn/ui) avec authentification
Supabase et gestion de tâches par catégorie. Phase 1 uniquement : pas de
voix, pas d'app mobile, pas d'agents (voir le prompt projet pour les phases
suivantes).

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
`supabase/migrations/0001_init.sql`. Il a déjà été appliqué au projet
Supabase distant.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (vérifie aussi les types TypeScript)
- `npm run lint` — lint (oxlint)
