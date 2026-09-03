-- Connexion du compte Google de l'utilisateur (agenda, puis Gmail).
--
-- Trois tables, et la séparation entre elles est le point important :
--
-- google_tokens porte les jetons d'accès et de rafraîchissement. Elle a RLS
-- activée SANS AUCUNE POLICY : personne ne la lit depuis le navigateur, même
-- pas son propriétaire. Seule la clé service_role, côté Edge Function,
-- traverse RLS. Un jeton de rafraîchissement Google donne un accès durable à
-- l'agenda et aux mails ; il n'a rien à faire dans un bundle JavaScript, et
-- une faille XSS ne doit pas pouvoir l'exfiltrer.
--
-- google_accounts porte ce que l'interface a le droit de savoir : quel compte
-- est branché, depuis quand, avec quelles autorisations. C'est le filtrage
-- côté serveur plutôt qu'un simple masquage à l'écran — l'app lit cette
-- table-là, et il n'y a rien de sensible à y lire.
--
-- google_oauth_states porte le paramètre "state" du temps de l'aller-retour
-- vers Google : c'est lui qui garantit que la réponse qui revient correspond
-- bien à une demande qu'on a émise, pour cet utilisateur-là (protection CSRF
-- exigée par OAuth 2.0). Il expire au bout de dix minutes.

create table google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scopes text not null default '',
  updated_at timestamptz not null default now()
);

alter table google_tokens enable row level security;
-- Volontairement aucune policy : lecture et écriture réservées au service_role.

create table google_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  scopes text not null default '',
  connected_at timestamptz not null default now()
);

alter table google_accounts enable row level security;

create policy "google_accounts_select_own" on google_accounts
  for select using ((select auth.uid()) = user_id);
-- Déconnecter, c'est supprimer sa ligne. L'insertion et la mise à jour
-- restent l'affaire de l'Edge Function : elles n'ont de sens qu'au retour
-- de Google.
create policy "google_accounts_delete_own" on google_accounts
  for delete using ((select auth.uid()) = user_id);

create table google_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now()
);

alter table google_oauth_states enable row level security;
-- Idem : aucune policy, ces lignes ne concernent que le serveur.

create index google_oauth_states_created_at_idx on google_oauth_states (created_at);

-- Purge des states périmés. Appelée au début de chaque nouvelle demande de
-- connexion plutôt que par une tâche planifiée : le volume est minuscule et
-- ça évite une automatisation de plus à surveiller.
create or replace function purger_google_oauth_states()
returns void
language sql
security definer
set search_path = public
as $$
  delete from google_oauth_states where created_at < now() - interval '10 minutes';
$$;
