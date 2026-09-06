-- Passer tout seul au meilleur modèle disponible, sans jamais rendre Jarvis muet.
--
-- Chantier 66a7a233. Ses mots, 5 sept. 2026 au soir : « s'il y a des mises à
-- jour qui sont faites pour quelque chose de plus évolué, évidemment qu'il faut
-- que nous aussi on fasse les mises à jour automatiques en interne sans que
-- forcément je puisse le demander à chaque fois manuellement. Et bien entendu
-- que tous nos préréglages, toutes nos configs, toutes nos logiques, elles ne
-- doivent pas sauter. »
--
-- SA LIMITE, POSÉE LE MÊME SOIR ET À RESPECTER : « il ne faut pas changer les
-- voix tout seul, sinon ça peut tout déglinguer d'un coup. » Ceci ne concerne
-- QUE le modèle de langue. La reconnaissance vocale du téléphone et la voix de
-- synthèse ne passent pas par ici et ne changent jamais toutes seules.
--
-- CE QUI EST RASSURANT ET QU'IL FAUT LUI REDIRE : ses réglages ne vivent PAS
-- dans le modèle. La consigne, le schéma d'outil, la mémoire, ses préférences,
-- ses corrections sont dans notre code et dans la base. Rien n'est entraîné ni
-- affiné. Changer de modèle ne peut rien lui faire perdre.
--
-- LE DANGER N'EST DONC PAS LA PERTE, C'EST L'ADOPTION À L'AVEUGLE :
--  - le 4 sept., les TROIS modèles de Jarvis sont morts le même jour, et
--    `ListModels` les annonçait encore : la liste n'est PAS une autorisation ;
--  - un modèle qui répond peut être plafonné à 20 requêtes par jour, et la
--    mémoire est morte en silence à cause de ça.
-- Tout ce qui suit existe pour qu'un nom vu dans une liste ne puisse jamais
-- devenir le modèle de Jarvis sans avoir été ESSAYÉ pour de vrai.

-- ── Ce que Jarvis utilise en ce moment ─────────────────────────────────────
--
-- Une ligne par rôle. Quand la table ne dit rien pour un rôle, le serveur
-- retombe sur le secret puis sur la valeur écrite dans le code : cette table
-- ne peut donc qu'AJOUTER un choix, jamais casser celui qui marche.
create table if not exists public.moteur_choisi (
  role text primary key check (role in ('commande', 'memoire')),
  fournisseur text not null,
  modele text not null,
  secours text[] not null default '{}',
  promu_at timestamptz not null default now(),
  -- « veille » (la promotion automatique), « retour-arriere », « main ».
  promu_par text not null,
  raison text,
  -- De quoi revenir en arrière SANS rien deviner. Un retour arrière qui
  -- recalculerait le modèle précédent d'après le code se tromperait dès que
  -- le code a changé entre-temps.
  precedent jsonb
);

alter table public.moteur_choisi enable row level security;
drop policy if exists "moteur choisi : lecture" on public.moteur_choisi;
create policy "moteur choisi : lecture" on public.moteur_choisi
  for select using (auth.role() = 'authenticated');

-- ── Ce que chaque essai a donné ────────────────────────────────────────────
--
-- Gardé, et pas seulement utilisé sur le moment : c'est ce qui permet
-- d'exiger qu'un modèle ait réussi DEUX JOURS DIFFÉRENTS avant d'être promu.
-- Une seule bonne nuit ne prouve rien — les trois modèles morts du 4 sept.
-- répondaient parfaitement la veille.
create table if not exists public.essais_modele (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  jour date not null default (now() at time zone 'Asia/Jerusalem')::date,
  fournisseur text not null,
  modele text not null,
  role text not null check (role in ('commande', 'memoire')),

  -- A-t-il répondu ? A-t-il APPELÉ L'OUTIL ? Répondre n'est pas obéir, et un
  -- modèle qui répond joliment sans appeler l'outil ne sert à rien ici.
  repond boolean not null,
  appelle_outil boolean not null,
  -- Sur combien de nos propres phrases de contrôle il a fait le bon choix.
  controles_reussis integer not null default 0,
  controles_total integer not null default 0,

  ms_median integer,
  -- Le plafond réellement rencontré, lu dans le corps d'un 429.
  plafond_jour integer,
  plafond_minute integer,
  detail text
);

