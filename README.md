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
qui interprète la commande via l'API Gemini (offre gratuite, décision de
Raphaël du 3 sept. 2026 — Jarvis tournait sur Claude, facturé au jeton) et
renvoie une action structurée (le client l'exécute ensuite via Supabase, RLS
compris — la fonction n'écrit jamais directement en base). Tout ce qui est
propre à Gemini tient dans `supabase/functions/_shared/gemini.ts`.

Secret requis côté Supabase : `GEMINI_API_KEY` (clé créée sur
https://aistudio.google.com/apikey). Jamais dans le code ni dans `.env` :
on la dépose dans les variables d'environnement de l'environnement Claude
Code, puis `scripts/pousser-secret.sh GEMINI_API_KEY` l'envoie à Supabase
sans qu'elle transite nulle part ailleurs.

## Compte Google : agenda et mails

`google-oauth` branche le compte Google de l'utilisateur, `google-calendar`
lit et écrit ses événements. La configuration côté Google Cloud est un geste
de PROPRIÉTAIRE, fait une seule fois pour toute l'application : les
utilisateurs n'ouvrent jamais de console, ils appuient sur « Connecter mon
compte Google » dans Paramètres.

Secrets requis côté Supabase : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`,
pris sur le client OAuth « Application Web » du projet Google Cloud. Sans
eux, la fonction répond explicitement qu'elle n'est pas configurée — elle
n'échoue pas en silence.

L'URI de redirection déclaré chez Google doit être **exactement** :

```
https://bexiyvmdbxcwxasgslxp.supabase.co/functions/v1/google-oauth/callback
```

Deux pièges déjà payés, à ne pas repayer :

- **L'application doit être publiée en production chez Google**, sans
  demander de vérification (l'exemption « usage personnel » l'autorise). En
  statut « Test », Google fait expirer le jeton de rafraîchissement au bout
  de 7 jours et Jarvis se déconnecterait chaque semaine.
- **`google-oauth` est déployée avec `verify_jwt: false`**, parce que Google
  appelle son `/callback` sans jeton Supabase. Elle vérifie donc elle-même
  l'identité sur `/start` et `/disconnect`, et le `state` à usage unique
  protège le retour. Ne pas la redéployer avec `verify_jwt: true` : le
  callback tomberait en 401 et la connexion échouerait sans message clair.

Les jetons Google vivent dans `google_tokens`, une table **sans aucune
policy RLS** : seule la clé service_role, côté Edge Function, y accède.
L'interface lit `google_accounts`, qui ne contient que l'adresse du compte
et les autorisations accordées (migration `0013_google_oauth.sql`).

## Commandes vocales : comment les vérifier

Les Edge Functions **ne se déploient pas au push** — il faut les redéployer
explicitement — `scripts/deployer-fonction.sh voice-command`. Et un
typecheck ne dit rien de ce qui compte vraiment ici : est-ce que le modèle
suit encore la consigne.

```
ANON_KEY=... node scripts/verifier-commande-vocale.mjs
```

Interroge la fonction réellement déployée avec un utilisateur de test
éphémère (créé puis supprimé) et des données fictives : plusieurs demandes
dans une phrase, reprise d'une tâche déjà faite, corrections de
prononciation, compatibilité avec l'app Android pas encore mise à jour. À
relancer après chaque déploiement de la fonction.

## Écoute vocale : comment la vérifier

Le moteur d'écoute ne laisse plus Android ni Chrome décider que la personne a
fini de parler — c'est la cause commune des phrases coupées en pleine
respiration, des phrases longues tronquées et du micro à réappuyer entre deux
répliques. La décision est prise par `src/lib/dialogueTour.ts`, à partir d'un
silence mesuré par l'app et réglable dans Paramètres → Rythme de la
discussion.

Trois vérifications, à relancer après toute retouche du micro — c'est la
méthode canonique du projet, à préférer à un essai à l'oreille :

- `node --experimental-strip-types scripts/verifier-dialogue.ts` — la logique
  de décision seule (pauses, phrases longues, silence, garde-fous). Instantané,
  aucune dépendance.
- `node --experimental-strip-types scripts/verifier-mot-cle.ts` — la
  reconnaissance du réveil « Jarvis » : les transcriptions fautives qui doivent
  quand même réveiller, et les phrases ordinaires qui ne doivent surtout pas
  déclencher. Instantané.
- `node scripts/verifier-ecoute-web.mjs` — le moteur complet dans un vrai
  navigateur, avec un faux moteur de reconnaissance piloté au millième de
  seconde (démarre Vite et le banc d'essai `scripts/harness/` tout seul).
  Demande Playwright.

Aucune ne couvre le plugin Android : ça, il faut un appareil.

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (vérifie aussi les types TypeScript)
- `npm run lint` — lint (oxlint)
