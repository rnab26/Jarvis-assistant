# La session autonome : ce qu'elle fait, et ce qu'elle ne fait jamais

Chantier `59d8587f`. Ce fichier est la CONSIGNE d'une session ouverte par le
déclencheur horaire, pas par Raphaël. Il est versionné exprès : sa règle est que
la base porte l'état et que les fichiers portent les instructions — une consigne
doit pouvoir être relue et discutée avant de prendre effet, jamais lue depuis une
ligne de base que personne n'a revue.

## Ce qu'il a demandé, et sa réponse

Sa demande dictée : « Tout les chantiers ne nécessitant pas l'action de traiter
des chantiers disponibles a travailler doivent etres travailler seul afin de
gagner du temps en developpement sur les temps mort de ma présence sur le
développement de jarvis ».

Sa réponse du 6 septembre 2026 à 00 h 05, quand la question lui a été posée dans
l'app : « Oui en continue même la journee. **Éviter de lancer une session si une
autre en est deja en cours et est disponible** pour plusieurs raison : ne pas
consommer trop de crédit claude code, ne pas augmenter le nombre de session qui
deviendrais sûrement inactive a la fin de la tâche ».

Les deux moitiés comptent autant : ça tourne en continu, ET ça se retire dès
qu'une autre session est là.

## Le premier geste, avant tout le reste

```bash
node --experimental-strip-types scripts/passe-autonome.ts --demarrer
```

Un seul appel à la base. Il répond `verdict : travaille` (code de sortie 0) ou
`verdict : eteint | occupe | rien_a_prendre` (code 3), avec la raison en clair,
le chantier à prendre, et l'identifiant de la passe.

**Si le verdict n'est pas `travaille`, arrête-toi là.** N'ouvre aucun fichier, ne
lis pas le cockpit, ne cherche pas « quand même quelque chose à faire » : la
passe est déjà enregistrée, elle apparaîtra dans Paramètres › Le cockpit, et
c'est tout ce qu'on attend d'elle. Chaque tour de plus est du crédit dépensé pour
rien — c'est exactement ce qu'il a demandé d'éviter.

Tu n'as rien d'autre à faire : tu es une session PERSISTANTE, réveillée à
chaque tir, et tu ne t'archives pas. C'est la seconde moitié de sa consigne,
« ne pas augmenter le nombre de session qui deviendrais sûrement inactive a la
fin de la tâche » — une seule session réveillée vingt-quatre fois vaut mieux que
vingt-quatre sessions ouvertes puis abandonnées.

## Si le verdict est `travaille`

1. **Réserve le chantier** avec ta branche :
   `scripts/sql.sh "select claim_dev_item('<id>', '<ta branche>', 120)"`.
   Si ça rend `false`, une autre session vient de le prendre : referme la passe
   (`--terminer … --resume "chantier pris entre-temps"`) et arrête-toi.
2. Fais le travail comme n'importe quelle session : `CLAUDE.md` s'applique en
   entier, y compris le brief d'usage en cinq lignes, les états vide / chargement
   / erreur, la suppression avec confirmation, et le réglage plutôt que la valeur
   en dur.
3. **Ne fusionne rien tant que les deux workflows ne sont pas verts.** Personne
   ne regarde par-dessus ton épaule ; la CI est la seule relecture.

   *Si tu n'as pas d'accès GitHub* (une session ouverte par un déclencheur peut
   ne pas hériter des outils `mcp__github__*`) : lance toi-même, en entier, ce
   que la CI lance — `npx tsc -b`, tous les `scripts/verifier-*.ts` hors réseau
   listés dans `.github/workflows/verifications.yml`, et les parcours navigateur
   de `verifications-navigateur.yml`. Ce sont exactement les mêmes scripts. Puis
   écris dans `dev_log` que la vérification a été faite en local faute d'accès à
   la CI, pour que la session suivante le sache. Ne fusionne jamais sans l'un
   ou l'autre.
4. Archive le chantier avec le hash du commit, comme d'habitude.
5. **Écris dans `dev_log`** ce que tu as fait. Sans ça il découvre au réveil du
   code qu'il n'a pas demandé, sans savoir d'où il vient.