create index if not exists essais_modele_recent on public.essais_modele (modele, jour desc);

alter table public.essais_modele enable row level security;
drop policy if exists "essais modèle : lecture" on public.essais_modele;
create policy "essais modèle : lecture" on public.essais_modele
  for select using (auth.role() = 'authenticated');

-- ── Quand la veille est passée pour la dernière fois ───────────────────────
--
-- Il n'y a ni pg_cron ni pg_net sur ce projet, et les installer donnerait à la
-- base la capacité d'appeler l'extérieur — un vrai choix de sécurité, qui n'est
-- pas le nôtre. On reprend donc le motif que le projet utilise déjà pour
-- `purger_echanges` : une PASSE PARESSEUSE, déclenchée après une phrase de
-- Raphaël quand la précédente date de plus d'un jour, en tâche de fond. Pas de
-- tâche planifiée à maintenir, pas de jeton puissant à déposer quelque part,
-- et pas une session Claude complète rechargée pour une vérification mécanique.
create table if not exists public.veilles_modele (
  id uuid primary key default gen_random_uuid(),
  demarre_at timestamptz not null default now(),
  fini_at timestamptz,
  -- « en_cours », « rien_a_faire », « promotion », « retour_arriere »,
  -- « gelee », « echec ». Une passe qui ne fait rien s'enregistre AUSSI :
  -- sans ça, « il n'y avait rien de neuf » et « la veille ne tourne plus
  -- depuis trois jours » se ressemblent parfaitement.
  verdict text not null,
  detail text
);

alter table public.veilles_modele enable row level security;
drop policy if exists "veilles : lecture" on public.veilles_modele;
create policy "veilles : lecture" on public.veilles_modele
  for select using (auth.role() = 'authenticated');

-- ── Les fonctions ──────────────────────────────────────────────────────────

