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

## Écoute vocale : comment la vérifier

Le moteur d'écoute ne laisse plus Android ni Chrome décider que la personne a
fini de parler — c'est la cause commune des phrases coupées en pleine
respiration, des phrases longues tronquées et du micro à réappuyer entre deux
répliques. La décision est prise par `src/lib/dialogueTour.ts`, à partir d'un
silence mesuré par l'app et réglable dans Paramètres → Rythme de la
discussion.

Deux vérifications, à relancer après toute retouche du micro — c'est la
méthode canonique du projet, à préférer à un essai à l'oreille :

- `node --experimental-strip-types scripts/verifier-dialogue.ts` — la logique
  de décision seule (pauses, phrases longues, silence, garde-fous). Instantané,
  aucune dépendance.
- `node scripts/verifier-ecoute-web.mjs` — le moteur complet dans un vrai
  navigateur, avec un faux moteur de reconnaissance piloté au millième de
  seconde (démarre Vite et le banc d'essai `scripts/harness/` tout seul).
  Demande Playwright.

Ni l'une ni l'autre ne couvre le plugin Android : ça, il faut un appareil.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (vérifie aussi les types TypeScript)
- `npm run lint` — lint (oxlint)
