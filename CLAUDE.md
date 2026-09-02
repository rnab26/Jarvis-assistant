# CLAUDE.md — Jarvis (ce repo)

Complète le CLAUDE.md global de Raphaël (ne le remplace pas). Spécifique au
projet Jarvis (assistant vocal personnel, PWA + app Android via Capacitor).

## Cockpit de développement (chantiers)

Ce projet a un **cockpit interne** dans l'app elle-même (`/cockpit`), soutenu
par une vraie table Supabase — pas juste des notes dans une conversation.
Raphaël y ajoute des chantiers par la voix ou depuis l'interface.

- **Projet Supabase** : `bexiyvmdbxcwxasgslxp` (org `rnab26's Org`).
- **Table** : `dev_items` (`id`, `title`, `notes`, `status`
  todo/in_progress/done, `priority` low/normal/high, `archived_at`).

**Avant de commencer à travailler sur ce repo**, va lire les chantiers en
cours pour ne pas repartir de zéro ou dupliquer un travail déjà fait :

```sql
select id, title, status, priority, notes
from dev_items
where archived_at is null
order by priority desc, created_at;
```

(via `mcp__Supabase__execute_sql`, `project_id: bexiyvmdbxcwxasgslxp`)

**En terminant un chantier**, marque-le fait et archive-le, avec une note
qui référence le commit — c'est la pratique établie qui sert d'historique
(visible directement dans l'app, section "Archivées" du cockpit) :

```sql
update dev_items
set status = 'done', archived_at = now(), notes = 'Fait : <résumé court>. Commit <hash>.'
where id = '<id>';
```

Si le chantier touche à un sujet sensible ou irréversible (accès aux
applications du téléphone, contrôle du téléphone, envoi de messages,
clonage vocal via un service tiers payant), ne pas l'implémenter sans en
discuter d'abord avec Raphaël — même s'il est dans le cockpit en statut
"todo" (conforme à la règle de son CLAUDE.md global sur les actions à fort
enjeu).

## Travail en parallèle : réserver un chantier et se parler

Plusieurs sessions Claude Code travaillent souvent sur ce repo en même temps.
Deux règles évitent qu'elles se marchent dessus ou qu'elles s'attendent.

**Avant de toucher à un chantier, le réserver.** La prise est atomique : si
deux sessions appellent en même temps, une seule obtient `true`.

```sql
select claim_dev_item('<id du chantier>', '<nom de ta branche>', 120);
```

`false` = une autre session est déjà dessus, prends-en un autre. La réservation
expire après le délai en minutes, pour qu'une session interrompue ne bloque
rien ; renouvelle l'appel si tu dépasses. Quand tu t'arrêtes ou que tu
termines : `select release_dev_item('<id>', '<ta branche>');`

Utilise **le nom de ta branche** comme identifiant de session : c'est ce que
Raphaël voit dans le cockpit, sur le chantier, sous la forme « Prise par … ».

**Deux marqueurs en tête des notes commandent le comportement :**

- `[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]` — ne pas coder. Raphaël veut en
  discuter d'abord pour trancher une bonne fois (coût, accès, périmètre) plutôt
  que de revenir dessus plusieurs fois.
- `[LIBRE]` — spécifié de bout en bout, aucune décision ni accès à obtenir :
  à prendre sans rien demander.

**Pour parler à une autre session**, écris dans `dev_log` — elle le lira à son
prochain passage, même si elle est arrêtée maintenant :

```sql
insert into dev_log (user_id, item_id, author, kind, body)
values ('<user_id>', '<id chantier ou null>', '<ta branche>',
        'question', 'Tu es toujours sur X ? Je voudrais toucher à Y.');
```

`kind` vaut `question`, `reponse`, `info` ou `blocage`. Renseigne `answered_at`
quand tu réponds à une question. Le journal est visible dans l'app, en bas du
cockpit : Raphaël y écrit aussi ses consignes, **lis-le en début de session**
en même temps que les chantiers.

**Ne prends pas un gros lot d'un coup.** Réserve ce que tu traites maintenant
et laisse le reste libre, pour qu'une autre session puisse avancer en
parallèle au lieu d'attendre après toi.

## Requêtes SQL : toujours regrouper

Chaque appel `mcp__Supabase__execute_sql` demande une autorisation manuelle à
Raphaël, souvent depuis son téléphone. **Regrouper le maximum d'opérations
dans un seul appel** plutôt que d'en enchaîner plusieurs :

- Plusieurs `update`/`insert`/`select` liés → un seul appel, statements
  séparés par `;` (le `select` de vérification à la fin du même appel).
- Une structure complète (table + index + policies RLS + trigger) → un seul
  appel, dans un `begin; ... commit;` pour que tout passe ou rien.
- Ne pas faire un appel par ligne à mettre à jour : utiliser `where id in
  (...)`, un `update ... from (values ...)`, ou des `case when`.

Ne séparer en plusieurs appels que si c'est vraiment nécessaire : quand le
contenu d'une requête dépend du résultat de la précédente, ou pour isoler une
opération destructrice (`drop`, `delete` massif) qui mérite sa propre
validation explicite.

Pour le DDL, `mcp__Supabase__apply_migration` reste préférable à
`execute_sql` — mais la même règle s'applique : une migration complète par
appel, pas une par instruction.

## Stack

React + Vite + TypeScript + Tailwind + shadcn/ui, Supabase (Auth + Postgres
+ Edge Functions), Capacitor pour l'app Android. Détails de déploiement et
scripts : voir `README.md`.

## CI

- `.github/workflows/deploy.yml` — site web sur GitHub Pages, à chaque push
  sur `claude/new-session-rn6puh`.
- `.github/workflows/android-build.yml` — build de l'APK debug, publié en
  artifact ET sur une GitHub Release à URL fixe (tag `latest-debug`,
  téléchargement direct depuis l'onglet Paramètres de l'app).

Toujours vérifier que les deux workflows passent au vert après un push
(`mcp__github__actions_list` / `get_job_logs`), et se corriger soi-même en
cas d'échec avant de considérer un chantier terminé.