drop function if exists public.moteur_en_service(text);
-- Ce que le serveur doit utiliser pour ce rôle, ou rien.
create or replace function public.moteur_en_service(p_role text)
returns table (fournisseur text, modele text, secours text[], promu_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.fournisseur, m.modele, m.secours, m.promu_at
  from public.moteur_choisi m
  where m.role = p_role;
$$;

drop function if exists public.promouvoir_modele(text, text, text, text[], text, text);
-- Installe un modèle pour un rôle, en gardant de quoi revenir en arrière.
create or replace function public.promouvoir_modele(
  p_role text,
  p_fournisseur text,
  p_modele text,
  p_secours text[],
  p_par text,
  p_raison text
) returns void language plpgsql security definer set search_path = public as $$
declare v_precedent jsonb;
begin
  select jsonb_build_object('fournisseur', fournisseur, 'modele', modele, 'secours', secours)
    into v_precedent from public.moteur_choisi where role = p_role;

  insert into public.moteur_choisi (role, fournisseur, modele, secours, promu_par, raison, precedent, promu_at)
  values (p_role, p_fournisseur, p_modele, p_secours, p_par, p_raison, v_precedent, now())
  on conflict (role) do update set
    fournisseur = excluded.fournisseur,
    modele = excluded.modele,
    secours = excluded.secours,
    promu_par = excluded.promu_par,
    raison = excluded.raison,
    precedent = excluded.precedent,
    promu_at = now();
end;
$$;

drop function if exists public.retour_arriere_moteur(text, text);
-- Remet le choix précédent. Rend `true` s'il y avait quelque chose à remettre.
--
-- On REMET le précédent tel qu'il était enregistré, on ne le recalcule pas :
-- un retour arrière qui déduirait l'ancien modèle du code se tromperait dès
-- que le code a bougé entre-temps — et ce serait précisément le moment où l'on
-- a besoin qu'il ne se trompe pas.
create or replace function public.retour_arriere_moteur(p_role text, p_raison text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_prec jsonb;
begin
  select precedent into v_prec from public.moteur_choisi where role = p_role;
  if v_prec is null then return false; end if;

  update public.moteur_choisi set
    fournisseur = v_prec->>'fournisseur',
    modele = v_prec->>'modele',
    secours = coalesce((select array_agg(value::text) from jsonb_array_elements_text(v_prec->'secours')), '{}'),
    promu_par = 'retour-arriere',
    raison = p_raison,
    -- On efface le précédent : sans ça, deux retours arrière de suite
    -- feraient osciller entre deux modèles indéfiniment.
    precedent = null,
    promu_at = now()
  where role = p_role;
  return true;
end;
$$;

drop function if exists public.sante_promotion(text);
-- Comment se porte le modèle en service DEPUIS sa promotion.
--
-- C'est le filet du point 5 de sa demande : « si le taux d'échec dépasse un
-- seuil dans l'heure qui suit une promotion, on revient au modèle précédent
-- tout seul ». Les nombres sortent d'ici, la DÉCISION se prend en TypeScript
-- (`src/lib/veilleModele.ts`), qui se vérifie hors ligne.
--
-- `appels` à 0 veut dire qu'on ne sait RIEN — pas que tout va bien. C'est le
-- cas tant que voice-command n'a pas été redéployée avec l'écriture de
-- `appels_modele`, et la décision doit le distinguer d'un modèle sain.
create or replace function public.sante_promotion(p_role text)
returns table (
  modele text,
  promu_at timestamptz,
  promu_par text,
  a_un_precedent boolean,
  appels bigint,
  echecs bigint,
  refus_jour bigint
) language sql stable security definer set search_path = public as $$
  select
    m.modele,
    m.promu_at,
    m.promu_par,
    m.precedent is not null,
    count(a.id),
    count(a.id) filter (where a.statut <> 200),
    count(a.id) filter (where a.seau = 'jour')
  from public.moteur_choisi m
  left join public.appels_modele a
    on a.role = m.role and a.modele = m.modele and a.at >= m.promu_at and a.essai = false
  where m.role = p_role
  group by m.modele, m.promu_at, m.promu_par, m.precedent;
$$;

drop function if exists public.etat_veille_modele();
-- Tout ce qu'il faut pour décider d'une passe, en UN aller-retour.
--
-- Un seul appel, comme `etat_pour_passe_autonome()` : la passe est déclenchée
-- en tâche de fond après une phrase de Raphaël, et chaque aller-retour de plus
-- est du temps pendant lequel la fonction peut être coupée.
create or replace function public.etat_veille_modele()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    -- Le réglage est rendu BRUT, tel qu'il est en base : c'est TypeScript qui
    -- décide ce qu'il veut dire (`src/lib/veilleModele.ts`), pas une requête.
    -- Même partage qu'entre `etat_pour_passe_autonome()` et `passeAutonome.ts`,
    -- et pour la même raison : une règle écrite deux fois finit par dire deux
    -- choses. Il est lu EN BASE et non dans le localStorage du téléphone —
    -- sinon l'interrupteur n'éteindrait rien du tout côté serveur.
    'reglage', (select r.valeurs ->> 'jarvis_moteur_auto'
                  from public.reglages r
                 where r.user_id = public.proprietaire_du_cockpit()),
    'derniere_veille', (select max(demarre_at) from public.veilles_modele),
    'veille_en_cours', exists(
      select 1 from public.veilles_modele
      where verdict = 'en_cours' and demarre_at > now() - interval '20 minutes'),
    'en_service', (select jsonb_agg(jsonb_build_object(
        'role', role, 'fournisseur', fournisseur, 'modele', modele,
        'secours', secours, 'promu_at', promu_at, 'promu_par', promu_par))
      from public.moteur_choisi),
    'sante_commande', (select to_jsonb(s) from public.sante_promotion('commande') s),
    'essais_recents', coalesce((select jsonb_agg(to_jsonb(e))
      from (select modele, jour, repond, appelle_outil, controles_reussis,
                   controles_total, ms_median, plafond_jour, plafond_minute
            from public.essais_modele
            where jour >= (now() at time zone 'Asia/Jerusalem')::date - 14
            order by jour desc, modele) e), '[]'::jsonb)
  );
$$;
