-- Notifications PUSH (Firebase Cloud Messaging).
--
-- Chantier 76a6a595, débloqué le 6 sept. 2026 : Raphaël a activé pg_net sur sa
-- base (choix explicite, tradeoff exposé, il a dit oui). Deux des cinq
-- notifications qu'il a acceptées ne sonnaient jusqu'ici que pendant que
-- l'app tourne, parce qu'elles venaient du temps réel Supabase et pas d'un
-- push (CLAUDE.md, section « Les notifications ») : « une session a livré des
-- chantiers » et « une session est bloquée et t'attend ». Téléphone en poche,
-- app fermée, il ne recevait rien.
--
-- Le jeton d'appareil, un par installation, RLS par utilisateur — même forme
-- que visites_cockpit (migration 0025).
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plateforme text not null default 'android',
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: le sien" on public.push_tokens;
create policy "push_tokens: le sien" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Le secret qui authentifie l'appel Postgres → Edge Function N'EST PAS ICI :
-- il est déposé une seule fois par `select vault.create_secret(...)`, jamais
-- dans un fichier versionné. La fonction ci-dessous le relit par son nom à
-- chaque appel, dans Supabase Vault (déjà installé, 0.3.1).
--
-- CE QUI RESTE OUVERT, ET C'EST ÉCRIT EN CLAIR PLUTÔT QUE TRANCHÉ SEUL :
-- push-notifier a besoin d'un appel Postgres → Edge Function authentifié
-- sans jeton utilisateur (comme les Database Webhooks natifs de Supabase).
-- Les deux façons standard de le faire — déployer avec verify_jwt=false
-- (protégé par x-push-secret ci-dessous, seul repli), ou transmettre la clé
-- de service à chaque appel — ont chacune été refusées par le
-- classificateur de permissions de cet environnement comme décision de
-- sécurité à ne pas prendre seul. Posé à Raphaël via scripts/demander.sh
-- plutôt que de chercher un détour. En attendant sa décision, cette
-- fonction envoie x-push-secret seul (pas de clé de service) : le trigger
-- s'exécute sans erreur, mais push-notifier n'est pas encore déployée et
-- l'appel échouera silencieusement (avalé par le exception when others
-- ci-dessous) jusqu'à ce que le point ci-dessus soit tranché et déployé.
create or replace function public.appeler_push_notifier(p_body jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'push_trigger_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://bexiyvmdbxcwxasgslxp.supabase.co/functions/v1/push-notifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    body := p_body,
    timeout_milliseconds := 8000
  );
exception when others then
  null;
end;
$$;

-- Chantiers livrés : trigger de STATEMENT, pas de ligne. Archiver six
-- chantiers d'un coup (une action groupée du cockpit, migration des actions
-- groupées) doit envoyer UN push, pas six — même règle que
-- corpsChantiersLivres côté client (« groupé par session, pas par
-- chantier »). Les tables de transition donnent AVANT/APRÈS pour tout le lot
-- en un seul passage.
create or replace function public.notifier_push_chantiers_livres()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_titres text[];
  v_user_id uuid;
begin
  select array_agg(n.title order by n.archived_at), min(n.user_id)
    into v_titres, v_user_id
  from nouveaux n
  join anciens o on o.id = n.id
  where n.archived_at is not null and o.archived_at is null;

  if v_titres is null or array_length(v_titres, 1) = 0 then
    return null;
  end if;

  perform public.appeler_push_notifier(jsonb_build_object(
    'type', 'chantiers_livres',
    'user_id', v_user_id,
    'titres', v_titres
  ));
  return null;
end;
$$;

drop trigger if exists trg_push_chantiers_livres on public.dev_items;
create trigger trg_push_chantiers_livres
  after update on public.dev_items
  referencing old table as anciens new table as nouveaux
  for each statement
  execute function public.notifier_push_chantiers_livres();

-- Sessions bloquées / questions pour Raphaël : un message, un push. Le tri
-- « est-ce que ça le concerne » N'EST PAS REFAIT en SQL — il vit dans
-- src/lib/journalDestinataire.ts côté client (estPourRaphael), et l'Edge
-- Function le rejoue en TypeScript, même langage, pour rester le plus près
-- possible de l'original plutôt que de le traduire en SQL.
create or replace function public.notifier_push_dev_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.appeler_push_notifier(jsonb_build_object(
    'type', 'dev_log',
    'id', NEW.id
  ));
  return NEW;
end;
$$;

drop trigger if exists trg_push_dev_log on public.dev_log;
create trigger trg_push_dev_log
  after insert on public.dev_log
  for each row
  execute function public.notifier_push_dev_log();
