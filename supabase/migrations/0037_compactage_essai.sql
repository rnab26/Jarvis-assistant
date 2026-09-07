-- Le compactage (migration 0036) doit pouvoir être vérifié pour de vrai, sans
-- jamais puiser dans le quota du jour de Raphaël.
--
-- Même motif que `appels_modele` (migration 0025) : nos vérifications tournent
-- avec l'en-tête x-jarvis-essai, qui fait utiliser la clé du second projet
-- Google AI Studio. `signaler_erreur`/`appelerModele` savent déjà distinguer
-- un appel de test — il manquait la colonne pour que `compactages_memoire`
-- fasse pareil, plutôt que de traiter un essai comme une vraie passe muette.
--
-- CE QUE ÇA NE CHANGE PAS : un essai ne consomme jamais le seau de Raphaël
-- (`appelerModele` route déjà vers la clé de test dès que `essai` est vrai).
-- Ce que ça ajoute : le compactage peut désormais tourner PENDANT un essai
-- (au lieu d'être sauté comme `reveillerLaVeille`), parce que RLS l'isole déjà
-- sur l'utilisateur de test — il ne peut trouver que SES propres vieux
-- échanges, jamais ceux de Raphaël.

alter table public.compactages_memoire
  add column if not exists essai boolean not null default false;

comment on column public.compactages_memoire.essai is
  'Vrai quand la passe vient de nos vérifications (x-jarvis-essai), pas d''une vraie phrase de Raphaël. Comme appels_modele.essai : à exclure de toute lecture qui répond « la dernière VRAIE passe ».';

create or replace function public.enregistrer_compactage(p_verdict text, p_nb int, p_detail text, p_essai boolean default false)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.compactages_memoire (verdict, nb_compactes, detail, essai)
  values (p_verdict, coalesce(p_nb, 0), p_detail, coalesce(p_essai, false))
  returning id;
$$;

-- « La dernière fois que ça a VRAIMENT tourné » doit ignorer les essais, sinon
-- une session qui vérifie le compactage masque un vrai silence de plusieurs
-- jours derrière ses propres passes de test.
create or replace function public.dernier_compactage()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select max(demarre_at) from public.compactages_memoire where essai = false;
$$;