6. Referme la passe :
   `node --experimental-strip-types scripts/passe-autonome.ts --terminer <id> --resume "…" --commit <hash>`
   Une passe laissée ouverte bloque les suivantes pendant trois heures.

## Ce qu'une session autonome ne fait JAMAIS

Ces règles sont dans le code (`src/lib/passeAutonome.ts`) et vérifiées hors ligne
par `scripts/verifier-sessions-autonomes.ts`. Elles ne sont pas à ta main :

- **Uniquement des chantiers marqués `[LIBRE]`.** Jamais un `[À CADRER]`, jamais
  un `[BLOQUÉ PAR]`, jamais un chantier sans marqueur — un chantier sans marqueur
  n'a pas été relu, et « spécifié de bout en bout » est une affirmation que
  quelqu'un doit avoir faite.
- **Jamais un chantier déjà réservé**, même si la réservation semble oubliée.
- **Jamais un sujet qu'il a mis à part** : contrôle du téléphone, accès aux
  applications, envoi de messages en son nom, clonage vocal, toute dépense. Ils
  se discutent avec lui, et une session ouverte par un déclencheur n'a personne à
  qui parler.
- **Jamais deux passes autonomes à la fois** : une seule, c'est sa consigne.
- **Jamais une question posée et attendue.** Si tu butes sur un arbitrage,
  `scripts/demander.sh` pose la question dans son app et tu passes à autre
  chose — ou tu refermes la passe. Tu ne restes pas en attente.

## Comment il arrête tout

Paramètres › Le cockpit › Sessions autonomes, l'interrupteur. Il est lu en base
(`reglages.jarvis_sessions_autonomes`) à chaque passe, avant tout le reste. La
passe suivante s'enregistre alors en `eteint` et ne fait rien d'autre.

Le déclencheur lui-même vit dans ses Routines sur claude.ai : c'est là qu'il en
change la cadence ou qu'il le supprime.

## Le déclencheur, et le piège qui a coûté deux passes pour rien

Routine `trig_01AbpcwCgpLeVMTtyCfqRguQ` — « Jarvis — session autonome
(horaire) », une fois par heure. Elle réveille **une session persistante**,
`session_01HbJWrhPvY3kn3jzuCdyBWH`, qui porte le dépôt. Raphaël peut la mettre
en pause ou la supprimer depuis ses Routines sur claude.ai ; l'interrupteur de
l'app, lui, laisse la Routine tourner mais fait que chaque passe se retire
aussitôt.

**UNE ROUTINE QUI OUVRE UNE SESSION FRAÎCHE NE LUI DONNE PAS LE DÉPÔT.** C'est
la première version de ce déclencheur, et elle a tiré deux fois pour rien avant
qu'on s'en aperçoive : `create_trigger` avec `create_new_session_on_fire` pose
un `sources: []` dans la session ouverte. Elle démarre donc dans un conteneur
vide, sans `scripts/passe-autonome.ts`, sans `scripts/sql.sh`, sans CLAUDE.md.

Et le piège est SILENCIEUX de trois façons à la fois : la Routine se déclare
`SUCCEEDED` (la session a bien démarré et répondu), la session n'apparaît pas
dans `list_sessions` (son identifiant est préfixé `cse_`, pas `session_`), et la
seule trace visible est une absence — aucune ligne dans `passes_autonomes`. Vu
de l'app, ça ressemble exactement à « il n'y avait rien à faire ».

D'où la règle : **une Routine qui doit toucher au dépôt se rattache à une
session existante** (`persistent_session_id`), créée avec `create_session` et
son `source_url`. C'est d'ailleurs ce que font toutes les autres Routines de
Raphaël. Et c'est la seule chose qui a réellement prouvé que le mécanisme
fonctionne : le même script, lancé depuis une session qui a le dépôt, rend son
verdict en une seconde et écrit sa ligne.

**Comment le vérifier, plutôt que de le croire** : après un tir, la table
`passes_autonomes` doit avoir une ligne de plus. Si elle n'en a pas, la session
n'a pas pu lancer le script — regarde `get_session` sur l'identifiant que donne
`last_run.session_id` de la Routine, et vérifie que son `session_context.sources`
n'est pas vide.
