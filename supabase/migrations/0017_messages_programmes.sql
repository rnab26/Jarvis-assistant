-- Les messages que Raphaël demande d'envoyer plus tard.
--
-- Sa demande, mot pour mot (fiche WhatsApp du 3 sept. 2026) : « éventuellement
-- aussi programmer des messages à envoyer sur WhatsApp, exemple : Jarvis
-- renvoie un message au client de Melissa, Dylan, demain matin à 10h pour lui
-- demander où en est son chantier. »
--
-- POURQUOI UNE TABLE, ET PAS UNE ALARME SUR LE TÉLÉPHONE. Une alarme Android
-- meurt avec une réinstallation de l'APK, et n'existe pas côté web. Ce qu'il
-- a dicté doit survivre à ça : c'est une intention, au même titre qu'une tâche
-- ou un rendez-vous. Le téléphone lit cette table et se charge de la sonnerie.
--
-- CE QUE CETTE TABLE NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : envoyer. Raphaël a
-- tranché le 3 sept. — on reste sur le téléphone, rien ne part sans qu'il
-- appuie. À l'heure dite, Jarvis PARLE, annonce le message prévu, et attend sa
-- réponse (envoyer / modifier / reprogrammer / annuler). D'où `statut`, qui
-- distingue « annoncé » de « envoyé » : sans cette distinction, une annonce
-- ratée ressemblerait à un envoi réussi.

create table if not exists messages_programmes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Le canal reste NULL tant qu'il ne l'a pas dit. Décision du 3 sept. : le
  -- modèle ne doit plus se rabattre sur « whatsapp » de son propre chef, c'est
  -- le téléphone qui tranche au moment de l'envoi (préférence retenue, ou
  -- question posée). Voir normaliserAction dans voice-command.
  canal text check (canal in ('whatsapp', 'sms')),

  -- Deux façons de désigner quelqu'un, et il faut les deux. `contact_id` quand
  -- c'est un contact connu ; `destinataire` garde TOUJOURS la façon dont il l'a
  -- nommé à l'oral (« le client de Melissa »), parce que c'est ça qu'il faudra
  -- lui relire à l'heure dite — pas un identifiant.
  contact_id uuid references contacts (id) on delete set null,
  destinataire text not null,

  texte text not null,
  envoyer_a timestamptz not null,

  -- prevu   : dicté, pas encore l'heure.
  -- annonce : Jarvis le lui a présenté, il n'a pas encore répondu.
  -- envoye  : il a validé et le message est parti de son téléphone.
  -- annule  : il a dit non, ou l'a annulé avant l'heure.
  statut text not null default 'prevu'
    check (statut in ('prevu', 'annonce', 'envoye', 'annule')),
  annonce_a timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- La seule requête que fera le téléphone, plusieurs fois par heure : « qu'ai-je
-- à annoncer maintenant ? ». Sans cet index elle balaierait tout l'historique
-- des messages déjà envoyés.
create index if not exists messages_programmes_a_venir
  on messages_programmes (user_id, envoyer_a)
  where statut = 'prevu';

alter table messages_programmes enable row level security;

create policy "messages_programmes_select_own" on messages_programmes
  for select using ((select auth.uid()) = user_id);
create policy "messages_programmes_insert_own" on messages_programmes
  for insert with check ((select auth.uid()) = user_id);
create policy "messages_programmes_update_own" on messages_programmes
  for update using ((select auth.uid()) = user_id);
create policy "messages_programmes_delete_own" on messages_programmes
  for delete using ((select auth.uid()) = user_id);

-- `updated_at` tenu par la base : une session qui oublie de le poser rendrait
-- l'ordre des modifications faux, et personne ne s'en apercevrait.
create or replace function messages_programmes_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists messages_programmes_touch on messages_programmes;
create trigger messages_programmes_touch
  before update on messages_programmes
  for each row execute function messages_programmes_touch();
