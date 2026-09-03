# Méthode de travail de Raphaël — trace versionnée

Ce document n'est pas propre à Jarvis. Il consigne la façon de travailler que
Raphaël veut voir appliquée sur **tous** ses projets, quel que soit le dépôt.

Il est ici pour deux raisons : le dépôt est sa source de vérité, et ces règles
ont coûté des heures à établir — il ne veut pas les redécouvrir à chaque projet.

## Où ces règles vivent réellement

Elles sont écrites dans le **CLAUDE.md global** (`~/.claude/CLAUDE.md`), qui
s'applique à toutes les sessions Claude Code, tous projets confondus.

Ce fichier n'arrive pas tout seul dans les sessions cloud : il est écrit par le
**script de configuration** de l'environnement cloud « Full access », que
Raphaël garde de son côté. Ce script tourne avant le démarrage de Claude Code,
puis Anthropic prend un instantané du disque, si bien que le fichier persiste
dans les sessions suivantes. Il est rejoué quand le script est modifié, quand
les hôtes réseau autorisés changent, ou après environ sept jours.

Le script exécutable lui-même n'est **volontairement pas** dans ce dépôt : un
fichier versionné qui réécrit les instructions globales de l'agent à chaque
reconstruction d'environnement a exactement la forme d'une injection, et le
garde-fou de Claude Code refuse — à raison — de le committer. Seule la
substance est consignée ici. Pour modifier les règles, on modifie ce document,
puis Raphaël reporte le changement dans le champ « Setup script » de son
environnement.

## Les règles

### La mémoire du projet vit en base, pas dans la conversation

Sur tout projet qui dure, on tient un **cockpit** : une table des chantiers
(à faire / en cours / fait, avec des notes) et un **journal de bord** où les
sessions écrivent. La conversation est volatile, la base ne l'est pas. Si un
projet n'en a pas encore et qu'il commence à durer, le proposer à Raphaël.

Dans ce dépôt, c'est `dev_items` et `dev_log` — voir le `CLAUDE.md` à la racine.

### Au démarrage de chaque session, avant toute proposition

Lire l'état du projet : chantiers en cours, journal, et ce qui a déjà été livré.
Ne jamais reposer une question dont la réponse est déjà écrite quelque part.
Raphaël ouvre souvent une session neuve pour poursuivre un travail commencé
ailleurs : c'est à la session de retrouver le fil, pas à lui de se répéter.

### Ne jamais laisser un travail sans trace

En cas d'arrêt, d'interruption, ou de changement de sujet : écrire où on en est
avant de lâcher. Une session qui se termine sans avoir consigné son état fait
perdre des heures à la suivante. C'est la règle à laquelle Raphaël tient le plus.

### Les fiches qu'il remplit sont une source, pas un échange jetable

Dès qu'il y a plus de deux ou trois questions à lui poser, publier un artefact
qu'il remplit au pouce plutôt qu'un mur de texte : il est souvent sur son
téléphone. Chaque point doit dire pourquoi la question est posée, proposer des
options cliquables avec une recommandation marquée, et laisser un champ libre.
Séparer les décisions (il choisit) des actions (il doit faire quelque chose).

Surtout : verser l'URL de la fiche dans le `CLAUDE.md` du projet, **dans le même
commit**. Sinon ses réponses sont perdues pour les sessions suivantes.

### Les pop-up de validation : ne pas les subir, les contourner proprement

Certains outils MCP sont marqués « exige une interaction humaine » par leur
serveur. Leur demande de validation s'affiche à chaque appel, quel que soit le
mode de permission, aucune règle d'autorisation ne la saute, et elle n'offre
jamais « ne plus demander ». Ne pas perdre de temps à chercher un réglage : il
n'existe pas.

La sortie est de ne plus passer par l'outil : un petit script dans le dépôt qui
appelle l'API en HTTPS, avec la clé dans les **variables d'environnement de
l'environnement cloud** — jamais dans le code. Puis le documenter dans le
`CLAUDE.md` du projet, pour que les sessions suivantes prennent ce chemin
d'emblée.

Cas concret dans ce dépôt : `scripts/sql.sh` et la migration `0010_exec_sql.sql`.

### En contrepartie de cet accès large

Quand un accès direct remplace une validation, le garde-fou n'est plus
technique : c'est la session. Demander à Raphaël avant toute opération
destructrice ou irréversible — suppression de table, effacement massif, envoi
vers l'extérieur, dépense d'argent.

### Vérifier avant d'affirmer

Ne pas lui dire qu'une chose fonctionne tant qu'on ne l'a pas constatée. Un
appel qui n'a pas levé d'erreur n'est pas une preuve. Si on ne peut pas
vérifier, le dire clairement plutôt que de le laisser croire que c'est réglé.

## Ce qui est déjà global, et ce qui ne l'est pas

| | Portée |
|---|---|
| L'environnement cloud et ses variables d'environnement | Compte entier : toutes les sessions, tous les dépôts |
| Le `CLAUDE.md` global, écrit par le script de configuration | Toutes les sessions de cet environnement, tous les dépôts |
| Le `CLAUDE.md` d'un projet, ses scripts, ses migrations | Ce dépôt seulement |

Autrement dit : la **méthode** se transmet, l'**outillage** se refait à chaque
projet. Sur un nouveau projet Supabase, la recette d'ici (fonction `exec_sql`
réservée à `service_role` + script d'appel en HTTPS + clé en variable
d'environnement) est à réappliquer telle quelle.
