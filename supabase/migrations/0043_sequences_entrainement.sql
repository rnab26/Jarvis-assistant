-- Mode entraînement : « je te montre, tu reproduis » (chantier 86df4f4a).
--
-- Décision de Raphaël, 5 sept. 2026 (fiche « Jarvis, pièce par pièce ») :
-- « il faudrait avoir un mode entraînement pour qu'il puisse faire et
-- reproduire différentes tâches quotidiennes que j'effectue ». Décision
-- d'architecture posée en direct le 7 sept. 2026 : Jarvis pilote SON PROPRE
-- TÉLÉPHONE via le service d'accessibilité déjà livré (chantier 3f3ad20b),
-- jamais un navigateur côté serveur avec des identifiants de site stockés.
-- Cette table ne porte donc AUCUN mot de passe ni identifiant de site — une
-- séquence n'est qu'une liste ordonnée de commandes d'écran (clic, lecture,
-- défilement), exactement ce que `controleEcran.ts` sait déjà exécuter.
--
-- REJOUER N'EST PAS ENCORE GÉNÉRALISÉ : une séquence rejoue EXACTEMENT les
-- mêmes clics. `reussites`/`echecs` existent pour qu'on sache, avec le temps,
-- si une séquence reste fiable (une application qui change son interface la
-- casse) sans qu'il ait à le découvrir en la relançant à l'aveugle.

create table if not exists public.sequences_entrainement (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null,
  -- [{ "commande": "clic" | "defiler_bas" | "defiler_haut" | "retour" | "accueil" | "lire", "cible": string | null }, ...]
  etapes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  dernier_essai_at timestamptz,
  -- 'reussi' | 'echec', null tant que jamais rejouée.
  dernier_resultat text,
  reussites integer not null default 0,
  echecs integer not null default 0
);

create index if not exists sequences_entrainement_user_idx
  on public.sequences_entrainement (user_id, created_at desc);

alter table public.sequences_entrainement enable row level security;

create policy "sequences_entrainement_select_own" on public.sequences_entrainement
  for select using ((select auth.uid()) = user_id);
create policy "sequences_entrainement_insert_own" on public.sequences_entrainement
  for insert with check ((select auth.uid()) = user_id);
create policy "sequences_entrainement_update_own" on public.sequences_entrainement
  for update using ((select auth.uid()) = user_id);
create policy "sequences_entrainement_delete_own" on public.sequences_entrainement
  for delete using ((select auth.uid()) = user_id);
