# CLAUDE.md — Jarvis (ce repo)

Complète le CLAUDE.md global de Raphaël (ne le remplace pas). Spécifique au
projet Jarvis (assistant vocal personnel, PWA + app Android via Capacitor).

Sa méthode de travail générale — celle qui vaut pour tous ses projets, pas
seulement celui-ci — est consignée dans `docs/methode-de-travail.md`. Lis-la
si tu débarques : elle explique pourquoi le cockpit et le journal existent, et
ce qu'il attend d'une session qui reprend un travail commencé ailleurs.

## Livrer une fonctionnalité utilisable, pas du code qui marche

Consigne permanente de Raphaël (4 sept. 2026), écrite en entier dans
`docs/methode-de-travail.md`, section du même nom : brief d'usage en cinq
lignes AVANT de coder, modifier/supprimer avec confirmation, réglages plutôt
que valeurs en dur, états vide/chargement/erreur, parcours depuis un écran de
téléphone, et trois lignes à la livraison. Lis-la avant de prendre un chantier.

## Cockpit de développement (chantiers)

Ce projet a un **cockpit interne** dans l'app elle-même (`/cockpit`), soutenu
par une vraie table Supabase — pas juste des notes dans une conversation.
Raphaël y ajoute des chantiers par la voix ou depuis l'interface.

- **Projet Supabase** : `bexiyvmdbxcwxasgslxp` (org `rnab26's Org`).
- **Table** : `dev_items` (`id`, `title`, `notes`, `status`
  todo/in_progress/done, `priority` low/normal/high, `theme`, `archived_at`).

### Prends un THÈME, pas un chantier isolé

Les chantiers sont groupés par `theme` — dans l'app comme dans le bloc injecté
au démarrage. C'est une demande explicite de Raphaël : il en a assez des
correctifs ponctuels posés en pansement, un symptôme à la fois. Les chantiers
d'un même thème partagent presque toujours la même cause racine, et se
traitent ensemble à un coût bien moindre que séparément.

Un chantier arrivé sans thème (dicté trop vite, mal classé) : classe-le en le
traitant, `update dev_items set theme = '...' where id = '...'`. Reprends un
thème existant **à l'identique** ; un thème presque identique éparpille le
sujet au lieu de le rassembler.

### Au démarrage de CHAQUE session, avant toute autre chose

**Normalement tu n'as rien à faire : c'est déjà chargé.** Un hook de démarrage
(`.claude/hooks/session-start.sh`) lit la base à chaque ouverture de session et
injecte l'état du projet dans ton contexte — chantiers en cours avec leurs
réservations, douze dernières entrées du journal, huit derniers chantiers
livrés. Raphaël n'a rien à coller, et tu n'as pas à redemander.

Si ce bloc « État du projet au démarrage de cette session » n'apparaît pas, ou
s'il dit que le cockpit n'a pas pu être chargé, fais les lectures à la main —
et pour le détail complet d'un chantier (les notes sont tronquées dans
l'injection), de toute façon c'est par là :

```bash
# 1. Les chantiers en cours, et qui les a réservés
scripts/sql.sh "select id, title, status, priority, notes, claimed_by, claim_expires_at from dev_items where archived_at is null order by priority desc, created_at"

# 2. Le journal de bord : consignes de Raphaël et messages des autres sessions
scripts/sql.sh "select created_at, author, kind, body, answered_at, item_id from dev_log order by created_at desc limit 30"

# 3. Ce qui a déjà été livré, pour ne pas refaire ni défaire
scripts/sql.sh "select title, notes, archived_at from dev_items where archived_at is not null order by archived_at desc limit 15"
```

Lis-les vraiment avant de proposer quoi que ce soit. Une question dont la
réponse est déjà dans les notes d'un chantier, dans le journal ou dans une
fiche (voir plus bas) ne doit pas être reposée à Raphaël.

**AVANT DE RÉÉCRIRE UNE NOTE, RELIS-LA — dans un appel SÉPARÉ, et lis vraiment
le résultat.** `update dev_items set notes = …` écrase tout, et une note vit
souvent depuis plusieurs sessions : elle porte les mots de Raphaël, ce qui a
déjà été écarté, ce qui a été vérifié. Le 5 sept. puis le 6, deux notes ont
été écrasées de cette façon — l'une contenait un retour de Raphaël qui n'était
écrit nulle part ailleurs. Le `select` doit précéder l'`update`, pas
l'accompagner : groupés dans le même appel, on lit le texte APRÈS l'avoir
détruit. La bonne forme est d'ajouter à la note, pas de la remplacer.

**En terminant un chantier**, marque-le fait et archive-le, avec une note
qui référence le commit — c'est la pratique établie qui sert d'historique
(visible directement dans l'app, section "Archivées" du cockpit) :

```bash
scripts/sql.sh "update dev_items set status = 'done', archived_at = now(), notes = 'Fait : <résumé court>. Commit <hash>.' where id = '<id>'"
```

**Ne laisse jamais un travail sans trace.** Si tu t'arrêtes en cours de route,
que tu es interrompu, ou que Raphaël change de sujet : écris où tu en es dans
les notes du chantier ou dans `dev_log` avant de lâcher. Une session qui se
termine sans avoir écrit son état fait perdre des heures à la suivante.

**Et si c'est du travail à faire, ça devient un CHANTIER — pas une note.**
Consigne explicite de Raphaël le 3 sept. 2026 : tout ce que tu n'as pas pu
avancer, tout ce qui attend une décision de lui, et tout bug que tu découvres
sans le corriger, doit exister comme une ligne de `dev_items` ouverte. Une
trouvaille écrite seulement dans `dev_log` est perdue dès qu'une douzaine de
messages passent — le hook de démarrage n'en injecte que les douze derniers.
Enfouie dans les notes d'un autre chantier, elle disparaît quand celui-ci est
archivé.

Écris le chantier de façon **autoportante** : ce que Raphaël a déjà répondu,
ce qui a déjà été vérifié (et ce qui a été écarté, pour qu'on ne le
repropose pas), le fichier concerné, et le marqueur `[LIBRE]` ou
`[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]`. Un chantier ombrelle du type
« améliorer X » qui a réellement livré son travail se referme au profit des
chantiers concrets qu'il a produits, en les nommant dans sa note d'archivage.

Si le chantier touche à un sujet sensible ou irréversible (accès aux
applications du téléphone, contrôle du téléphone, envoi de messages,
clonage vocal via un service tiers payant), ne pas l'implémenter sans en
discuter d'abord avec Raphaël — même s'il est dans le cockpit en statut
"todo" (conforme à la règle de son CLAUDE.md global sur les actions à fort
enjeu).

## Les sections de chantiers (migration 0018) et le registre des erreurs (0019)

Livrés ensemble le 4 sept. 2026 (chantiers 3e880467, dce4415e, 033a41da,
f2f6667f, 41816bdc) : le cockpit se range, se filtre, et garde ce que Jarvis
rate.

### Le rattachement reste `dev_items.theme`. Ne change pas ça.

**Et Jarvis voit les sections DÉCLARÉES, pas seulement les thèmes portés.**
`MicButton` envoyait `themesDe(devItems)` — la liste des thèmes réellement
portés par un chantier. Une section créée d'avance et encore vide
(« Entraînement », le cas de la demande d'origine) était donc invisible pour
lui : dicter « ajoute un chantier dans Entraînement » en fabriquait une
jumelle. Il reçoit maintenant `sections` (id + nom) en plus, et sait qu'une
section peut exister sans rien contenir.

Il crée et renomme une section à la voix (`add_dev_section`,
`rename_dev_section`). Il ne SUPPRIME ni ne FUSIONNE pas : ça déplace tous les
chantiers de la section, et à la voix il n'y a ni confirmation ni bouton
Annuler — le cockpit a les deux. La consigne lui dit d'y renvoyer, et un
contrôle de `verifier-commande-vocale.mjs` vérifie qu'il le fait.

`theme` est du texte libre, et c'est ce que TOUT le projet lit : le hook de
démarrage, la commande vocale, les scripts SQL, les autres sessions. La table
`dev_sections` ne porte que ce que le texte libre ne sait pas porter — exister
sans chantier (« Entraînement » créée avant d'avoir quoi que ce soit à y
mettre), avoir un ordre, une description. En faire une clé étrangère casserait
tout le reste pour rien.

Les deux sont tenus alignés par des fonctions SQL, **jamais par deux écritures
côté app** : `renommer_section(id, nom)` renomme la section ET le thème de tous
ses chantiers, `fusionner_sections(source, cible)` déplace puis supprime,
`supprimer_section(id, vers)` déplace vers une autre section ou rend les
chantiers à « À classer » — **jamais de suppression en cascade**, une section
est un rangement, pas un contenant. `reordonner_sections(ids[])` pose l'ordre
d'un coup. Si l'une des deux moitiés passait sans l'autre, le cockpit
afficherait une section vide à côté de chantiers orphelins, et personne ne le
verrait sur le moment.

`cle_section(nom)` en SQL reprend mot pour mot `cleTheme()` de
`src/lib/themeChantier.ts` : accents, apostrophes, tirets et majuscules ne
distinguent pas deux sections. Changer l'une, c'est changer l'autre.

L'ordre choisi par Raphaël est aussi celui du bloc injecté au démarrage de
session (le hook joint `dev_sections` sur cette clé) : ce qu'il voit dans l'app
et ce que tu lis en ouvrant une session sont rangés pareil.

### Le registre des erreurs : ce qui y arrive tout seul, et ce qui n'y arrive pas

`jarvis_erreurs` + la fonction `signaler_erreur(categorie, titre, detail,
contexte, source)`, appelée depuis `src/lib/erreurs.ts` — jamais en direct.
Trois branchements sont déjà posés, et ils suffisent à couvrir les échecs
techniques :

- `withErrorToast` (`src/lib/notifyError.ts`) : **toutes** les écritures de
  l'app y passent. C'est le seul endroit à brancher, pas chaque hook.
- `noterEcoute` (`src/lib/journalEcoute.ts`) : les échecs Live, les refus du
  serveur vocal et les rafales de micro qui finissent sans rien avoir entendu.
  La table de correspondance est `erreurDepuisEcoute()`, vérifiable sans réseau.
- La saisie manuelle, depuis le cockpit : c'est elle qui compte le plus, parce
  qu'une erreur de COMPRÉHENSION ne lève aucune exception et que seul Raphaël
  peut la voir.

Deux règles à ne pas défaire :

1. **`signalerErreur` ne doit jamais faire échouer ce qu'elle observe.** Pas
   d'`await` chez l'appelant, client Supabase chargé paresseusement (le banc
   d'essai du micro monte le moteur d'écoute sans configuration Supabase),
   erreurs avalées.
2. **L'empreinte n'est pas recalculée quand Raphaël retouche un titre.** Elle
   reste celle du signalement automatique, pour que la prochaine occurrence
   vienne se ranger sur la même ligne au lieu d'en ouvrir une seconde. Une
   erreur corrigée qui revient rouvre toute seule (`reapparue_at`).

Les corrections écrites dans le registre remontent dans le bloc injecté au
démarrage de chaque session : c'est par là qu'elles servent à corriger.

### « Depuis ton dernier passage »

Raphaël lance plusieurs sessions et s'absente une nuit ou une journée. Le
bandeau en tête du cockpit dit ce qui a bougé pendant ce temps : chantiers
livrés, chantiers ouverts, messages des sessions (les siens ne comptent pas).

Deux choix à ne pas défaire : la date de visite n'est enregistrée QUE quand il
appuie sur « Vu » — mise à jour toute seule à l'affichage, le bandeau
disparaîtrait avant d'avoir été lu ; et la première ouverture n'annonce rien,
faute de repère, plutôt que de présenter tout le cockpit comme nouveau. La clé
`jarvis_cockpit_vu` est volontairement locale (déclarée dans
`STOCKAGE_LOCAL_ASSUME`) : c'est un repère de lecture propre à l'écran, pas
une préférence.

### Ce qu'on voit en ouvrant le cockpit, mesuré et pas supposé

Sur un écran de téléphone (390 × 844), les cartes empilées au-dessus du
tableau faisaient : fenêtre d'envoi 514 points, « Qui travaille » 132, journal
de bord 424, registre des erreurs 56. Le premier chantier commençait à **1 632
points du haut** — deux écrans pleins avant d'atteindre le résumé par section,
celui-là même qui avait été demandé pour ne plus avoir à faire défiler.

Trois changements, et le résumé s'affiche maintenant à 482 points, dans le
premier écran :

- `CarteRepliable` (`src/components/cockpit/CarteRepliable.tsx`) : les cartes
  secondaires sont repliées, mais **gardent leur badge sur la barre de titre**
  — une question en attente, une réservation à libérer se voient sans ouvrir.
  Elles s'ouvrent d'elles-mêmes quand elles ont quelque chose à dire.
- La fenêtre d'envoi ne montre le thème, la priorité et le bouton qu'une fois
  qu'il a écrit quelque chose : sa règle, « une étape à la fois, ne montre pas
  un contrôle qui appartient à une étape avant qu'elle soit atteinte ».
- `scripts/verifier-cockpit-reel.mjs` le monte sur les VRAIES données, lues à
  l'instant. Les données inventées d'un banc sont trop sages : le 5 sept., ce
  banc-là a trouvé ce que l'autre ne pouvait pas voir — la carte « Ce qui
  attend ta décision » faisait 616 points de haut pour UN point (un
  « pourquoi » d'un paragraphe, trois options, un champ, une photo) et
  repoussait le tableau à 1 382 points, là où le banc inventé en montrait 200.
  Il ne tourne pas dans la CI (il lit la base) : lance-le à la main après avoir
  touché au cockpit.
- `scripts/verifier-cockpit-web.mjs` monte le cockpit à SA VRAIE TAILLE
  (`?volume=1` : 83 chantiers, 9 sections) et un jour ordinaire
  (`&calme=1`) : tout ce qui rend une liste lisible se vérifie sur quatre
  chantiers et se casse sur quatre-vingts. C'est ce banc-là qui a trouvé les
  1 632 points ; ne le retire pas en ajoutant une carte au cockpit.

### « Où j'en suis » : quatre nombres par section, en tête du cockpit

Chantier `18a0aff1`, 5 sept. 2026. Ses mots : « je ne sais plus où mettre le
nez. Je travaille de tous les côtés et toi aussi et il y a des chantiers
ouverts de partout, mais je ne sais pas ce qui avance, ce qui n'avance pas. »

**Ce n'était pas un manque d'information.** Tout était déjà en base — la
réservation, `archived_at`, les marqueurs, les questions de `dev_log`. Le
cockpit montrait TOUT et ne répondait à RIEN. `src/lib/ouJenSuis.ts` (pur,
`scripts/verifier-ou-jen-suis.ts`) en tire quatre nombres par section :

- **bouge** — réservation en cours, non expirée ;
- **livré** — archivé dans la fenêtre choisie (réglage, plus bas) ;
- **pour toi** — marqueur `[À CADRER]` / `[A FAIRE PAR RAPHAEL]`, ou une
  question de session sans `answered_at` ;
- **dort** — ouvert, personne dessus, aucun marqueur bloquant.

**Les quatre ne forment pas une partition, et c'est voulu.** Un `[BLOQUÉ PAR]`,
un `[REPORTÉ]`, un `[DOUBLON]` n'est ni endormi ni en attente de lui : il n'est
compté nulle part. Et une **réservation expirée** n'est comptée ni dans
« bouge » (personne n'est dessus) ni dans « dort » (le chantier affiche encore
« Prise par… », donc aucune session ne le prendra) : elle ressort à part, avec
le bouton pour la libérer. **N'ajoute pas une cinquième colonne** — on
relirait un tableau au lieu de lire une réponse.

**Ce bloc a un BUDGET DE HAUTEUR, et il est mesuré.** Le résumé par section
commençait à 482 points du haut (390 × 844, un jour ordinaire). Il n'a pas
bougé : `verifier-cockpit-web.mjs` refuse qu'il descende plus bas. La place a
été **prise à ce qui faisait doublon**, pas ajoutée en bas de la pile — la
fenêtre d'envoi est devenue repliable (222 → 56 points), la carte « Qui
travaille en ce moment » a été absorbée (`SessionsAuTravail.tsx` supprimé), et
le journal de bord ne s'ouvre plus tout seul quand une question attend (elle
est comptée dans « pour toi », qui dit sur quel chantier elle porte). Un jour
chargé, le tableau est passé de 850 à 502 points. **Si tu ajoutes une carte au
cockpit, prends sa place quelque part.**

Le seul réglage introduit est la fenêtre de la colonne « livré » (Paramètres ›
Le cockpit, `jarvis_cockpit_fenetre`, défaut « aujourd'hui ») : « aujourd'hui »
veut dire depuis minuit LOCAL, et à une heure du matin le travail de la soirée
tomberait à zéro au moment précis où il vient voir ce qui s'est passé.

Le filtre du tableau vit désormais dans `CockpitPage`, pas dans
`CockpitBoard` : une ligne de « Où j'en suis » doit pouvoir l'imposer.

### Les marqueurs des notes sont visibles dans l'app (`src/lib/marqueurChantier.ts`)

`[À CADRER AVEC RAPHAËL]`, `[LIBRE]`, `[BLOQUÉ PAR : …]`, `[DOUBLON — …]`,
`[REPORTÉ]`, `[A FAIRE PAR RAPHAEL]` : ces marqueurs commandent le
comportement des sessions depuis le début, et l'app n'en disait rien — il
fallait déplier une cinquantaine de notes pour répondre à la seule question
que Raphaël se pose en ouvrant le cockpit : « qu'est-ce qui attend une
décision de moi ? » (onze chantiers, au 4 sept.). Ils s'affichent maintenant
en étiquette sur la ligne, et le filtre les compte.

**Lecture seule, et seulement en TÊTE de la note** : le marqueur se lit dans
le ou les crochets qui ouvrent les notes, jamais ailleurs. Une note longue
cite souvent un autre chantier en écrivant « [LIBRE] » au passage — le prendre
pour le marqueur du chantier ferait démarrer une session sur un sujet qu'il
voulait cadrer d'abord. Le contrôle hors réseau garde exactement ce cas.

### Un chantier porte sa conversation

Les messages du journal rattachés à un chantier (`dev_log.item_id`) existaient
depuis le début, mais ne se lisaient que dans le flux général, mélangés aux
autres : une question posée par une session sur un chantier ne se voyait pas
sur le chantier. Elle s'affiche maintenant dans la carte dépliée, avec la
session qui l'a posée, et Raphaël répond depuis là (`kind: "reponse"`, même
`addEntry` que le journal — pas un second chemin d'écriture). Une question
restée sans réponse se signale sur la ligne repliée : c'est la seule chose qui
bloque une session, donc la seule qui doive se voir sans déplier.

Les libellés, couleurs, l'âge en clair et le nom court d'une session sont dans
`src/lib/journalBord.ts`, partagés par le flux et les cartes — deux copies
finiraient par dire deux choses du même message.

### « Ça existe déjà » à la saisie (`src/lib/doublonChantier.ts`)

Pendant qu'il écrit, la fenêtre d'envoi montre les chantiers proches — les
ouverts ET **les archivés**, ces derniers en premier : redemander une chose
déjà livrée fait tout refaire à une session, et parfois défaire ce qui
marchait. Comparaison de mots, locale, jamais un appel au modèle. Elle ne
bloque rien et se tait dès qu'il n'y a qu'un mot courant en commun — un
avertissement qui se déclenche à tort n'est plus lu du tout. Elle n'attrape
que la redite littérale : deux demandes qui disent la même chose avec un autre
vocabulaire ne se ressemblent pas pour elle, et c'est écrit dans son en-tête.

### Et les doublons DÉJÀ en base (`src/lib/doublonsExistants.ts`)

La fenêtre d'envoi ne voit que ce qu'on tape. Un chantier **dicté à la voix**
n'entre pas par là : le 5 sept., deux « Sous-sections pour sessions multiples
Claude Code » cohabitaient dans sa base, mot pour mot. La carte « Ça existe
déjà » du cockpit les signale, propose d'archiver le plus récent (avec
confirmation et « Annuler »), et **ne s'affiche pas du tout** quand il n'y a
rien.

**Les deux mesures ne sont pas la même, et il ne faut pas les confondre.** À la
saisie, le recouvrement est rapporté au PLUS COURT des deux textes, exprès,
pour attraper une phrase à peine commencée. Appliquée à des titres complets,
cette mesure sort **14 paires sur les 192 chantiers réels, dont une seule
vraie**. La mesure symétrique (Jaccard sur les deux titres) en sort 7 à 0,30,
2 à 0,50, et exactement 1 à 0,60 — la bonne. D'où `SEUIL_DOUBLON = 0,60`, et
la consigne de refaire la mesure sur des données réelles avant de le baisser.

**Piège du banc d'essai, à connaître avant d'ajouter des données factices :**
`motsUtiles()` retire les chiffres. Les 83 chantiers du mode `?volume=1` ne
variaient que par un numéro — ils étaient donc tous identiques à la
comparaison, et la carte en signalait cinq qui n'existaient que dans le banc.
Un jeu d'essai doit être distinct **après normalisation**, pas seulement à
l'œil : trois listes de longueurs premières entre elles (11, 12, 13) donnent
83 titres dont aucune paire ne se ressemble.

### Une tâche perso qui est en fait un chantier (`src/lib/tacheOuChantier.ts`)

Au 5 sept. 2026, **six de ses 29 tâches étaient des demandes adressées à
Claude** — la commande vocale avait compris « ajoute une tâche » là où il
disait « ajoute un chantier ». L'une d'elles, « connexion entre mon Jarvis et
celui de Mélissa », n'existait nulle part ailleurs : sa demande dormait dans sa
liste de courses depuis sa dictée, invisible de toutes les sessions.

L'onglet Tâches signale ces lignes, dit **ce qui les a fait reconnaître**, et
propose « en faire un chantier ». La tâche est alors marquée **faite, jamais
supprimée** : c'est sa liste, il doit retrouver ce qu'il a dicté.

**Ce qui compte le plus est ce qu'il ne faut PAS signaler.** Raphaël est dans
l'immobilier : chez lui « chantier » veut d'abord dire maçonnerie. « Appeler le
chantier de la villa Dan », « commander les carreaux pour le chantier » sont de
vraies tâches, et quatre contrôles gardent ce cas. Seules les tournures qui
**annoncent une demande faite à Claude** sont retenues. Mesure sur ses 29
tâches réelles : 6 signalées, 6 justes, 0 à tort.

`doublonChantier.ts` sert maintenant aux deux listes (`EntreeComparable` :
un titre, des notes, rien de plus) — trois « racheter un spot pour l'entrée »
identiques dormaient dans ses tâches pendant que le cockpit prévenait depuis
des jours.

### Les actions groupées et le « Annuler »

Le bouton « Choisir » du cockpit passe le tableau en mode sélection : tout se
déplie (on ne coche pas ce qu'on ne voit pas), chaque ligne porte une case, et
une barre collée en bas agit sur le lot — statut, section, archivage,
suppression.

Deux règles :

- **Une requête par lot, jamais une par chantier** (`updateManyDevItems`,
  `archiveManyDevItems`, `deleteManyDevItems`, qui passent tous par `.in("id",
  ids)`). Vingt allers-retours pour reclasser un thème laisseraient le travail
  à moitié fait si la connexion lâche au milieu.
- **Chaque action groupée mémorise l'état d'avant et propose « Annuler »**
  (`src/lib/annulation.ts`, huit secondes). `restoreDevItems` regroupe les
  chantiers par état d'origine et envoie une requête par groupe : un lot
  mélange des chantiers qui n'avaient ni le même statut ni la même section, et
  leur rendre une valeur commune serait pire que ne rien annuler. Un `upsert`
  serait plus court et faux — PostgreSQL construit d'abord la ligne à insérer
  et la refuserait faute de titre.

### La section suggérée à la saisie (`src/lib/suggestionTheme.ts`)

Calcul **local**, jamais un appel au modèle : ranger un chantier n'a pas à
consommer le quota gratuit qui a déjà laissé Raphaël sans Jarvis le 3 sept. La
suggestion s'appuie sur le vocabulaire des chantiers déjà rangés, elle affiche
les mots sur lesquels elle s'appuie, et **elle se tait quand rien ne se
détache** — une suggestion fausse est acceptée sans être relue, donc elle coûte
plus cher qu'une absence de suggestion.

## Les contacts viennent du TÉLÉPHONE, plus d'un carnet dans Jarvis

Décision de Raphaël, 5 sept. 2026, à ne pas rouvrir : « ça ne sert à rien,
sachant que tu as déjà une mémoire active dans Jarvis qui retient tout ce
qu'on dit. À partir du moment où il est connecté au téléphone à mes contacts,
il sait tout. »

Le carnet d'adresses de Jarvis (table `contacts`, onglet dédié) dupliquait deux
choses qui existaient déjà ailleurs et mieux : les **numéros**, qui sont dans
le répertoire du téléphone, et ce qu'il dit des **gens**, que la mémoire longue
durée retient toute seule sans qu'il ait à dicter une fiche. Onglet, route,
page et les quatre actions vocales `list/add/update/delete_contact` sont
retirés (commits `8d5441c`, `24185f7`).

- `ActionsTelephonePlugin.lireContacts()` (permission `READ_CONTACTS`) lit le
  répertoire **à la demande** et n'en copie rien. Recopier en base recréerait
  la deuxième source de vérité qu'on vient d'enlever.
- `src/lib/chercherContact.ts` est **pur** : composer le numéro de quelqu'un
  d'autre est l'erreur qu'on ne rattrape pas. Deux homonymes → on demande
  lequel. Un fragment (« Yo ») ne trouve rien. Plusieurs numéros → le mobile,
  jamais le premier de la liste.
- `src/lib/repertoire.ts` distingue **refus de permission** et **aucun
  contact** : rendre une liste vide sur un refus ferait dire à Jarvis « tu n'as
  personne » alors qu'il n'a pas regardé.
- Côté serveur, la consigne dit désormais de **ne jamais réclamer un numéro**
  et de passer `contact_name` : le modèle ne voit pas le répertoire, le
  téléphone si. C'est l'inverse exact de ce qu'elle disait avant, et c'est
  cette consigne-là qui faisait répondre « il faut que tu me donnes son
  numéro ».

La table `contacts` n'est pas supprimée (vide, sans coût, et une suppression de
table ne se défait pas) : à faire seulement sur sa demande explicite.

## Les autorisations du téléphone : un seul écran, jamais par surprise

Livré le 5 sept. 2026 (chantier `e399b670`). Sa demande : « quand on installe
l'application, on fait une sélection directement des autorisations via le
téléphone directement ». Et la moitié qu'on oublie en la lisant vite : il
REFUSE qu'on recopie ses données (contacts, applications) dans l'environnement
de Jarvis. Une autorisation de LECTURE, donnée une fois ; rien n'est importé.

Trois pièces, et la frontière entre elles compte :

- `src/lib/autorisationsTelephone.ts` — le catalogue, dit **par l'usage**
  (« appeler et écrire à tes contacts », pas READ_CONTACTS), et les décisions
  pures : que demander, quel bouton afficher, quoi écrire. Vérifiable sans
  téléphone.
- `android/.../AutorisationsPlugin.java` — l'état réel, la demande groupée,
  et l'ouverture du bon écran d'Android.
- `src/components/settings/Autorisations.tsx` — la liste, **partagée** entre
  l'écran de premier lancement (`src/components/PremierLancement.tsx`, monté
  dans `ProtectedShell`) et la carte de Paramètres. Deux écrans qui diraient
  la même chose autrement finiraient par ne plus la dire pareil.

Quatre choses à ne pas défaire :

1. **Un refus définitif n'affiche jamais « Autoriser ».** Android ne
   réaffiche plus la fenêtre après un refus — le bouton serait mort, et rien
   ne le dirait. C'est le piège déjà vécu avec les notifications. La ligne
   envoie vers les réglages système, et dit pourquoi.
2. **La position en arrière-plan ne part JAMAIS dans le même lot que la
   position.** À partir d'Android 11 le système rejette le lot entier, sans
   afficher la moindre fenêtre : sur le téléphone ça se lit comme un refus de
   Raphaël. Elle se demande seule, après.
3. **L'état des notifications se lit avec `areNotificationsEnabled()`**, pas
   avec `checkSelfPermission` : avant Android 13 la permission n'existe pas,
   et il peut couper les notifications depuis les réglages sans qu'elle
   change.
4. **Quand Android ne dit pas l'état, on le dit** (« Non vérifiable »,
   `connue: false`) au lieu d'annoncer un refus qui n'en est peut-être pas
   un — certaines surcouches constructeur répondent de travers sur les accès
   spéciaux.

L'ASSISTANT DU TÉLÉPHONE n'est PAS dans cette liste, et il ne faut pas l'y
remettre : c'est un rôle Android, pas une autorisation, et une application ne
peut ni se l'attribuer ni se le retirer. Il a sa carte à lui, qui lit l'état
réel par `RoleManager` — Paramètres › Ce que Jarvis utilise › « L'appui long
sur la touche latérale ».

Pas d'autorisation par application tierce, et c'est explicite dans sa
demande : ouvrir une app et lui passer un texte marche déjà sans permission,
pour n'importe laquelle, sans code par app.


## Jarvis n'annonce JAMAIS au passé ce qu'il n'a pas constaté

Ses mots, 6 sept. 2026 : « il me dit qu'il a envoyé un message alors que ce
n'est pas vrai. […] sur WhatsApp, ça prépare le message mais il n'y a rien qui
est envoyé. » Le reste de ce qu'il signale, ce sont des choses qui ne marchent
pas ; celle-ci est une chose qui MENT, et elle ruine la confiance dans tout ce
qui marche.

**Le journal a déplacé le diagnostic, et c'est la leçon à garder.** À 05:53:04
l'outil a rendu « Message prêt pour Mel Ma Femme ❤ sur WhatsApp, tu n'as plus
qu'à envoyer » — **notre phrase était honnête**. C'est le MODÈLE qui l'a
remise au passé en la disant à voix haute. Corriger le texte de l'application
n'aurait rien changé. Et il était en mode **Live** : une règle écrite seulement
dans `voice-command` aurait été vraie au micro et fausse en Live.

D'où `supabase/functions/_shared/honnetete.ts` — **une seule source**, importée
par `voice-command` ET `live-jeton`, comme `environnement.ts` et
`corrections.ts`. Quatre points, et il faut les quatre : préparer n'est pas
envoyer ; reprendre le retour de l'outil TEL QUEL au lieu de le reformuler ;
dire qu'on n'a pas eu de retour quand l'outil ne rend rien (à 05:50:56 et
05:53:14 il rendait une chaîne VIDE, et le modèle comblait) ; trois issues,
trois phrases — préparé, fait, échoué.

`scripts/verifier-honnetete.ts` garde la règle ET son arrivée dans les deux
consignes, plus deux contrôles bout-en-bout sur la fonction déployée.

**Limite connue, à ne pas présenter comme réglée** : `onCommande` peut encore
rendre une chaîne vide (`src/lib/live/sessionLive.ts`, alimenté par
`MicButton`). La consigne dit au modèle quoi faire de ce vide, mais la vraie
correction est de ne jamais le produire — chantier ouvert.

## « À quoi tu es branché ? » — l'état RÉEL, pas la description de l'app

Sa remarque du 6 sept. 2026 : « Jarvis ne connaît toujours pas son propre
environnement sur certains points. Par exemple quand je lui demande à quoi il
est branché. »

`environnement.ts` décrit l'APPLICATION — ses onglets, ses cartes. C'est un
texte figé, le même pour tout le monde. `_shared/branchements.ts` dit l'ÉTAT de
SON installation : compte Google et ce qu'il autorise, applications choisies,
mode Live. **Tout se lit en base** — ses réglages y sont recopiés depuis la
migration 0014 —, donc sans rien demander à l'app et sans toucher au contexte
que MicButton envoie. Joint par `voice-command` ET `live-jeton` (en Live le
contexte est scellé à l'ouverture : ce qui n'y est pas ne se rattrape plus).

**Ce que le serveur NE VOIT PAS, le bloc le dit en toutes lettres** : les
autorisations Android, le service d'accessibilité, la version installée. Ils
vivent sur l'appareil. Jarvis répond « je ne peux pas les voir, regarde dans
Paramètres » — inventer une réponse ici serait exactement le défaut corrigé
juste au-dessus.

Court, et sans titre vide : chaque phrase envoie déjà ~45 000 caractères.

## WhatsApp ou WhatsApp Business : on ne devine pas

Le 6 sept., ses messages partaient dans WhatsApp Business. `preparerWhatsApp`
posait pourtant `setPackage("com.whatsapp")` — **mais sur l'autre branche**.
Le chemin utilisé quand on connaît le numéro ouvre un lien `wa.me`, une adresse
https ordinaire que les DEUX WhatsApp déclarent : Android choisissait. C'est ce
qui rendait le symptôme incompréhensible, et pourquoi il fallait établir quel
chemin servait avant de corriger quoi que ce soit.

Les deux branches visent maintenant le même paquet, `com.whatsapp.w4b` est
déclaré dans `<queries>` (sans quoi on ne peut pas savoir qu'il est installé),
et **quand les deux sont là sans qu'il ait choisi, Jarvis DEMANDE** au lieu de
prendre le premier : se tromper d'application, c'est un message écrit dans une
app qu'il n'ouvre jamais, sans que rien ne le signale. La ligne WhatsApp de
« Tes applications par défaut » ne s'affiche que s'il en a vraiment deux.

## Appeler quelqu'un : deux garde-fous, écrits après un vrai appel au répondeur

Le 5 sept. 2026 à 21 h 07, Raphaël a dit « appelle ma femme ». La
reconnaissance a écrit « Jarvis appelle mail ». L'appel est parti vers
+972544151000 — le répondeur. C'est exactement l'erreur que `chercherContact.ts`
dit vouloir éviter depuis le début : « composer le numéro de quelqu'un d'autre
est le genre d'erreur qu'on ne rattrape pas. »

**Ce que le journal a montré, et qui change le diagnostic** : la réponse est
venue de `commandeLocale.ts` (`source: "locale"`), pas du serveur. La consigne
du modèle, qui sait distinguer un prénom d'un mot-clé, n'a jamais été
consultée. Un correctif écrit uniquement dans le prompt n'aurait rien changé.
**Avant de corriger une commande vocale, regarde d'où la réponse est venue.**

Deux garde-fous, dans `src/lib/chercherContact.ts`, et il faut les deux :

1. **Les entrées SYSTÈME du répertoire ne sont pas des personnes.** La
   messagerie de l'opérateur porte des noms faits de mots courants (« Voice
   Mail »), donc elle gagne contre un prénom mal entendu. Elles sont sorties
   AVANT toute comparaison. Cette liste est forcément incomplète — d'où le
   second.
2. **Un seul mot dit, et c'est un mot d'APPAREIL** (mail, message, sms, appel,
   téléphone…) : ce n'est pas quelqu'un qu'on a nommé, c'est une commande mal
   entendue. On ne compose rien, et `commandeLocale.ts` rend la main au
   serveur, qui demandera.

**Ce qui ne doit JAMAIS entrer dans `MOTS_APPAREIL`** : les façons de désigner
une personne. « femme », « frère », « maman », « docteur » restent valides —
« appelle ma femme » trouve « Mel Ma Femme ❤ », et un contrôle le garde.

**Et il fallait encore deux appuis pour qu'un appel parte.** Le premier était
le sélecteur « Terminer l'action avec… » d'Android — il a ZoiPer en plus du
téléphone, et aucune application par défaut ; le second, l'écran d'appel,
faute de permission `CALL_PHONE`. D'où : `composer()` vise l'application
choisie (`jarvis_app_appels`, avec repli si elle refuse l'intent), la carte
« Tes applications par défaut » a une ligne **Appels** — la seule des quatre
qui se CHOISIT à l'écran, parce que Jarvis ne la demande jamais à l'oral —, et
la permission se donne d'un geste depuis « Autorisations du téléphone ».

## Chercher passe par les IA de son téléphone, jamais par une API

Sa décision du 5 sept. 2026, à ne pas rouvrir : « je ne veux pas payer, je
veux profiter des applications que je paye déjà ». Et le mécanisme, qu'il a
décrit lui-même : « dans les paramètres on branche toutes nos applications
d'IA disponibles sur notre téléphone et on valide une application favorite
pour les recherches web […] ou bien si je mentionne le nom d'une autre
application ça lance via l'application citée ».

**IL N'Y A RIEN À BRANCHER, et c'est le point qu'on se remet à chercher.**
Android n'offre à aucune application le moyen d'interroger le compte d'une
autre, et l'abonnement grand public de Perplexity ne donne pas accès à son API
(vérifié le 5 sept. : les crédits inclus dans Pro ont été retirés). Ce qui
marche est gratuit et existait déjà : `ask_ai` envoie la question à
l'application par un intent, elle répond avec SON abonnement, il rapporte la
réponse par le partage Android (`allerRetourIA.ts`).

`src/lib/appsIA.ts` (pur) reconnaît donc les IA parmi les applications
installées, et `ConnecteursIA.tsx` les montre. **Aucun état « connecté »
n'est inventé** : la seule chose enregistrée est la favorite, dans
`jarvis_app_ia` — la clé qui existait déjà, qui était fixée à l'oral et
invisible dans Paramètres (c'est elle qui a fait écrire la règle des
réglages). La ligne « Question à une IA » a quitté « Tes applications par
défaut » dans le même travail : deux façons de régler la même chose finissent
par ne plus dire pareil.

Deux règles que `verifier-apps-ia.ts` tient : la liste des IA connues MET EN
AVANT, elle ne limite jamais (« en vrai on peut même le faire pour toutes les
applis ») ; et hors de l'app on dit « je n'ai pas pu regarder », jamais « tu
n'as aucune application d'IA » — la même distinction que `repertoire.ts` pour
les contacts.

Côté consigne : « cherche X » part vers la favorite, « cherche X sur Y » vers
l'application citée, et **« sur internet » n'est pas un nom d'application**.

## Appuyer sur l'écran à sa place : une capacité GÉNÉRALE, pas un bouton WhatsApp

Livré le 6 sept. 2026 (chantier `3f3ad20b`). Sa demande, en deux temps. Le
5 sept. : « j'aimerais pousser encore un peu plus loin pour savoir s'il peut
défiler l'écran en lui disant "attends, vas-y lance la deuxième vidéo", et ça
lance la deuxième vidéo. » Puis le 6, qui élargit : « il faut aussi que ça
puisse faire une activation de clics tout simplement sur le téléphone à la
demande orale, et ça ce n'est pas là pour n'importe quoi, **pas que pour
WhatsApp** ».

D'où UNE brique et pas deux, et la frontière entre ses morceaux compte :

- `JarvisAccessibiliteService.java` — l'arbre de l'écran, le clic, le
  défilement. Il ne DÉCIDE rien.
- `src/lib/ecranTelephone.ts` — **pur** : quel élément répond à « la deuxième
  vidéo », et surtout quand il ne faut appuyer sur RIEN.
- `src/lib/listeNoire.ts` — **pur** : où Jarvis n'a pas le droit d'appuyer.
- `src/lib/controleEcran.ts` — le pont et l'enchaînement complet.
- `src/components/settings/ControleEcran.tsx` — l'état réel + la liste noire.

### La règle de sûreté est dans le module pur, et elle ne se négocie pas

Rien trouvé, deux éléments qui se valent, écran changé depuis la lecture : on
ne clique sur RIEN et on le dit. **La moitié de `verifier-ecran.ts` vérifie ce
silence, pas la détection** — un clic de travers dans une application ouverte
est une action qu'on ne rattrape pas.

Trois choses à ne pas défaire :

1. **« La deuxième vidéo » n'est pas « le deuxième élément cliquable ».** Sur
   une page de résultats YouTube, le premier cliquable est la loupe de
   recherche : compter à partir d'elle décale tout d'un rang et lance la
   mauvaise vidéo. Un rang dit sans autre précision ne compte donc que ce qui
   est DANS une liste qui défile (`dansListe`, posé par le service quand un
   ancêtre est `scrollable`) — le contenu, pas la barre d'outils. Ça marche
   sans rien connaître de YouTube ni d'aucune autre application.
2. **On ne départage pas deux libellés par leur longueur.** « Envoyer » gagne
   contre « Envoyer un fichier » parce qu'il ne dit RIEN DE PLUS que ce qui a
   été demandé, pas parce qu'il est plus court. La règle par la longueur, qui
   est la bonne pour retrouver une application par son nom
   (`trouverApplication`), choisirait ici « Supprimer ici » plutôt que
   « Supprimer tout » au hasard.
3. **`cliquer()` relit l'arbre et refuse si le libellé a changé de rang.**
   Entre la lecture et le clic, une vidéo finit de charger, une notification
   arrive. Sans cette relecture, on appuierait sur ce qui a glissé à la place.

### Il n'y a PAS de fenêtre d'annulation ici, et ce n'est pas un oubli

La fenêtre (`actionsTelephoneFenetre.ts`) est un bandeau affiché DANS Jarvis.
Quand Jarvis appuie sur l'écran de YouTube, c'est YouTube qui est au premier
plan : le bandeau n'est visible nulle part. L'afficher quand même donnerait le
pire des deux mondes — trois secondes d'attente à chaque clic, et rien à voir
ni à toucher. Les garde-fous réels sont les trois points ci-dessus, la liste
noire, et le fait que Jarvis **dit à voix haute sur quoi il vient d'appuyer,
nommément** — « reviens en arrière » étant lui-même une commande qu'il sait
faire, c'est le vrai chemin de rattrapage, et il marche pendant qu'il regarde
l'autre application.

### La liste noire, telle qu'il l'a décidée le 3 sept.

**Liste noire, pas liste blanche** : autorisé partout, interdit sur la banque,
les portefeuilles et les mots de passe, qu'il complète à la voix
(`block_screen_app`). C'est pour ça que `accessibilite.xml` ne déclare
**aucune** liste d'applications : filtrer là serait une liste blanche.

**Et les entrées d'origine se retirent.** Une liste imposée qu'on ne peut pas
défaire finit par bloquer quelque chose de légitime sans recours.

**Ce qui lui est dit une fois, en toutes lettres, dans la carte** : la liste
est appliquée par NOTRE code — elle empêche vraiment Jarvis d'agir — mais le
service d'accessibilité garde techniquement la visibilité sur l'écran. Aucune
application ne peut se restreindre elle-même là-dessus.

### Ce que ça ne fait pas, et qu'il ne faut pas présenter comme livré

**Rien de tout ça n'est vérifié sur l'appareil** : il n'y a pas de SDK Android
ici, la CI prouve que ça compile, pas que ça clique. Et le service ne
s'active pas tout seul — c'est un accès spécial qu'il accorde une fois dans
les réglages d'Android (Paramètres › Ce que Jarvis utilise › « Appuyer sur
l'écran à ta place » y renvoie). **Il faut une vraie APK**, la mise à jour
rapide ne remplace pas la coquille Android.

## La bulle flottante, et pourquoi il n'y a PAS d'interrupteur pour l'appui long

Livrée le 5 sept. 2026 (chantier `f5621562`, partie b). Sa demande, quand je
lui proposais de CHOISIR entre l'appui long et la bulle : « oui et aussi
l'option bulle flottante, les deux doivent être disponibles tant que ce n'est
pas fonctionnel à 100 %, et simplement par possibilité de changer à tout
moment. » Les deux coexistent donc, et l'un ne remplace pas l'autre.

`BulleService.java` (la pastille, posée par WindowManager), `BullePlugin.java`
(l'état réel et le démarrage), `src/lib/bulleFlottante.ts` (le pont et les
décisions pures), `src/components/settings/BulleFlottante.tsx`.

Quatre choses à ne pas défaire :

1. **Un service de PREMIER PLAN, pas un service ordinaire.** Une vue posée par
   WindowManager vit dans le processus de l'app ; sans lui, Android tue ce
   processus en arrière-plan et la bulle disparaît au bout de quelques
   minutes, en silence. Et depuis Android 14 un service de premier plan sans
   `foregroundServiceType` refuse de démarrer — d'où `specialUse` et sa
   propriété dans le manifeste.
2. **`FLAG_NOT_FOCUSABLE`.** Sans lui, la bulle vole le clavier : taper un
   message dans WhatsApp devient impossible tant qu'elle est affichée.
3. **L'état vient du SYSTÈME, jamais du réglage.** L'autorisation « afficher
   par-dessus les autres applications » se retire depuis Android sans que
   l'app en sache rien, et un appui long sur la bulle la range sans passer par
   Paramètres. Un interrupteur qui affiche ce que le réglage prétend dirait
   « Activé » au-dessus d'un écran vide.
4. **Il n'y a PAS d'interrupteur pour l'appui long à côté, et ce n'est pas un
   oubli.** C'est le rôle `android.app.role.ASSISTANT`, déclaré
   `requestable="false"` dans le `roles.xml` d'AOSP : une application ne peut
   ni se l'attribuer ni se le retirer, et l'écran qui y mène directement est
   protégé par une permission de signature. Un interrupteur y serait soit
   décoratif, soit menteur. Sa carte à lui (« L'appui long sur la touche
   latérale ») lit l'état réel par `RoleManager` et ouvre le meilleur écran
   système atteignable.

## Une commande mal entendue reste rattrapable, sans jamais poser de question

`src/lib/actionsTelephoneFenetre.ts` (pur) + `actionsTelephoneToast.ts` (le
bandeau). Raphaël a ÉCARTÉ la confirmation que je proposais, le 5 sept. :
« aucune limite dans le sens où il doit faire tout ce que je demande sans
limite ». Ce module ne la réintroduit pas : rien n'attend son accord, le
décompte fini l'action part toute seule.

Ce qui reste vrai malgré sa décision : une commande MAL ENTENDUE n'est pas une
commande demandée — le 5 sept. entre 17 h 59 et 18 h 20, quatre tentatives ont
ouvert deux fois l'application מכבי. Jarvis annonce donc ce qu'il fait, en
NOMMANT la cible (c'est le seul mot qui permet de repérer l'erreur), et laisse
quelques secondes. Seules les actions qui SORTENT vers une autre application y
passent ; `media_control` et `set_alarm` non, sans quoi Jarvis serait lent
partout. Le délai est un réglage, et « Immédiat » est disponible en un appui.

## Supprimer demande toujours, partout dans l'app

`src/components/ConfirmerAction.tsx` : la fenêtre qui pose la question avant
une action qu'on ne peut pas défaire. Elle porte aussi le choix qui accompagne
certaines suppressions — « où vont les chantiers de cette section ? » — dans la
même fenêtre que la confirmation, pas dans une étape de plus.

Il n'y en avait **aucune** dans l'app jusqu'au 4 sept. : chantiers, tâches,
contacts, documents, corrections de prononciation, rappels de lieu se
supprimaient au premier appui, sans un mot. Sur un téléphone la corbeille est à
trois millimètres du crayon, et aucune de ces choses n'a d'archive — sauf les
chantiers.

**Toute nouvelle corbeille passe par ce composant.** Le texte dit ce qui va
disparaître, nommément, et propose l'issue moins radicale quand elle existe
(« archive-le plutôt »).

## Les prompts des sessions parallèles

Quand Raphaël ouvre plusieurs sessions d'un coup, une par thème, les prompts
qu'il colle et le découpage des fichiers qui évite les collisions sont dans
`docs/prompts-sessions.md`. Si tu ouvres un nouveau front, mets ce fichier à
jour dans le même commit.

## Travail en parallèle : réserver un chantier et se parler

Plusieurs sessions Claude Code travaillent souvent sur ce repo en même temps.
Deux règles évitent qu'elles se marchent dessus ou qu'elles s'attendent.

**Avant de toucher à un chantier, le réserver.** La prise est atomique : si
deux sessions appellent en même temps, une seule obtient `true`.

```bash
scripts/sql.sh "select claim_dev_item('<id du chantier>', '<nom de ta branche>', 120)"
```

`false` = une autre session est déjà dessus, prends-en un autre. La réservation
expire après le délai en minutes, pour qu'une session interrompue ne bloque
rien ; renouvelle l'appel si tu dépasses. Quand tu t'arrêtes ou que tu
termines :

```bash
scripts/sql.sh "select release_dev_item('<id>', '<ta branche>')"
```

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

```bash
scripts/sql.sh "insert into dev_log (user_id, item_id, author, kind, body) select user_id, null, '<ta branche>', 'question', 'Tu es toujours sur X ? Je voudrais toucher a Y.' from dev_items limit 1"
```

(le `select ... from dev_items limit 1` évite d'avoir à connaître le `user_id`
en dur ; mets l'id du chantier concerné à la place du `null` s'il y en a un)

**Piège, vérifié à ses dépens le 3 sept. 2026 :** ce `limit 1` porte sur le
résultat entier, pas sur le `user_id`. Il ne convient donc QU'À une insertion
d'une seule ligne. Pour en insérer plusieurs d'un coup — `insert … select …
from (values …)` — il ne laisse passer que la première, **sans aucune erreur** :
on croit avoir créé six chantiers, il y en a un. Écris alors le `user_id` en
sous-requête scalaire, et pas de `limit` du tout :

```sql
insert into dev_items (user_id, title, notes, status, priority, theme)
select (select user_id from dev_items limit 1), v.title, v.notes, 'todo', v.priority, v.theme
from (values ('Titre A', 'Notes A', 'normal', 'Thème'),
             ('Titre B', 'Notes B', 'high',   'Thème')) as v(title, notes, priority, theme);
```

Et relis toujours ce que tu viens d'écrire dans un appel séparé : `exec_sql`
ne renvoie pas le nombre de lignes touchées.

Autre facilité pour du texte long : `scripts/sql.sh` lit aussi son SQL sur
l'entrée standard (`scripts/sql.sh < requete.sql`). Une note de chantier avec
des apostrophes, des guillemets et des retours à la ligne passe ainsi sans
bataille d'échappement — et les délimiteurs `$n$ … $n$` de Postgres évitent
d'avoir à doubler les apostrophes.

`kind` vaut `question`, `reponse`, `info` ou `blocage`. Renseigne `answered_at`
quand tu réponds à une question. Le journal est visible dans l'app, en bas du
cockpit : Raphaël y écrit aussi ses consignes, **lis-le en début de session**
en même temps que les chantiers.

**Ne prends pas un gros lot d'un coup.** Réserve ce que tu traites maintenant
et laisse le reste libre, pour qu'une autre session puisse avancer en
parallèle au lieu d'attendre après toi.

## Les sessions autonomes : ce qui avance pendant ses absences

Livré le 6 sept. 2026 (chantier `59d8587f`). Sa demande dictée : « Tout les
chantiers ne nécessitant pas l'action de traiter des chantiers disponibles a
travailler doivent etres travailler seul afin de gagner du temps en
developpement sur les temps mort de ma présence ». Sa réponse, le 6 sept. à
00 h 05 : « **Oui en continue même la journee. Éviter de lancer une session si
une autre en est deja en cours et est disponible** pour plusieurs raison : ne
pas consommer trop de crédit claude code, ne pas augmenter le nombre de session
qui deviendrais sûrement inactive a la fin de la tâche ».

Un déclencheur horaire (une Routine, visible dans ses Routines sur claude.ai)
ouvre une session fraîche. **Tout le reste existait déjà** — marqueurs,
réservation, hook de démarrage, CI sur toutes les branches, `demander.sh` pour
ne pas bloquer sur un arbitrage. Il ne manquait que quelqu'un pour ouvrir la
session.

- `docs/session-autonome.md` — la consigne que suit cette session. Versionnée
  exprès : une consigne se relit avant de prendre effet, elle ne se lit pas
  depuis une ligne de base que personne n'a revue.
- `src/lib/passeAutonome.ts` — **la décision, pure**. Vérifiée hors ligne par
  `scripts/verifier-sessions-autonomes.ts`.
- `scripts/passe-autonome.ts` — le premier geste d'une session autonome, en UN
  appel à la base : `--demarrer` répond `travaille` (code 0) ou se retire
  (code 3). Un verdict autre que `travaille` veut dire « n'ouvre aucun
  fichier » : chaque tour de plus est du crédit dépensé pour rien.
- Migration `0024_passes_autonomes.sql` — la trace des passes, et
  `etat_pour_passe_autonome()`.
- `src/components/settings/SessionsAutonomes.tsx` — l'interrupteur et ce qui
  s'est passé (Paramètres › Le cockpit).

**Le marqueur `[LIBRE]` se lit en TypeScript, jamais en SQL**, et c'est le
point à ne pas défaire. `marqueurDe` est la seule lecture des marqueurs du
projet, celle que le cockpit affiche. En écrire une seconde en SQL, c'est
accepter qu'elles divergent un jour — et le jour où elles divergent, une
session autonome code un chantier qu'il voulait d'abord trancher avec nous.
D'où une fonction SQL qui rend l'ÉTAT (réglage, réservations, passes ouvertes,
chantiers avec leurs notes) et un module TypeScript qui décide.

**Une passe qui se retire s'enregistre elle aussi**, et c'est voulu : sans ça
« il n'y avait rien à faire cette nuit » et « le déclencheur ne tourne plus
depuis trois jours » se ressemblent parfaitement. La carte le dit
(« Plus rien ne passe » au-delà de 200 minutes de silence alors que c'est
allumé). Ces passes vivent dans leur propre table et **pas dans `dev_log`** :
le hook de démarrage n'injecte que les douze dernières entrées du journal, et
une passe par heure chasserait en une demi-journée ses consignes, les questions
qui attendent sa décision et les messages entre sessions.

**Les sujets qu'une session autonome ne prend jamais**, même marqués `[LIBRE]` :
contrôle du téléphone, accès aux applications, envoi de messages en son nom,
clonage vocal, toute dépense. Ils se discutent avec lui, et une session ouverte
par un déclencheur n'a personne à qui parler. On ratisse volontairement large —
un chantier écarté à tort attend la prochaine session qu'il ouvre, ce qui ne
coûte rien ; un chantier pris à tort part pendant qu'il dort.

Le déclencheur est la Routine `trig_01AbpcwCgpLeVMTtyCfqRguQ`, une fois par
heure, et elle réveille **une session persistante qui porte le dépôt**
(`session_01HbJWrhPvY3kn3jzuCdyBWH`).

**Une Routine qui ouvre une session FRAÎCHE ne lui donne pas le dépôt**, et
c'est la première version de ce déclencheur : deux tirs pour rien, le 6 sept.
`create_trigger` avec `create_new_session_on_fire` pose un `sources: []` — la
session démarre dans un conteneur vide, sans `scripts/`, sans CLAUDE.md. Le
piège est silencieux trois fois : la Routine se déclare `SUCCEEDED`, la session
n'apparaît pas dans `list_sessions` (identifiant préfixé `cse_`), et la seule
trace est une absence de ligne dans `passes_autonomes` — ce qui, dans l'app,
ressemble exactement à « il n'y avait rien à faire ». Toute Routine qui doit
toucher au dépôt se rattache donc à une session existante
(`persistent_session_id`), comme le font déjà toutes les autres Routines de
Raphaël. Après un tir, la vérification est une ligne de plus dans
`passes_autonomes` ; sinon, `get_session` sur `last_run.session_id` et regarder
si `session_context.sources` est vide.

**Une session autonome n'hérite pas forcément des outils `mcp__github__*`** :
dans ce cas elle ne peut pas lire la CI, et `docs/session-autonome.md` lui dit
de lancer elle-même, en entier, ce que la CI lance — ce sont les mêmes
scripts — puis de l'écrire dans `dev_log`.

**Pour tout arrêter** : Paramètres › Le cockpit › Sessions autonomes. Le
réglage `jarvis_sessions_autonomes` est lu EN BASE à chaque passe — d'où
`ecrireAutonomie()` et pas un `localStorage.setItem`, qui resterait sur son
téléphone et n'éteindrait rien du tout.

## Un artefact est un lieu de passage : ce qu'il répond va EN BASE

Sa demande du 5 sept. 2026 au soir, après avoir répondu aux quatorze points
d'une fiche pour rien : « les artefacts ont trop de durée de vie limitée et je
te colle des réponses détaillées quand c'était nécessaire ». Deux choses
distinctes se sont passées ce soir-là, et il faut retenir les deux.

**Le bug, pour ne pas le refaire.** La fiche n'enregistrait QUE les champs de
texte. `enregistrer()` abandonnait en silence tant que `claude.use("db")`
n'avait pas répondu — ce qui arrive toujours APRÈS le premier rendu, parfois
plusieurs secondes plus tard. Tous ses appuis des premières secondes étaient
donc perdus, puis le chargement tardif écrasait l'état en mémoire et
redessinait la page vide. Le compteur affichait « 0 / 14 » pendant qu'il
cochait : le signe était à l'écran, personne ne l'a lu. Toute page à capacité
`db` doit donc (1) **mettre en file** ce qui arrive avant que la base réponde
et le vider dès qu'elle est là, (2) ne **jamais** laisser un chargement écraser
ce que l'utilisateur a déjà touché — un drapeau posé au premier geste et jamais
remis à faux, pas un drapeau d'écriture en cours, qui retombe.

**La règle, qui vaut au-delà du bug.** Une fiche reste bonne pour POSER les
questions au pouce. Mais ses réponses ne doivent pas y rester : **recopie-les
dans les notes des chantiers concernés dès que tu les lis**, en citant ses mots.
Une note de chantier survit à tout ; un artefact, non — il vit hors du dépôt et
hors de la base, et la session suivante ne sait même pas qu'il existe si
personne n'a collé son URL ici.

Le chantier `85ae62b5` porte la sortie définitive : un écran « Ce qui attend ta
décision » dans l'app elle-même, alimenté par une table, avec les options
cliquables, un commentaire par question et les photos dans le Storage Supabase.
Le jour où il est livré, **on cesse de publier des fiches pour lui poser des
questions**.

## Une question à Raphaël : `scripts/demander.sh`, plus jamais un artefact

**Livré le 5 sept. 2026 (chantier `85ae62b5`). C'est la règle courante ; tout
ce qui suit sur les fiches est de l'histoire, gardé pour ses réponses passées.**

```bash
scripts/demander.sh --question "On garde le mot-à-mot combien de temps ?" \
  --pourquoi "Supprimer est irréversible, garder ne l'est pas." \
  --chantier 5ca5c4a3-19c6-44f4-8846-b53f9e4d7ee1 \
  --option "Sans limite|Rien n'est jamais supprimé.|recommande" \
  --option "30 jours|Un mois glissant, puis on efface."

# Ce qu'il doit FAIRE, lui, et non décider :
scripts/demander.sh --action --question "Dépose GOOGLE_GEOCODING_API_KEY dans les secrets Supabase" \
  --pourquoi "Sans elle, les rappels de lieu ne savent pas géocoder une adresse."
```

La question devient une ligne de `dev_log` (colonnes `pourquoi`, `options`,
`etat`, `photo_chemin`, migration 0022). Elle s'affiche **en tête de son
cockpit** — carte « Ce qui attend ta décision », sous « Où j'en suis » — avec
les options cliquables, un **champ de commentaire par question**, un bouton
photo par question, et pour une action les trois états **Fait / Pas encore /
Ça bloque**. Sa réponse repart dans `dev_log` en `kind = 'reponse'`, et le hook
de démarrage l'injecte dans **chaque** session suivante, dans deux blocs
dédiés : « Ce qui attend une DÉCISION de Raphaël » et « Ce que Raphaël a
répondu ». Une capture jointe se récupère avec `scripts/photo.sh <chemin>`.

**Chaque point arrive REPLIÉ sur sa question**, et c'est mesuré : déplié, un
seul point (question, pourquoi, trois options, champ de commentaire, photo,
bouton) fait 616 points de haut sur un écran de téléphone et repoussait le
tableau des chantiers à 1 382. Replié, la carte entière en fait 200. La
question, elle, reste lisible sans ouvrir — c'est elle qui lui dit lequel
ouvrir — et l'état d'une action se lit sur la ligne repliée.

**Pourquoi on a arrêté les fiches**, ses mots du 5 sept. : « les artefacts ont
trop de durée de vie limitée et je te colle des réponses détaillées quand
c'était nécessaire ». Une fiche vit hors du dépôt ET hors de la base : la
session suivante ne sait même pas qu'elle existe si personne n'a collé son URL
ici. Ce soir-là, deux fiches lui ont posé LA MÊME question et il a répondu deux
choses différentes.

**On n'a PAS ouvert de table `decisions`.** Elle aurait fait ce que `dev_log`
fait déjà — une session demande, il répond, `answered_at` referme — et il y
aurait eu deux endroits où chercher une question, avec la moitié dans chacun.
Ce qui manquait tenait en quatre colonnes. Même raison pour la réponse : elle
s'écrit en toutes lettres (le LIBELLÉ de l'option, pas sa clé), dans une entrée
de journal ordinaire, lisible telle quelle des années après même si le code qui
a posé la question a disparu.

**Une seule règle décide de ce qui l'attend**, `enAttenteDeRaphael` dans
`src/lib/journalDestinataire.ts` : elle sert à la fois à la carte où il répond
et à la colonne « pour toi » de « Où j'en suis ». Deux lectures différentes du
même message, c'est exactement ce qui lui a fait répondre deux fois. Une
question adressée à une AUTRE session (« Pour la session … ») n'en fait pas
partie.

Avant de poser une question : **relis les notes du chantier, le journal et le
bloc de démarrage**. Une question à laquelle il a déjà répondu et qu'on repose
est ce qui l'épuise le plus.

## Historique : les fiches d'avant le 5 sept. (ne plus en publier)

### Plusieurs questions à Raphaël : ce que les fiches faisaient

**Ne publie plus de fiche : passe par `scripts/demander.sh`, ci-dessus.** Cette
section reste parce que ses réponses passées y sont, et parce qu'elle dit ce
qu'une bonne question doit porter — c'est ce que la carte du cockpit reprend.

Ce qu'on faisait avant : dès qu'il y avait **plus de deux ou trois questions**,
ne pas les empiler dans un message mais publier un **artefact** qu'il remplit
au pouce. Il travaille
souvent depuis son téléphone, et répondre point par point dans une
conversation lui fait perdre le fil.

La fiche doit, pour chaque point : poser la question, dire **pourquoi** tu la
poses et ce que tu sais déjà, proposer des **options cliquables** avec
**ta recommandation** marquée, et laisser un **champ libre** — ses réponses
écrites valent souvent mieux que les options qu'on lui propose.

Déclare la capacité `db` : ses réponses sont alors enregistrées côté serveur et
tu les relis avec `read_db` (`action: "read_db"` sur l'URL de l'artefact) sans
qu'il ait à les recopier.

**CHAQUE question porte son champ de commentaire, sans exception.** Il l'a
demandé trois fois avant que ce soit fait (3 et 4 sept. 2026), ses mots :
« je n'ai que des choix de propositions, aucun commentaire ni fichier à
t'envoyer pour affiner mes réponses ». Des options cliquables seules ne
suffisent pas : c'est dans ses commentaires que se trouve ce qui change
réellement le travail. Un champ libre unique en bas de page ne compte pas —
il faut un champ **par proposition**, sinon il ne sait plus à quoi il répond.

**Et un bouton pour joindre une photo, sur chaque question aussi.** La
capacité `assets` n'est PAS disponible sur son compte (vérifié le 4 sept.,
le contrôle est `Skill: artifact-capabilities`, qui liste le jeu réel) : on
passe donc par `db`, qui accepte 256 Ko par document. Le motif qui marche,
mesuré : compresser dans un canvas (côté max 1400 px, qualité JPEG dégressive
jusqu'à passer sous 180 Ko), stocker **chaque photo dans son propre document**
`photos/<uuid>` — jamais dans le document des réponses, qu'un seul cliché
ferait dépasser —, et l'enregistrer dès qu'il la choisit plutôt qu'au bouton
final. Tu les relis avec `read_db` sur la collection `photos` (`out_dir` pour
les écrire en fichiers). Une image de 3000×2000 tombe à ~130 Ko et reste
lisible. Si elle ne passe toujours pas, la page le lui dit et l'invite à
l'envoyer dans la conversation. Sépare bien les **décisions** (il choisit) des
**actions** (il fait quelque chose : créer un compte, déposer une clé) — pour
les secondes, une liste numérotée qu'il coche au fur et à mesure te dit quand
tu peux démarrer.

### Les fiches déjà publiées — à lire avant de reposer une question

Raphaël a déjà répondu à beaucoup de choses dans ces fiches. Ses réponses n'ont
pas toutes été recopiées dans les notes des chantiers. **Avant de lui demander
quoi que ce soit qui ressemble à une préférence, un arbitrage ou un périmètre,
va d'abord voir s'il a déjà répondu ici** (outil Artifact, `action: "read"`, et
`action: "read_db"` sur la même URL pour les réponses enregistrées) :

- **Jarvis, pièce par pièce** — catalogue oui/non de ce qu'il veut :
  https://claude.ai/code/artifact/d9bda589-10ac-4de4-a515-1c41ad95b90a
- **Ce qu'il me manque** — décisions à options :
  https://claude.ai/code/artifact/fc8f0416-f799-4fc6-b9ae-3951b1486dbd
- **Brancher Google à Jarvis** — actions à faire côté Google Cloud :
  https://claude.ai/code/artifact/27f79fa6-2f64-49bd-879e-5215df9f88cd
- **Déblocage Google (refaite le 3 sept.)** — remplace la précédente, où il
  restait bloqué à l'étape 3 : le bouton « Interne » grisé lui faisait croire
  à une erreur, alors qu'il n'existe que pour une organisation Workspace et
  qu'il doit choisir « Externe ». Publiée par la session C :
  https://claude.ai/code/artifact/8e38d78d-82b3-437f-ad74-dce4dbd4fde2

- **Les 4 verrous** — les configurations manuelles qui débloquent 12 chantiers
  (Google, notifications Firebase, recherche web, et 3 arbitrages : voix,
  WhatsApp, géocodage payant). Remplace et prolonge la fiche « Brancher Google »
  ci-dessus, qui restait bloquée à son étape 3 :
  https://claude.ai/code/artifact/8e38d78d-82b3-437f-ad74-dce4dbd4fde2
  Ses réponses et son avancement sont dans le document `fiche/deverrouillage`
  (outil Artifact, `action: "read_db"`, `db_op: "get"`) : **relis-les avant de
  lui redemander quoi que ce soit** sur ces sujets.

- **Brancher Google, pas à pas** — les étapes qui lui restent après la
  correction de l'erreur 400 (`redirect_uri_mismatch`, 3 sept. 2026) :
  se connecter, contourner l'écran « application non validée », et publier
  l'application pour que l'autorisation ne meure pas au bout de 7 jours.
  https://claude.ai/code/artifact/aba8e4d3-4e1d-46d1-9873-c150702fa909
  S'il bute quelque part, il l'écrit dans le champ du bas : document
  `fiche/brancher-google` (`action: "read_db"`, `db_op: "get"`).

- **L'arbitrage WhatsApp** — **RÉPONDU le 3 sept. au soir, ne repose pas la
  question.** Ses décisions, à traiter comme acquises : (1) on reste sur le
  TÉLÉPHONE — pas de compte business, pas de bibliothèque non officielle ;
  (2) les envois programmés passent par une intervention de Jarvis au moment
  dit, il valide à la voix ; (3) les reçus arrivent par mail ET par SMS ;
  (4) **finbot est un service automatique sur WhatsApp**, à qui il envoie des
  reçus en photo. La fiche et le détail de ses mots :
  https://claude.ai/code/artifact/c12ec042-2873-423b-af88-c5cf68370cf3
  (`action: "read_db"`, `db_op: "get"`, collection `fiche`, doc_id `whatsapp`).
- **Ce qui ferait grandir Jarvis** — les deux chantiers non codables du thème
  « L'app elle-même » : quatre décisions de capacité (cache du contexte,
  recherche web, lecture de liens/PDF, mémoire des conversations) et trois
  densités d'affichage des tâches qu'il choisit au pouce.
  https://claude.ai/code/artifact/067c81c1-88de-4ca9-8947-8df34eb9f89e
  Ses réponses : document `fiche/capacite-et-visuel` (`action: "read_db"`,
  `db_op: "get"`). **Ne code rien de ces deux chantiers avant de les avoir
  lues** — c'est un [À CADRER] pour le visuel, et un arbitrage de coût pour la
  recherche web.

- **Quand Jarvis doit te déranger** — les neuf notifications proposées à
  Raphaël, classées par ce qu'elles coûtent en attention (ça sonne / une fois
  par jour / silencieux / déconseillé), avec mes recommandations déjà cochées.
  https://claude.ai/code/artifact/7d87dcb4-4cfd-48fb-9e52-603d4143ab2d
  Ses choix : document `fiche/notifications` (`action: "read_db"`,
  `db_op: "get"`) — un booléen par notification, plus `heure_matin` et un
  champ libre. **À lire avant de coder quoi que ce soit du chantier
  « Systèmes de notifications » (5d03a192).**

- **La clé de test Gemini** — les six étapes pour créer un SECOND projet
  Google AI Studio et sa clé, afin que les vérifications des sessions cessent
  de vider le quota du jour de Raphaël (c'est ce qui l'a laissé sans Jarvis le
  3 sept. à 21h28). Chaque étape se coche, avec commentaire et capture.
  https://claude.ai/code/artifact/e1bfdff8-c18e-4642-9752-1c4029d046aa
  Son avancement : document `fiche/cle-test` (`action: "read_db"`,
  `db_op: "get"`) — un booléen par étape (projet, studio, creer, copier,
  deposer, dire) plus ses commentaires. **Chantier 4eaf9c1d.**
- **Ce qui attend Raphaël** (5 sept.) — 5 actions et 8 décisions restées ouvertes
  après les 24 h de sessions autonomes : mises à jour en Wi-Fi, voix app fermée,
  conservation des conversations, contenu du briefing, recherche web payante ou
  non, ElevenLabs, périmètre du contrôle du téléphone, barre d'actions du site
  de Mélissa. Ses réponses sont enregistrées : `action: "read_db"` sur l'URL.
  https://claude.ai/code/artifact/4e952f48-99a4-41de-9c67-44c24769bc17

- **Le tableau de bord de Raphaël** (5 sept., soir) — **LA FICHE COURANTE, celle
  à lire en premier.** Elle REMPLACE et refond les précédentes, qu'il jugeait
  « désordonnées » : « il me demande de créer des clés, mais il ne me dit pas où
  les déposer. Je ne peux pas écrire si je l'ai fait, si ça bloque. » Elle porte
  donc, pour chacun des 3 gestes et des 11 décisions : la page exacte, le champ
  exact, la valeur exacte à taper, un état **Fait / Pas encore / Ça bloque**, un
  champ libre ET un bouton photo — par point, jamais un seul en bas de page.
  https://claude.ai/code/artifact/a23fc9f6-99e1-4c70-90ee-03ab15ff82d9
  Ses réponses : `action: "read_db"`, `db_op: "get"`, collection `fiche`,
  doc_id `tableau-de-bord` ; ses photos : collection `photos` (une par
  document, champ `item` = l'identifiant du point).

  **Ce que cette fiche a établi, et qu'il ne faut plus lui redemander** (vérifié
  le 5 sept. dans les secrets Supabase, pas supposé) : `GEMINI_API_KEY_TEST` est
  DÉPOSÉE et fonctionne ; `FIREBASE_SERVICE_ACCOUNT` est DÉPOSÉ et
  `android/app/google-services.json` est en place (projet `jarvis-507506`,
  paquet `com.raphael.jarvis`) — les notifications app fermée n'attendent plus
  que du code ; le compte Google est branché depuis le 3 sept. avec
  `gmail.modify` + `calendar.events`. **Le SEUL secret manquant de tout le
  projet est `GOOGLE_GEOCODING_API_KEY`**, et il ne sert qu'aux rappels de lieu,
  dont il n'a aucun. Pour refaire ce constat sans rien lui demander :

  ```bash
  curl -sS https://api.supabase.com/v1/projects/bexiyvmdbxcwxasgslxp/secrets \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | python3 -c \
    "import json,sys; print('\n'.join(sorted(s['name'] for s in json.load(sys.stdin))))"
  grep -rhoP 'Deno\.env\.get\("\K[A-Z_0-9]+' supabase/functions/ | sort -u
  ```

  (la première liste ce qui EST déposé, la seconde ce que le code ATTEND ; la
  différence est la seule chose à lui demander — jamais une liste devinée)

Les deux premières servent aussi de modèle : catalogue oui/non, et décisions à
options. Si tu publies une nouvelle fiche, **ajoute son URL à cette liste** dans
le même commit — sinon elle sera perdue pour les sessions suivantes.

## Le moteur : Gemini, offre gratuite — et pourquoi

Décision de Raphaël du 3 sept. 2026, à ne pas rouvrir : Jarvis tournait sur
Claude via l'API Anthropic, facturée au jeton, et il l'a découvert en voyant
sa clé à sec. Il a choisi l'offre gratuite de l'API Gemini, en connaissance
du compromis (Google se réserve d'utiliser les contenus de l'offre gratuite
pour améliorer ses produits, relecture humaine comprise). Les options
écartées : Haiku 4.5 (moitié prix, privé), rester sur Sonnet 5.

Tout ce qui est propre à Gemini vit dans `supabase/functions/_shared/gemini.ts`
— un seul endroit pour la forme de la requête, les erreurs et les nouveaux
essais. `index.ts` et `memoire.ts` ne font qu'appeler `appelerGemini()`.
Les phrases d'erreur y sont alignées mot pour mot avec
`src/lib/erreurServeurVocal.ts` : changer l'une, c'est changer l'autre.

Le coût, même à zéro, se surveille : la limite de l'offre gratuite se compte
en requêtes et en jetons par minute, et chaque phrase envoie ~45 000
caractères (consignes 8 000 + schéma d'outil 17 800 + contexte). La ligne
`coût` dans les journaux de la fonction donne la consommation réelle de
chaque appel. Les archivés du cockpit sont plafonnés à 15 côté client
(`chantiersPourLeModele` dans `MicButton.tsx`) : avant, les 83 chantiers
partaient en entier à chaque phrase, et ça grossissait à chaque chantier
livré.

### Un modèle Gemini meurt sans prévenir — vérifie-le par un vrai appel

Le 4 sept. 2026, les **trois** modèles sur lesquels Jarvis tournait sont
tombés le même jour : `gemini-3.5-flash-lite` (le principal) en 503 « This
model is currently experiencing high demand », `gemini-2.5-flash` (le secours)
et `gemini-2.5-flash-lite` (la mémoire) en 404 « no longer available to new
users ». Raphaël n'avait plus de Jarvis, et la mémorisation échouait en
silence — c'est sa nature, elle ne dérange jamais l'utilisateur, donc personne
ne l'aurait vu.

**`ListModels` n'est PAS une autorisation.** Les deux clés du projet
annoncent toujours `gemini-2.5-flash`, et `generateContent` le refuse. Un
secours écrit d'après cette liste — ou de mémoire, ou d'après la
documentation — ne se voit qu'en panne, chez Raphaël. Avant d'écrire un nom de
modèle dans le code, **fais un vrai appel `generateContent` avec la clé
concernée** ; une fonction jetable de dix lignes déployée puis supprimée suffit
(et garde la clé côté Supabase, là où le classificateur de permissions ne
bloque pas — il refuse toute commande shell qui porte un secret en clair).

Les cinq seaux en place, chacun essayé pour de vrai avant d'être écrit :
commande — principal `gemini-3.1-flash-lite`, secours `gemini-3.5-flash` puis
`gemini-3.6-flash` ; mémoire — principal `gemini-3.5-flash-lite`, secours
`gemini-3.7-flash`. La mémoire ne touche JAMAIS aux modèles de la commande :
c'est ce qui a rendu Jarvis muet le 3 sept.

### Un contrôle rouge n'est pas forcément un bug

Vérifié le 4 sept. au soir : `verifier-commande-vocale.mjs` est tombé à 39/41
alors que le code était bon. Le quota du jour de la clé de TEST était épuisé —
un cas mort en `IDLE_TIMEOUT` à 150 s, l'autre avec « J'ai atteint la limite de
l'offre gratuite ». Les deux mêmes cas, rejoués en les espaçant, repassent au
vert, et la passe complète est ressortie à **41/41 avec `PAUSE_MS=9000`**.

Le script le dit maintenant lui-même : un échec dont la réponse porte une
signature de quota est marqué comme tel et repris dans un bilan en fin de
sortie, avec la marche à suivre. Le rouge reste rouge — on ne fait jamais
passer un échec pour un succès — mais on ne relit plus son diff pendant une
heure pour rien. **Avant de chercher un bug, regarde ce bilan.**

### Un modèle peut aussi être plafonné à vingt requêtes par jour

Découvert le 4 sept. 2026 en essayant de vérifier le dédoublonnage : la
mémoire n'écrivait plus rien, et les journaux disaient pourquoi —
`quota {"modele":"gemini-3.7-flash","id":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","limite":"20"}`.
Vingt mémorisations par jour et par projet, puis plus rien, **en silence**, la
mémoire étant muette par construction. Personne ne l'aurait vu.

Un modèle qui répond n'est donc pas un modèle utilisable : regarde la ligne
`quota` des journaux de la fonction après un vrai essai, elle donne le plafond
réel. Un `flash` n'a pas du tout le même plafond qu'un `flash-lite` — c'est ce
qui a fait remettre la mémoire sur `gemini-3.5-flash-lite`.

Et dans `_shared/gemini.ts`, `STATUTS_CHANGER_DE_MODELE` vaut **404, 429, 503**
— trois façons de dire « ce modèle-là ne répond pas », toutes les trois
réglées en passant au suivant, jamais en insistant. Le 503 y a été ajouté ce
jour-là : on rejouait trois fois le modèle saturé puis on abandonnait sans
jamais essayer les secours, qui eux répondaient.

### Les vérifications ne puisent plus dans le quota de Raphaël

`scripts/verifier-commande-vocale.mjs` pose l'en-tête `x-jarvis-essai: 1`, et
`voice-command` lit alors le secret `GEMINI_API_KEY_TEST` — la clé d'un SECOND
projet Google AI Studio, parce que le plafond gratuit se compte PAR PROJET.
C'est ce qui a laissé Raphaël sans Jarvis le 3 sept. à 21h28 : quatre sessions
avaient vidé le quota du jour avec leurs contrôles. Ne retire pas cet
en-tête ; la ligne `clé` des journaux dit lequel des deux seaux a servi.

Le mode Live (`live-jeton`) n'a pas encore ce branchement : ses vérifications
puisent toujours chez lui. C'est le chantier `9ad79fbf`.

**Une variable d'environnement de l'environnement Claude Code n'arrive
jamais dans une session déjà ouverte** : elles sont figées au démarrage du
conteneur. Et le chemin `pousser-secret.sh` n'a jamais fonctionné chez
Raphaël — ses clés n'apparaissent dans aucun de ses quatre environnements.
Le chemin qui marche, vérifié : il pose lui-même le secret dans le tableau de
bord Supabase (*Project Settings* → *Edge Functions* → *Edge Function
Secrets*). Ne lui demande pas de coller une clé dans la conversation : le
classificateur de permissions refusera ensuite toute commande qui la porte,
et elle aura été exposée pour rien.

### Une clé d'API se pousse par `scripts/pousser-secret.sh`, jamais autrement

```bash
scripts/pousser-secret.sh GEMINI_API_KEY
```

Raphaël dépose la clé dans les variables d'environnement de l'environnement
Claude Code ; le script la lit là et l'envoie aux secrets Supabase par l'API,
sans jamais l'afficher. Ne lui demande **jamais** de coller une clé dans la
conversation, et n'utilise pas l'outil MCP pour ça.

## Déployer une Edge Function : `scripts/deployer-fonction.sh`

```bash
scripts/deployer-fonction.sh voice-command
```

Il lit les fichiers sur le disque et les envoie à l'API Supabase. Il embarque
tout seul les fichiers voisins (`memoire.ts`) et le dossier `_shared/` quand
la fonction s'en sert, et il relit puis **conserve le réglage `verify_jwt`
existant** — `google-oauth` doit rester ouvert pour recevoir la redirection de
Google, qui ne porte aucun jeton ; le refermer casserait la connexion du
compte Google. **`git fetch && git merge` AVANT de déployer, toujours.** Le script envoie ce
qui est SUR LE DISQUE, pas ce qui est sur la branche. Le 5 sept., un
déploiement fait pour une raison sans rapport (une phrase de
`_shared/environnement.ts`) a remis en ligne l'`index.ts` d'avant le correctif
qu'une autre session venait de pousser — le rouge est tombé une demi-heure
plus tard sur `verifier-commande-vocale.mjs`, chez celui qui n'y était pour
rien. Plusieurs sessions déploient la MÊME fonction ; l'état du disque n'est à
jour que si on vient de le mettre à jour.

**Il exige `SUPABASE_ACCESS_TOKEN`** (jeton personnel, https://supabase.com/dashboard/account/tokens,
à mettre dans les variables d'environnement de l'environnement cloud — jamais
dans le dépôt). Tant qu'elle manque, le script le dit et s'arrête.

Sans ce jeton, le seul chemin est l'outil MCP `deploy_edge_function`, qui
n'accepte le contenu **qu'en clair, recopié à la main dans l'appel**. Pour
`voice-command` cela veut dire retranscrire 35 Ko de code écrit par d'autres
sessions, à la virgule près, à chaque déploiement : une erreur de recopie ou
une troncature met l'assistant hors service, et la corriger demande de tout
retranscrire une seconde fois. **Ne fais pas ça.** Si le jeton manque, dis-le
et laisse le déploiement en attente plutôt que de recopier le fichier.

## La Edge Function `voice-command` ne se déploie PAS au push

Le site web se republie à chaque push, la Edge Function non : il faut la
redéployer explicitement (outil MCP `mcp__Supabase__deploy_edge_function`,
projet `bexiyvmdbxcwxasgslxp`, fonction `voice-command`, avec `index.ts` ET
`memoire.ts`). Un chantier qui touche `supabase/functions/voice-command/`
n'est donc pas fini une fois la CI verte.

Et un typecheck ne dit rien de ce qui compte ici : est-ce que le modèle suit
encore la consigne. Après chaque déploiement :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs
```

Dix contrôles bout-en-bout sur la fonction réellement déployée, avec un
utilisateur de test éphémère créé puis supprimé. La clé publique se récupère
avec `mcp__Supabase__get_publishable_keys` (elle part déjà dans le bundle du
site, ce n'est pas un secret — la clé de service, si).

## Le prototype « Mode conversation Live » (4 sept. 2026)

Décision de Raphaël : deux pistes en parallèle. (1) Le micro fait main
(`useSpeechRecognition` + `dialogueTour` + `veille`), qui passe par le service
de reconnaissance du téléphone — patché pour préférer le service Google, qui
ne bipe pas (`patches/@capacitor-community+speech-recognition+7.0.1.patch`,
appliqué par `postinstall` via patch-package, y compris en CI). (2) Gemini
Live : l'app envoie l'audio en continu par WebSocket, Google gère la détection
de voix, la fin de tour, l'interruption et la transcription. Derrière la case
« Mode conversation Live (essai) » sous le cœur ; désactivé par défaut.

- La clé ne quitte jamais le serveur : `supabase/functions/live-jeton` rend un
  jeton éphémère à usage unique (SDK `npm:@google/genai`, API `v1alpha`),
  verrouillé sur le modèle `GEMINI_MODELE_LIVE` (défaut
  `gemini-2.5-flash-native-audio-preview-12-2025`, gratuit). `verify_jwt` reste
  à true : il faut être connecté.
- **La configuration de la session (consigne, outil, contexte, audio) vit
  DANS le jeton**, côté serveur. Vérifié le 4 sept. avec
  `verifier-live-contexte.mjs` : avec un jeton éphémère, Google IGNORE la
  configuration envoyée par l'app à la connexion — Jarvis disait « je n'ai
  pas accès à tes tâches » alors que l'app les lui donnait. L'app envoie son
  contexte (tâches, chantiers, contacts, date) dans le corps de la requête à
  `live-jeton`, et se connecte avec une configuration vide. Ne remets jamais
  de `systemInstruction` côté app : elle serait perdue en silence.
- Côté app : `src/lib/live/` (audio, session). Le modèle Live ne connaît qu'un
  outil, `commande_jarvis`, qui repasse par `resolveTranscript` +
  `executerActions` de `MicButton` — une seule source de vérité pour les
  actions. Raphaël clôt à la voix (« terminé », « fin de transmission »,
  « au revoir »… : `src/lib/live/finConversation.ts`) ; c'est l'app qui
  reconnaît la formule, pas le modèle, et la phrase entière doit être un
  adieu — « termine le chantier X » reste une commande.
- **Dans `MicButton`, tout ce qu'un effet lance passe par `derniersRef`**,
  jamais par un appel direct. La boucle de veille vit dans un effet monté
  une fois : elle gardait `demarrerLive` du premier rendu, où les tâches
  n'étaient pas encore chargées, et « Jarvis, quelles sont mes tâches ? »
  répondait « Aucune tâche trouvée » avec dix-neuf tâches en base (4 sept.,
  en Live comme en classique — un appui sur le cœur, lui, voyait tout). Le
  banc du cœur de `verifier-ecoute-web.mjs` monte le vrai `MicButton` avec
  des tâches chargées après le montage et rejoue exactement ce cas.
- **Les souvenirs sont joints par `live-jeton`, pas par l'app.** En mode
  classique, `voice-command` cherche les souvenirs pertinents à CHAQUE phrase ;
  en Live le contexte est scellé une seule fois à l'ouverture, donc on ne peut
  rien chercher « par rapport à la question » — on joint ce qu'il sait, tout
  court (`souvenirsDeLUtilisateur`, 40 max). Côté serveur exprès : ça reste
  vrai même si `contexteLive()` change dans `MicButton`. Sans ça Jarvis était
  amnésique en Live et pas en classique. Le mot-à-mot des conversations, lui,
  ne peut pas être scellé d'avance : la consigne Live dit d'appeler
  `commande_jarvis` pour « on avait parlé de quoi… », qui repasse par la
  recherche de `memoire.ts`.
- Vérification : `ANON_KEY=... node scripts/verifier-live-jeton.mjs` (fonction
  déployée, utilisateur de test éphémère). Le comportement audio réel ne se
  vérifie que sur un appareil ; `journal_ecoute` trace `live_debut`,
  `live_commande`, `live_echec`, `live_fin`.

**Piège du build local** : sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`,
`src/lib/supabase.ts` lève au chargement et le bundler jette TOUTE l'app comme
code mort — le bundle fait 258 ko et ne contient rien. Pour un vrai build
local : `VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build`.
La CI a les vraies valeurs. Et le typecheck qui compte est celui de la CI,
`npx tsc -b` (les projets référencés, dont `tsconfig.app.json`) — un
`npx tsc --noEmit` à la racine ne vérifie PAS l'app et dit « OK » à tort
(constaté le 4 sept. : CI rouge sur une erreur qu'il n'avait pas vue).

## La mémoire longue durée : ce qu'elle retient, et ce qu'elle ne redit pas deux fois

Trois pièces, toutes dans `supabase/functions/voice-command/` :

- `memoire.ts` — l'extraction des faits, le rappel, et l'écriture.
- `dedoublonnage.ts` — la DÉCISION : ce fait existe-t-il déjà ? Sans dépendance
  Deno, exprès, pour se vérifier sous Node hors ligne.
- migrations `0006_memoire_longue_duree.sql` (souvenirs) et
  `0018_echanges_recherche.sql` (recherche dans le mot-à-mot).

**Deux mesures, jamais une seule, pour dire « c'est le même fait ».** Mesuré le
4 sept. 2026 sur les 21 souvenirs réels de Raphaël, toutes les paires : avec
gte-small, deux phrases françaises sans le moindre rapport (« Raphaël est
marié » / « une boutique appelée Fripouille à Hipouy ») sont à **0,907** de
proximité. Un seuil cosinus seul, assez haut pour être sûr, ne dédoublonnerait
plus rien. Les seuils retenus — proximité ≥ 0,95 **ET** recouvrement lexical
≥ 0,40 — laissent une marge des deux côtés : vrais doublons à 0,958-0,978 /
0,44-0,50, faux ami le plus proche à 0,938 / 0,33. `verifier-dedoublonnage.ts`
protège cette marge ; ne la resserre pas sans refaire la mesure.

**Ne fusionne jamais deux sujets qui se ressemblent.** Le garde-fou des noms
propres (`nomsPropres`) empêche « villa Dan » et « villa Ben » de n'en faire
qu'une, même à 0,995 de proximité. Un nom propre présent d'un seul côté n'est
qu'une précision et fusionne ; deux noms propres mutuellement exclusifs, non.

**Un chiffre qui change n'est pas un doublon.** L'ancien souvenir est marqué
`perime_at`, jamais effacé : Jarvis doit pouvoir dire « avant c'était 4 000, tu
m'as dit 4 500 depuis ». Rien n'est jamais supprimé par la mémoire — l'onglet
Mémoire montre les périmés barrés, avec un bouton pour les réactiver.

Le rattrapage sur l'existant se relance à volonté, et ne périme que des
doublons (aucun `delete`) :

```bash
node --experimental-strip-types scripts/nettoyer-souvenirs.ts             # montre
node --experimental-strip-types scripts/nettoyer-souvenirs.ts --appliquer # écrit
```

**La mémoire peut mourir sans un bruit — d'où le témoin.** Elle est
silencieuse par construction (choix de Raphaël) et elle avale ses erreurs : le
4 sept. elle est restée morte des heures, 42 échanges dictés sans rien retenir,
alors que le plus long silence NORMAL de tout son historique est de 5 échanges.
Deux pièces désormais, et il faut les deux : `memoriser()` signale ses pannes
dans le registre des erreurs (`signaler_erreur`, source `memoire`) — c'est le
POURQUOI ; et `sante_memoire()` (migration 0020) compte les échanges depuis la
dernière chose retenue — c'est le filet pour les pannes qu'elle n'a même pas pu
signaler. Le témoin s'affiche en tête de l'onglet Mémoire, il ne notifie rien.

**Une migration qui ajoute une COLONNE doit vérifier la politique RLS qui va
avec.** Le 5 sept., le rattrapage des empreintes n'écrivait rien depuis deux
jours, en silence : `echanges` avait SELECT, INSERT et DELETE (migration 0006)
mais aucune politique UPDATE — la table n'était jamais modifiée à l'époque. La
0018 y a ajouté `embedding`, donc une écriture, sans la politique. **RLS ne
refuse pas bruyamment un UPDATE : il restreint les lignes.** Zéro ligne
touchée, PostgREST rend un succès, le code n'a rien à attraper, et aucun
contrôle qui lit le code ne peut le voir — le code était juste. D'où la
migration 0021, et la règle : toute écriture passe par un `.select()` qui
prouve qu'une ligne a bougé (`rattraperEmpreintes`), et un contrôle
bout-en-bout de `verifier-memoire.mjs` vérifie que le rattrapage rend
VRAIMENT cherchable un échange ancien.

**Une commande comprise SUR L'APPAREIL laisse quand même sa trace
(`src/lib/echangeLocal.ts`).** `resolveTranscript` essaie d'abord
`interpreterLocalement` — gratuit, instantané, hors ligne, et c'est très bien.
Mais quand une règle locale reconnaît la phrase, `voice-command` n'est jamais
appelé, et c'est lui qui écrit la ligne dans `echanges` : la phrase
disparaissait de l'historique, invisible pour « on avait parlé de quoi ? »,
invisible pour la mémoire, et il n'en restait que les 80 premiers caractères
dans `journal_ecoute`. Deux chantiers dictés le 5 sept. à 18h20 et 19h32 ont
été perdus comme ça — il a dû les redicter.

L'app écrit donc elle-même l'échange, sans `await` chez l'appelant et sans
jamais faire échouer la commande qu'elle observe. `embedding` reste `null` :
`Supabase.ai` n'existe que dans une Edge Function ; `rattraperEmpreintes` rend
la ligne cherchable peu après, tout seul. Ces phrases ne passent volontairement
PAS par l'extraction de souvenirs — la consigne dit déjà de ne rien retenir
d'une demande de création de tâche ou de chantier, et ce sont exactement
celles-là. **Chaque chemin qui exécute une commande doit tracer** : il y en a
deux (le micro classique et l'outil du mode Live), et
`verifier-pannes-silencieuses.ts` compte les appels à `executerActions` face
aux appels à `tracerSiLocale` — un troisième chemin ajouté sans trace
reperdrait des phrases sans que rien ne le signale.

**Une panne de LECTURE ne se voit pas dans le témoin, d'où `_shared/pannes.ts`.**
Le témoin compte les écritures ; un rappel qui échoue, lui, rend exactement le
même résultat qu'un rappel qui n'a rien trouvé — la chaîne vide. Jarvis
devenait amnésique et tout avait l'air normal. Les trois fonctions qui
construisent le contexte (`rappelerSouvenirs`, `rappelerCorrections`,
`souvenirsDeLUtilisateur` côté Live) signalent donc leurs échecs par
`signalerPanne`, et `scripts/verifier-pannes-silencieuses.ts` — qui LIT le
code, comme `verifier-reglages.ts` — refuse qu'on réintroduise un avalement.
Ailleurs dans ces fichiers un `catch {}` reste légitime et voulu : le contrôle
ne vise que les trois fonctions de rappel, pour ne pas faire ajouter des
liaisons d'erreur inutiles.

**`updated_at` ne peut pas servir de témoin, et `created_at` non plus.** Le
premier bouge aussi quand Raphaël corrige un souvenir à la main — le témoin
repasserait au vert au pire moment. Le second rate les fusions, qui sont
justement du travail de la mémoire sans nouvelle ligne. D'où `fusionne_at`, une
date que SEULE `ranger()` pose. Un contrôle de `verifier-memoire.mjs` protège
cette distinction.

**Retrouver une conversation, pas seulement un fait.** Depuis la migration
0018, `echanges` porte une empreinte et `chercher_echanges()` cherche dedans
par le sens : « on avait parlé de quoi pour la villa Dan ? » trouve enfin sa
réponse. Le seuil y est plus haut (0,75) que pour les souvenirs, pour la même
raison qu'au-dessus. La purge à sept jours ne bouge pas, c'est le choix de
Raphaël. Les échanges antérieurs reçoivent leur empreinte tout seuls, quelques
lignes à chaque phrase (`rattraperEmpreintes`) — pas de script à lancer.

## Jarvis constate ses propres échecs (`src/lib/retours.ts`)

Sa demande du 3 sept. 2026, avec son exemple : « mets-moi la musique de Booba,
Dolce Camara » — Jarvis demande le lecteur, ouvre Apple Music, ne lance pas le
titre. Raphaël répond « tu n'as pas lancé la musique que je t'ai demandée ».
**Cet échec-là ne levait aucune exception** : l'action avait « réussi », et le
seul témoin était une phrase de reproche qui partait dans le vide.

Trois signaux, et c'est tout : une action qui **lève** (l'échec certain, signalé
depuis le `catch` d'`executerActions` avant que l'erreur remonte) ; une demande
que Raphaël **redit** dans la minute ; et une **plainte** (« tu n'as pas… »,
« ça n'a pas marché », « ce n'est pas ce que je t'ai demandé »), attribuée au
tour précédent gardé dans `dernierTourRef`.

**Pas de second registre** : tout passe par `signalerErreur` et `jarvis_erreurs`
(migration 0019). Deux registres d'erreurs côte à côte, c'est la garantie que
personne ne regardera ni l'un ni l'autre. Ces lignes n'ont pas de `correction`,
donc elles ne partent PAS au modèle (`correctionsUtiles` exige une correction
écrite) : elles ne gonflent pas la consigne.

**Le titre porte la FAMILLE d'action et sa cible, jamais la phrase dictée.**
C'est le titre qui fait l'empreinte de regroupement côté base : dix échecs sur
la musique font UNE ligne avec un compteur, et non dix lignes que personne ne
lira. C'est la demande explicite de Raphaël — « se corriger de façon GLOBALE,
par contexte, pas par phrase ». Corollaire dans `cibleDeLAction` : l'application
et le contact sont des cibles, le titre d'une tâche non — il change à chaque
phrase et ferait une ligne par échec.

**Ce qui est volontairement absent, et ne doit pas être ajouté : « non ».** Un
« non » sec répond presque toujours à une question de précision (« Tu veux dire
la villa Dan ? »), c'est-à-dire le fonctionnement NORMAL du dialogue. Même
raison pour la redite après un `clarify` : il vient de demander une précision,
on la lui donne. La moitié des contrôles de `verifier-retours.ts` vérifie le
SILENCE, pas la détection — un registre bruyant n'est plus lu du tout, ce qui
est pire que pas de détecteur.

**Le rapport aux sessions** (le point 4 de sa demande) passe par le bloc de
démarrage : le hook injecte les échecs `comprehension`/`action` vus au moins
deux fois, **sans correction et sans chantier** — c'est-à-dire exactement ce
que personne n'a pris. **Aucun chantier n'est créé automatiquement**, et c'est
une décision, pas un oubli : un chantier auto-généré sans note de correction
serait une seconde vue, plus pauvre, d'une ligne que les sessions lisent déjà
au démarrage — dans l'écran dont il dit lui-même qu'il ne sait plus « où mettre
le nez ». La question lui est posée dans le cockpit ; s'il tranche l'inverse,
la place est prête.

## Ce que Raphaël reprend à Jarvis lui revient

`supabase/functions/_shared/corrections.ts` — **une seule source**, importée
par `voice-command` ET `live-jeton`, comme `environnement.ts`.

Le registre des erreurs lui fait écrire « ce qu'il aurait fallu faire ». Ces
corrections remontaient dans le bloc injecté au démarrage des sessions Claude
Code, mais pas dans le contexte de Jarvis : il refaisait donc la même erreur le
lendemain alors que la réponse était en base (chantier 057fbe10).

**Deux familles seulement partent au modèle : `comprehension` et `action`.**
Une erreur `serveur` ou `systeme` — un modèle qui refuse, une écriture qui
échoue — n'apprend rien à un modèle de langue ; l'envoyer ne fait que gonfler
un contexte déjà à ~45 000 caractères par phrase. Plafond à 10 corrections,
champs tronqués, et **aucun bloc du tout quand il n'y a rien** — un titre suivi
de rien coûte des jetons pour ne rien dire.

**`ignore` est le seul statut exclu**, et c'est voulu : il veut dire que
Raphaël a regardé et décidé que ce n'en était pas une. La renvoyer comme
consigne prendrait le contre-pied de sa décision. Une erreur `corrige` reste
envoyée : le correctif est peut-être dans le code, la consigne reste vraie.

`scripts/verifier-corrections.ts` (dans la CI) tient le tri, et
`verifier-memoire.mjs` prouve la chaîne entière : une correction écrite change
ce que Jarvis fait dès la phrase suivante.

## Ce que Jarvis sait de sa propre application

`supabase/functions/_shared/environnement.ts` — **une seule source**, importée
par `voice-command` ET `live-jeton`. Raphaël, 4 sept. : « où est la fenêtre de
question où je dois répondre ? » → « je n'ai pas accès à l'interface de
l'application ».

**Quand un onglet, une carte de Paramètres ou une section du cockpit change de
nom, apparaît ou disparaît, corrige ce fichier dans le même travail**, et
redéploie les deux fonctions — sinon Jarvis envoie Raphaël vers un bouton qui
n'existe plus. Quatre contrôles de `verifier-commande-vocale.mjs` (« il sait
où… ») disent si le texte arrive bien jusqu'au modèle.

## Les vérifications du dépôt

Une seule méthode canonique par sujet, à relancer plutôt qu'à réinventer :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs   # la Edge Function déployée
ANON_KEY=... node scripts/verifier-donnees.mjs           # temps réel + réglages, RLS comprise
node --experimental-strip-types scripts/verifier-dialogue.ts   # tours de parole, sans réseau
node --experimental-strip-types scripts/verifier-mot-cle.ts    # réveil « Jarvis », sans réseau
node --experimental-strip-types scripts/verifier-commande-locale.ts  # commandes comprises sans modèle
node scripts/verifier-ecoute-web.mjs                     # moteur d'écoute + banc du cœur (vrai MicButton), vrai navigateur
node --experimental-strip-types scripts/verifier-fin-conversation.ts  # « terminé » ferme le Live, « termine le chantier » non
node --experimental-strip-types scripts/verifier-envoi-chantier.ts  # « Envoyer à Claude Code », sans réseau
node --experimental-strip-types scripts/verifier-echeance.ts    # l'étiquette d'échéance d'une tâche, sans réseau
node --experimental-strip-types scripts/verifier-theme.ts       # pas deux thèmes pour le même sujet, sans réseau
node --experimental-strip-types scripts/verifier-dedoublonnage.ts   # la mémoire ne réécrit pas trois fois la même chose, sans réseau
node --experimental-strip-types scripts/verifier-corrections.ts   # ce que Raphaël reprend arrive au modèle, et rien d'autre, sans réseau
node --experimental-strip-types scripts/verifier-pannes-silencieuses.ts  # une panne de la mémoire ne se lit pas comme une absence, sans réseau
node --experimental-strip-types scripts/verifier-retours.ts       # Jarvis constate ses échecs, et se tait le reste du temps, sans réseau
ANON_KEY=... node scripts/verifier-memoire.mjs           # la mémoire de bout en bout : dédoublonnage réel + retrouver une conversation
node scripts/verifier-memoire-web.mjs                    # « Vos conversations » parcourue dans un vrai navigateur, en écran de téléphone
node --experimental-strip-types scripts/verifier-notifications.ts   # ce que Jarvis fera sonner, et quand, sans réseau
node --experimental-strip-types scripts/verifier-maj-web.ts      # la mise à jour rapide : paquet, chemins, verdict, sans réseau
node --experimental-strip-types scripts/verifier-telechargement-apk.ts  # télécharger l'APK : aucun chemin ne peut rester muet, sans réseau
node --experimental-strip-types scripts/verifier-reglages.ts     # toute préférence est déclarée ET réglable, sans réseau
node --experimental-strip-types scripts/verifier-autorisations.ts  # un bouton « Autoriser » n'est jamais mort, sans réseau
node --experimental-strip-types scripts/verifier-musique.ts       # « je lance » n'est dit que si ça joue vraiment, sans réseau
node --experimental-strip-types scripts/verifier-doublon-vocal.ts  # dicter deux fois ne crée pas deux chantiers, sans réseau
node --experimental-strip-types scripts/verifier-fenetre-annulation.ts  # le temps d'arrêter une commande mal entendue, sans réseau
node --experimental-strip-types scripts/verifier-bulle.ts        # la bulle flottante : état réel, service déclaré, sans réseau
node --experimental-strip-types scripts/verifier-ecran.ts        # appuyer sur l'écran d'une autre app : et surtout ne RIEN toucher quand on n'est pas sûr, sans réseau
node --experimental-strip-types scripts/verifier-apps-ia.ts      # les IA déjà installées : mises en avant sans jamais limiter, sans réseau
node --experimental-strip-types scripts/verifier-assistant.ts     # Jarvis choisissable comme assistant du téléphone, sans réseau
node --experimental-strip-types scripts/verifier-honnetete.ts     # « préparé » ne devient jamais « envoyé », et Jarvis sait à quoi il est branché, sans réseau
node scripts/verifier-autorisations-web.mjs              # l'écran des autorisations dans un vrai navigateur, en écran de téléphone
node --experimental-strip-types scripts/verifier-sections.ts    # groupement, ordre, compteurs et filtre du cockpit, sans réseau
node --experimental-strip-types scripts/verifier-suggestion-theme.ts  # la section suggérée à la saisie, sans réseau
node --experimental-strip-types scripts/verifier-doublon-chantier.ts  # « ça existe déjà » : la redite et le déjà-livré, sans réseau
node --experimental-strip-types scripts/verifier-doublons-existants.ts  # les doublons déjà en base, et surtout le silence quand il n'y en a pas
node --experimental-strip-types scripts/verifier-tache-ou-chantier.ts  # une tâche perso qui est en fait un chantier — et le silence sur les chantiers de maçonnerie
node --experimental-strip-types scripts/verifier-depuis-derniere-visite.ts  # ce qui a bougé pendant son absence, sans réseau
node --experimental-strip-types scripts/verifier-sessions-autonomes.ts  # une session autonome se retire quand il le faut, sans réseau
node scripts/verifier-cockpit-web.mjs                    # le cockpit parcouru dans un vrai navigateur, en écran de téléphone
scripts/verifier-cockpit-reel.mjs                        # le même, sur ses VRAIES données (lit la base ; pas dans la CI)
node scripts/verifier-taches-web.mjs                     # la corbeille d'une tâche demande avant de supprimer, vrai navigateur
node scripts/verifier-reglages-web.mjs                   # les réglages parcourus dans un vrai navigateur, en écran de téléphone
ANON_KEY=... node scripts/verifier-sections-erreurs.mjs  # sections + registre des erreurs : fonctions SQL et cloisonnement RLS
ANON_KEY=... node scripts/verifier-connexion-google.mjs  # le branchement Google, avant de le proposer
node --experimental-strip-types scripts/verifier-agenda-google.mjs  # l'agenda, sur le compte réellement branché
ANON_KEY=... node --experimental-strip-types scripts/verifier-gmail.mjs  # Gmail : encodage, lecture réelle, garde-fou d'envoi
ANON_KEY=... node scripts/verifier-messages-programmes.mjs  # messages programmés : cycle + cloisonnement RLS
ANON_KEY=... node scripts/verifier-live-jeton.mjs        # le jeton du mode conversation Live
ANON_KEY=... node scripts/verifier-live-contexte.mjs     # le modèle Live reçoit bien consigne et contexte (vraie session)
```

`verifier-donnees.mjs` couvre ce qui casse en silence : un abonnement temps
réel qui annonce « SUBSCRIBED » et ne reçoit jamais rien (jeton utilisateur
absent → RLS refuse sans le dire), et les réglages qui ne remonteraient pas
en base. Piège à connaître si tu écris un script du même genre : « SUBSCRIBED »
ne veut pas dire que le serveur diffuse déjà — le tout premier canal d'une
connexion neuve rate une écriture faite dans la seconde qui suit.

`verifier-connexion-google.mjs` couvre le piège qui a bloqué Raphaël le
3 sept. 2026 : l'adresse de retour envoyée à Google doit être identique au
caractère près à celle enregistrée dans le client OAuth, sinon Google refuse
d'afficher l'écran d'autorisation (« Erreur 400 : redirect_uri_mismatch »).
Le script suit vraiment l'URL produite par `/start` et vérifie que Google
l'accepte — un contrôle sur le seul contenu de l'URL ne l'aurait pas vu.
**À relancer après tout déploiement de `google-oauth`**, avant de dire à
Raphaël d'essayer : c'est lui qui se prend l'erreur sinon.

## Gmail : Jarvis prépare, Raphaël valide, et seulement ensuite ça part

Un e-mail part vers l'extérieur **en son nom**. La Edge Function `google-gmail`
sépare donc `preparer` (qui rend le brouillon, sans rien envoyer) et `envoyer`
(qui exige `confirme: true`). Le garde-fou est placé **avant** la lecture du
jeton Google, pour qu'un envoi non confirmé soit refusé sans qu'on ait seulement
approché Gmail — et pour rester vérifiable sans compte branché.

**Ne refonds jamais ces deux actions en une, et ne pose jamais `confirme: true`
par défaut côté app.** Ce drapeau atteste d'une validation que Raphaël a
réellement dite. `scripts/verifier-gmail.mjs` le vérifie sur la fonction
déployée : si ce contrôle vire au rouge, un e-mail peut partir sans son accord.

Le reste des actions : `list` (syntaxe de recherche Gmail), `read` (corps
lisible, citations du fil retirées, pièces jointes listées, marqué lu),
`piece_jointe` (récupère un document reçu, plafonné à 8 Mo). L'encodage MIME
vit dans `google-gmail/message.ts`, sans dépendance Deno pour être testable
sous Node — ses erreurs sont silencieuses (objet accentué en charabia, réponse
qui crée un fil neuf faute d'`In-Reply-To`), d'où les contrôles hors ligne.

La portée `gmail.modify` couvre la lecture, l'envoi et les pièces jointes :
aucune portée supplémentaire à demander à Raphaël.

### Un reçu au bout d'un lien : `document_lien`, et pourquoi il est gardé

Beaucoup de fournisseurs n'envoient pas le PDF, ils envoient une adresse (« ils
m'envoient un SMS avec la facture dans le lien »). L'action `document_lien` va
la chercher — mais **cette adresse vient d'un e-mail, donc d'un inconnu**.
Sans garde-fou, c'est un client HTTP offert à qui veut, à l'intérieur de notre
infrastructure, et rien ne se verrait à l'usage.

`google-gmail/lien.ts` impose donc : https seul, aucune adresse interne
(boucle locale, réseaux privés, et `169.254.169.254`, l'adresse des métadonnées
de l'hébergeur), redirections suivies **à la main et revalidées une par une**
— une adresse publique peut rediriger vers l'intérieur —, taille plafonnée à
8 Mo, et seuls un PDF ou une image acceptés en retour. **Ne relâche aucun de
ces contrôles** ; `scripts/verifier-gmail.mjs` les vérifie tous hors ligne.

### Les messages programmés (`messages_programmes`, migration 0017)

La table ne sait pas envoyer, et ne doit jamais le savoir : décision de Raphaël
du 3 sept., on reste sur le téléphone et rien ne part sans qu'il appuie. D'où
`statut`, où **« annoncé » est distinct de « envoyé »** — un message que Jarvis
a présenté sans réponse ne doit pas disparaître de sa liste comme s'il était
parti. `canal` reste `null` tant qu'il n'a pas dit WhatsApp ou SMS.
Client : `src/lib/messagesProgrammes.ts`.

## Requêtes SQL : passer par `scripts/sql.sh`, pas par l'outil MCP

**N'utilise pas `mcp__Supabase__execute_sql`.** Le serveur MCP Supabase marque
cet outil « exige une interaction humaine » : le pop-up de validation s'affiche
à **chaque** appel, même en mode `auto`, même en `bypassPermissions`, aucune
règle d'autorisation ne le saute et il n'offre jamais « ne plus demander ».
Raphaël travaille depuis son téléphone et ne veut plus cliquer. Ne perds pas de
temps à chercher un réglage qui l'enlèverait : il n'existe pas, ça a déjà été
cherché (3 sept. 2026).

À la place :

```bash
scripts/sql.sh "select id, title, status from dev_items where archived_at is null;"
```

Le script appelle la fonction `public.exec_sql` (migration `0010_exec_sql.sql`)
via l'API HTTPS, avec la clé `SUPABASE_SERVICE_ROLE_KEY` fournie par
l'environnement cloud. Il passe par Bash, donc sans validation. Il renvoie du
JSON (`ok`, `rows`) et sort en code non nul si le SQL a échoué.

**Cette clé donne un accès total à la base**, DDL et suppressions comprises,
sans que Raphaël voie rien passer. C'est son choix explicite, en connaissance
du risque. En contrepartie la règle ci-dessous n'est pas négociable :
**demande-lui toujours avant un `drop`, un `delete` massif ou un `truncate`.**
Le garde-fou, c'est nous.

Si `SUPABASE_SERVICE_ROLE_KEY` est absente, le script le dit et s'arrête :
repasse alors par l'outil MCP (avec le pop-up), et préviens Raphaël que la
variable manque dans son environnement.

Pour le DDL, écris une migration numérotée dans `supabase/migrations/` — le
dépôt reste la source de vérité — puis applique-la avec `scripts/sql.sh`.

**Une seule instruction par appel quand tu attends un résultat.** `exec_sql`
enveloppe la requête pour en récupérer les lignes en JSON ; une enveloppe ne
peut contenir qu'une instruction. Si tu en mets plusieurs séparées par `;`,
elles **s'exécutent bien, mais tu ne récupères aucune ligne** — la réponse
contient `"rows": null`. Le piège est silencieux : tu croirais que la table
est vide alors qu'elle ne l'est pas. Ne groupe donc jamais deux `select`, ni
un `update` et son `select` de vérification, dans le même appel.

Puisqu'il n'y a plus de pop-up, enchaîner les appels ne coûte plus rien :

```bash
scripts/sql.sh "update dev_items set status = 'done' where id = '...';"
scripts/sql.sh "select id, status from dev_items where id = '...';"
```

**Grouper reste bon pour les écritures**, dont on n'attend pas de lignes :
plusieurs `update`/`insert` liés, ou une structure complète (table + index +
policies RLS + trigger). Fais juste la vérification dans un appel séparé.
**Sans `begin; … commit;`** : `exec_sql` refuse les commandes de transaction
(« EXECUTE of transaction commands is not implemented », constaté le
4 sept.) — et de toute façon un appel est déjà exécuté d'un bloc.

Et dans tous les cas, ne fais pas un appel par ligne à mettre à jour :
`where id in (...)`, `update ... from (values ...)` ou des `case when`.

## Réglages personnels : une clé de plus se déclare

Tout ce que Raphaël enregistre (tâches, chantiers, documents, contacts,
rappels, souvenirs, prononciations) vit en base et ne peut pas être perdu par
une mise à jour de l'app. Ses **réglages**, eux, vivaient dans le seul
`localStorage` du téléphone : préservés par une mise à jour normale de l'APK,
mais effacés par une réinstallation ou un nettoyage des données — l'image du
réacteur qu'il a importée comprise.

Depuis le 3 sept. 2026, ils sont recopiés dans la table `reglages`
(migration 0014) et restaurés à la connexion. **Si tu ajoutes une préférence
stockée en local, déclare-la dans `REGLAGES` (`src/lib/reglages.ts`) et
écris-la avec `ecrireReglage()`** — sinon elle ne remontera jamais en base et
sera perdue à la prochaine réinstallation, en silence.

Depuis le 4 sept., cette déclaration porte aussi **où le réglage se règle**
(`ou`) et **le fichier qui porte ce contrôle** (`fichier`) : les deux moitiés
de la règle sont donc écrites au même endroit. Une clé qui doit rester locale
va dans `STOCKAGE_LOCAL_ASSUME`, avec la raison.

Et ce n'est plus une règle de bonne volonté :
`scripts/verifier-reglages.ts` lit le code et refuse toute clé de stockage
local `jarvis_…` qui ne serait ni déclarée ni assumée comme locale. C'est ce
contrôle qui a trouvé `jarvis_app_ia` (l'application à qui poser une
question), fixée une seule fois à l'oral, invisible dans Paramètres et perdue
à chaque réinstallation — malgré la règle écrite partout depuis la veille.

Règle de résolution : à la connexion, la base gagne ; ensuite toute
modification locale y est poussée dans la seconde.

### Et une préférence se règle depuis Paramètres, pas depuis le code

Consigne de Raphaël, 3 sept. 2026 : **toute fonctionnalité qui introduit une
préférence livre son réglage avec elle, dans le même travail.** Il ne veut pas
avoir à demander qu'on code chaque activation ou changement de préférence.
C'est une règle permanente, pas un chantier à finir : elle s'applique à chaque
nouvelle fonctionnalité, indéfiniment. Le chantier « Ajouter dans les réglages
tous les paramètres nécessaires » reste ouvert exprès, comme rappel.

Deux exigences distinctes, et il faut les deux :

1. La clé est déclarée dans `CLES_REGLAGES` — sinon elle est perdue à la
   prochaine réinstallation (ci-dessus).
2. Un **contrôle existe dans Paramètres** — sinon la préférence est invisible
   et figée sur la valeur posée au départ.

Le cas qui a fait écrire cette règle : les trois applications par défaut
(musique, itinéraires, canal des messages) étaient bien déclarées et
synchronisées, donc conformes au point 1 — mais fixées une seule fois par une
question orale, sans aucun contrôle. Impossible de savoir ce que Jarvis avait
retenu, impossible d'en changer sans toucher au code. Conforme à la moitié de
la règle, inutilisable en pratique. Réparé par la carte « Tes applications par
défaut » (`src/components/settings/AppsParDefaut.tsx`).

Une préférence qu'un seul chemin permet de poser — une question orale, une
détection automatique, une valeur par défaut — se règle **aussi** depuis
Paramètres. Au minimum : la voir, et pouvoir l'effacer.

## Le thème sombre existait déjà, et rien ne l'allumait

Trouvé le 4 sept. : le bloc `.dark` de `src/index.css` définit une
quarantaine de couleurs depuis le début du projet, et **aucun composant n'a
jamais posé la classe `dark`**. Réparé — `ThemeProvider` (next-themes) dans
`App.tsx`, carte dans Paramètres › Apparence.

Deux points à ne pas défaire : la clé de stockage est **la nôtre**
(`jarvis_theme`, pas celle par défaut de la bibliothèque), sans quoi le choix
n'entrerait pas dans les réglages recopiés en base ; et on passe par
next-themes plutôt qu'un bricolage maison parce que `components/ui/sonner.tsx`
lit déjà son état — sinon un toast clair s'afficherait au-dessus d'un écran
sombre.

## Les heures de silence protègent son sommeil, pas son attention

Sa demande du 6 sept. 2026 : « concernant les heures de silence, si on
l'utilise pour lancer une action, il faudrait que ça marche, oui. » Le cas
visé est le rappel qu'il a demandé LUI-MÊME le soir (« rappelle-moi dans dix
minutes ») : il partait sur le canal muet, et vu de son fauteuil il avait
demandé quelque chose sans que rien ne se passe.

La règle, en une phrase : **elles taisent ce que Jarvis INITIE pendant qu'il
ne s'en sert pas, jamais ce qu'il a demandé.** En pratique, deux signes
suffisent à lever le silence (`ilSenSertMaintenant`, pur, dans
`annonceVocale.ts`) : l'app est à l'écran, ou il a parlé à Jarvis il y a moins
de quinze minutes.

**Le quart d'heure se raisonne à partir de SA phrase type**, « rappelle-moi
dans dix minutes » : dix minutes tomberaient exactement sur la limite et
rateraient le cas qu'il décrit. Au-delà, on parlerait la nuit longtemps après
qu'il a reposé le téléphone.

**`dansLaPlageSilencieuse` n'a pas bougé**, et son passage par minuit non plus
— c'est `raisonDuSilence` qui ne l'applique plus quand il s'en sert. Et
l'interrupteur « Sauf si je viens de te parler » (Paramètres › Notifications,
sous les heures de silence) existe pour le cas inverse : lire au lit à côté de
quelqu'un qui dort.

**« Il vient de me parler » se lit dans `journalEcoute.ts`** (`derniereParole`),
pas dans le moteur d'écoute : tout ce qui l'entend passe déjà par
`noterEcoute` — micro classique, mode Live, widget. Un seul point à brancher,
aucun chemin oublié. C'est en mémoire et pas en base, exprès : la question est
« est-ce qu'il s'en sert EN CE MOMENT », et une valeur relue après un
redémarrage répondrait « oui » à propos d'hier soir.

## Les notifications : Jarvis ne notifie QUE ce qui vit chez lui

Livré le 4 sept. 2026 (chantier 5d03a192). `@capacitor/local-notifications`,
aucun serveur : les rappels sont des alarmes posées sur le téléphone, donc ils
sonnent même app fermée, et le plugin les repose tout seul après un
redémarrage.

**La règle d'aiguillage, formulée par Raphaël, commande tout le reste** : ce
qui décide, ce n'est pas qui a initié la demande, c'est **où la chose
atterrit**. Une tâche, un chantier → base de Jarvis → Jarvis notifie. Un
rendez-vous d'agenda, un mail → chez Google → **Google notifie, on se tait**,
même quand c'est Jarvis qui les a créés. C'est pour ça qu'il n'y a aucun
interrupteur « agenda » ni « mail » dans Paramètres : leur absence est la
décision, pas un oubli. La raison est écrite en bas de la carte pour qu'on ne
se repose pas la question.

Ce qu'il a accepté (fiche 7d87dcb4, doc `fiche/notifications`) : échéance
d'une tâche, point du matin (09:15 par défaut, **activable et réglable**,
c'est sa consigne écrite), nouvelle version d'APK, chantier livré, session
bloquée. Refusés : message programmé, agenda, mail.

Trois fichiers, et la frontière entre eux compte :

- `src/lib/notifications/plan.ts` — **pur**, aucun appel à Android, à la base
  ni à React. C'est la seule partie vérifiable sans téléphone, et c'est là que
  vivent les décisions qui peuvent être fausses en silence (un rappel dans le
  passé qu'Android ferait sonner en rafale, une tâche faite qui sonne quand
  même, deux tâches sur le même identifiant). Vérifié par
  `scripts/verifier-notifications.ts`.
- `src/lib/notifications/service.ts` — le pont Android : permissions, canaux,
  alarmes. Ne se vérifie que sur l'appareil, d'où le bouton « Tester » de
  Paramètres.
- `src/hooks/useNotifications.ts` — monté **une seule fois, dans
  `JarvisDataProvider`**, jamais dans Paramètres : les rappels doivent être
  reprogrammés dès qu'une tâche change, y compris par la voix ou depuis un
  autre appareil. Monté dans l'écran de réglages, il ne reprogrammerait plus
  rien dès qu'on quitte l'écran.

Les identifiants sont répartis en plages (`PLAGE_ECHEANCE`, `PLAGE_MATIN`, …)
et `estNotreNotif()` garde l'annulation : on n'annule jamais une notification
qui ne vient pas de nous.

**Les heures de silence** (4 sept., initiative) ne suppriment ni ne décalent
rien : le rappel part sur un canal Android muet (`jarvis_nuit`, importance 2)
au lieu du canal sonore. Il est là au réveil, il n'a réveillé personne.
`dansLaPlageSilencieuse()` gère la plage qui passe minuit — une comparaison
naïve `début <= t < fin` serait toujours fausse sur 22:30 → 07:30, et la nuit
sonnerait comme le jour sans que rien ne le signale.

**Limite connue, à ne pas présenter comme livrée** : « chantier livré » et
« session bloquée » ne se déclenchent que pendant que l'app tourne — ils
viennent du temps réel Supabase, pas d'un push. App fermée, rien n'arrive.
Le vrai push (Firebase + Edge Function) est le chantier ouvert
« Notifications quand l'app est fermée ». Les trois autres (échéance, matin,
APK) fonctionnent app fermée.

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
- `.github/workflows/verifications-navigateur.yml` — les cinq parcours dans un
  vrai Chromium, à la taille d'un téléphone (cockpit, corbeille d'une tâche,
  réglages, « Vos conversations », moteur d'écoute). **Sur toutes les
  branches.** Séparé des contrôles hors ligne parce qu'il installe un
  navigateur : 91 s contre 25. C'est cette famille-là qui attrape ce qui casse
  à L'ÉCRAN — une carte qui ne se déplie pas, une corbeille qui supprime sans
  demander, un tableau qui déborde en largeur, une panne de chargement qui se
  lit comme une absence.
- `.github/workflows/verifications.yml` — les contrôles hors ligne (typecheck
  des projets référencés + les scripts `verifier-*.ts` sans réseau + la
  validité des XML Android). **Sur toutes les branches**, pas seulement le
  tronc : c'est le seul retour qu'une session obtient avant de fusionner.

Toujours vérifier que les deux workflows passent au vert après un push
(`mcp__github__actions_list` / `get_job_logs`), et se corriger soi-même en
cas d'échec avant de considérer un chantier terminé.

### Trois pièges vérifiés le 4 sept. 2026, qui coûtent cher

**« Deploy to GitHub Pages » vert ne veut pas dire que le dépôt va bien.**
Le workflow web passait pendant que « Build Android APK » échouait depuis
plusieurs commits — donc plus aucune mise à jour possible sur le téléphone,
sans que personne le voie. Regarde les **deux** workflows.

**Cet environnement n'a pas de SDK Android** (`SDK location not found`) : on
ne peut PAS compiler l'app ici. Pour tout ce qui touche `android/**`, la CI
est la seule preuve — pousse, puis lis le workflow. Ne dis jamais « ça
compile » sans elle.

**`npm run build 2>&1 | tail -2 && git push` pousse même si le build
échoue** : le code de sortie est celui de `tail`. Utilise `${PIPESTATUS[0]}`,
ou pas de pipe avant un `&&`.

Et avant de conclure qu'un fichier écrit par une autre session est cassé :
**`npm install`**. Un `node_modules` antérieur à son commit produit des
« Cannot find module » et des `any` implicites sur du code parfaitement sain.

**Un `--` est interdit N'IMPORTE OÙ dans un commentaire XML**, pas seulement
en bordure. Citer `--primary` ou `--foreground` (les variables CSS de l'app)
dans un commentaire de `android/app/src/main/res/**` casse le build entier,
avec un message qui ne parle pas du commentaire. Écris-les autrement, et
contrôle avant de pousser :

```bash
python3 -c "import xml.dom.minidom,glob;[xml.dom.minidom.parse(f) for f in glob.glob('android/app/src/main/res/**/*.xml',recursive=True)]"
```

## Mettre à jour sans réinstaller : le paquet web (4 sept. 2026)

Livré avec le chantier b5d210f9. Une app Capacitor, c'est une coquille
Android (plugins, permissions, widget) autour d'une interface web. La quasi-
totalité des chantiers ne touche QUE l'interface. Capacitor sait la servir
depuis un dossier du téléphone (`WebView.setServerBasePath`) : la CI publie
donc `web-bundle.zip` à côté de l'APK, l'app le télécharge (1,2 Mo mesuré sur la
release du 4 sept., contre 9,5 Mo d'APK), l'installe et redémarre dessus. Aucune réinstallation, aucune
autorisation « sources inconnues », aucun installateur à confirmer.

**Le « sauf si » de sa demande est décidé sur une mesure, pas sur le poids.**
La CI calcule une EMPREINTE du natif (`android/`, `capacitor.config.ts`,
`patches/`, et la version exacte de chaque plugin Capacitor lue dans le
lockfile) et l'écrit dans la release (`native: <hash>`) ET dans le bundle
(`VITE_NATIVE_EMPREINTE`). Si l'empreinte publiée diffère de celle de l'APK
installée, la mise à jour rapide est refusée et l'app dit qu'il faut
installer l'APK — sans quoi la nouvelle interface appellerait un plugin
absent de la coquille installée.

**Pourquoi on ne peut pas se retrouver avec une app morte** : le chemin n'est
rendu permanent (`persistServerBasePath`) qu'APRÈS que le nouveau paquet a
démarré et exécuté `demarrageMajWeb()` depuis `main.tsx`. Un paquet cassé ne
démarre pas, donc ne confirme jamais : fermer et rouvrir l'app suffit à
retomber sur la version précédente, et Paramètres affiche l'échec. Et
Capacitor efface lui-même le chemin enregistré quand l'APK change
(`Bridge.isNewBinary`, vérifié dans les sources) : installer une APK reprend
toujours la main sur un paquet téléchargé.

**L'empreinte fait bien ce qu'on lui demande, et c'est mesuré** (5 sept.) :
recalculée sur de vrais commits, elle est IDENTIQUE entre deux commits qui ne
touchent que `src/` (la mise à jour rapide est donc autorisée) et DIFFÉRENTE
de part et d'autre du commit qui a ajouté un plugin natif (elle est donc
refusée). Vérifié aussi côté CI : la ligne `native:` de la release est passée
de `77fe9fc7bc23fd79` à `ef2bc80e284a1128` après l'ajout de
`ReglagesSystemePlugin.java`, et rien d'autre. Pour la revérifier, recalcule
la même chose à deux références et compare :

```bash
git ls-tree -r <ref> -- android capacitor.config.ts patches
```

(plus la liste des plugins Capacitor du lockfile, comme dans
`android-build.yml`). Ce sont les valeurs RELATIVES qui comptent : une même
méthode aux deux références, puis on compare.

L'empreinte de l'APK installée ne se relève QUE pendant que l'interface
embarquée tourne (`getServerBasePath()` vide ou `"public"`) : une fois un
paquet appliqué, `BUILD_NUMBER` et `NATIVE_EMPREINTE` décrivent le paquet, pas
l'APK. Ne déplace pas cette lecture.

Répartition des fichiers, et la frontière compte :
`src/lib/majPaquet.ts` est **pur** (verdict, garde anti-« ../ », encodage
base64 par tranches) et se vérifie sans téléphone
(`scripts/verifier-maj-web.ts`, 19 contrôles) ; `src/lib/majWeb.ts` parle à
Capacitor ; `src/hooks/useMajWeb.ts` est monté dans `JarvisDataProvider`,
avec `useUpdateCheck` — pas dans Paramètres, sinon rien ne se vérifie ni ne
s'applique tant qu'on n'ouvre pas cet onglet.

**Non vérifié sur appareil** (aucun SDK Android ici) : le redémarrage réel de
la WebView sur le dossier téléchargé. La CI prouve que ça compile, pas que ça
tourne.

**Et ça n'a effectivement jamais tourné, du 4 au 5 sept.** Raphaël a reçu
`open failed: ENOENT` sur `bundles/165.zip` : `downloadFile` est le chemin
DÉPRÉCIÉ de `@capacitor/filesystem`, sa mise en œuvre ouvre un
`FileOutputStream` sur le chemin demandé et **ne lit jamais son option
`recursive`** (seul `writeFile` l'honore). Personne ne créait `bundles/`, donc
le premier téléchargement mourait — chez tout le monde, à chaque fois.
Corrigé par `creerRacineBundles()` (commit `b538cb4`).

Deux leçons, et la seconde vaut au-delà de ce chantier. **Un « mesuré » qui ne
mesure pas la même chose que ce qu'on affirme ne vaut rien** : le « 1,2 Mo
mesuré » pesait le fichier publié, pas une installation réussie, et il a servi
de preuve à un chantier qui ne marchait pas. Et **un contrôle doit être essayé
à l'envers avant d'être cru** : la première version de celui-ci cherchait
`Filesystem.mkdir` n'importe où dans `majWeb.ts` et restait verte quand on
supprimait l'APPEL — elle voyait la définition de la fonction d'aide. Elle lit
maintenant le corps de `appliquerBundle`. Même piège que le sélecteur
Playwright du 4 sept.

## Télécharger l'APK : DownloadManager ne peut pas être le seul chemin

Le 6 sept. 2026, Raphaël ne pouvait plus mettre à jour DU TOUT — « installée
build 206, publiée 207 », il appuie, « Téléchargement… », la barre vide,
« 0.0 Mo reçus » indéfiniment. **C'est le blocage qui bloque tous les
autres** : tant qu'il tient, aucun correctif touchant `android/` ne lui
parvient.

**La cause exacte n'a pas pu être établie d'ici** (aucun SDK Android, et le
défaut vit dans une application SYSTÈME d'Android). Ce qui a été corrigé, ce
sont les trois façons dont ce chemin pouvait rester MUET — et c'est ça, le
vrai défaut :

1. `enqueue()` n'était pas protégé. Sur Samsung et Xiaomi, l'application
   « Gestionnaire de téléchargement » se désactive : `getSystemService` rend
   null ou `enqueue()` lève, et la promesse n'était alors ni résolue ni
   rejetée — l'écran restait sur « Téléchargement… » pour toujours.
2. `STATUS_PAUSED` n'émettait aucune progression. Une attente du Wi-Fi se
   lisait donc exactement comme un plantage : le dernier « 0.0 Mo » restait
   figé à l'écran. Il est émis, avec sa raison en clair.
3. Zéro octet reçu faisait attendre **dix minutes**. Vingt secondes sans le
   moindre octet, et on cesse d'attendre.

**Et il y a désormais deux chemins de repli, dans cet ordre.** Le premier est
dans `telechargerNousMemes()` : une simple `HttpURLConnection`, aucun service
système, aucune application tierce. Le second est le lien direct ouvert dans
son navigateur (`ouvrirLienExterne`) — un `<a href download>` ordinaire ne
sort jamais de la WebView, Capacitor l'intercepte.

`scripts/verifier-telechargement-apk.ts` (dans la CI) lit le code, faute de
SDK : il tient les quatre règles ci-dessus. **Essayé à l'envers, et deux de
ses contrôles étaient d'abord faux** — chercher `STATUS_PAUSED` n'importe où
restait vert quand on le retirait de la condition d'émission, et chercher
`ouvrirDansLeNavigateur` trouvait la définition de la fonction alors que son
`onClick` avait disparu. Même piège que `Filesystem.mkdir` le 4 sept. : un
contrôle doit viser l'APPEL, pas la présence du mot.

**Le compteur `download_count` de la release ne prouve rien à lui seul** :
republier l'asset le remet à zéro. Vérifié le 6 sept. — il valait 0 sur un
fichier mis en ligne trois minutes plus tôt.

## L'assistant du téléphone : ce qui qualifie Jarvis, et ce qui ne se peut pas

Raphaël, 5 sept. 2026, captures à l'appui : « voici le vrai paramétrage à
faire pour activer Jarvis dans le téléphone ». Son chemin Samsung : Paramètres
› Fonctions avancées › Touche latérale › Appuyer longuement › « Application
d'assistant numérique par défaut » › Autres applications.

**Le critère est celui d'AOSP, et il a été lu dans la source, pas cité de
mémoire** (`PermissionController`,
`AssistantRoleBehavior.getQualifyingPackagesInternal`, téléchargée depuis
android.googlesource.com). Deux branches, l'une OU l'autre suffit : un
`VoiceInteractionService` protégé par `BIND_VOICE_INTERACTION` (avec
`sessionService`, `recognitionService`, `supportsAssist`), **ou** une simple
activité EXPORTÉE répondant à `ACTION_ASSIST` avec `MATCH_DEFAULT_ONLY`.

**MAIS LA LISTE DE SAMSUNG NE REGARDE QUE LA PREMIÈRE.** Constaté par Raphaël
le 6 sept. 2026, captures à l'appui : `AssistOverlayActivity` remplissait la
seconde depuis le 4 sept., l'APK publiée la portait bien (vérifié en lisant
son manifeste binaire), et Jarvis n'apparaissait toujours pas dans « Autres
applications ». D'où `JarvisVoiceInteractionService` + sa session + un
`JarvisRecognitionService` qui ne reconnaît rien.

**Ce dernier n'est pas une fonctionnalité, c'est une case à cocher du
système** : `VoiceInteractionServiceInfo` refuse tout le service avec « No
recognitionService specified » si le XML n'en déclare pas — relevé dans la
source le 6 sept. Et le rejet est SILENCIEUX : rien à l'écran, rien dans les
journaux de l'app, Jarvis disparaît simplement de la liste. C'est pour ça que
`scripts/verifier-assistant.ts` lit le manifeste et le XML plutôt que de faire
confiance.

**Donc quand la liste d'Android ne montre pas Jarvis, la première question
reste : l'APK INSTALLÉE est-elle assez récente ?** Le piège est neuf depuis
la mise à jour rapide, et il trompe : l'interface est à jour, ce qui donne
toutes les raisons de croire l'app à jour, alors que le manifeste vit dans la
coquille Android, que seule une vraie installation remplace. La carte
« L'appui long sur la touche latérale » (Paramètres › Ce que Jarvis utilise)
interroge le système sur notre propre paquet, sur l'appareil, et le dit —
plutôt que de le laisser deviner. Depuis le 6 sept., elle regarde `service`
(le VoiceInteractionService réellement déclaré par l'APK installée), pas
`candidat` : se fier à `candidat` seul lui disait « Jarvis peut être choisi »
devant une liste où il n'était pas.

### Deux pièges de la fenêtre d'assistance, payés le 6 sept.

**UNE SEULE FENÊTRE DOIT MONTER UN MICRO.** `AssistOverlay.estOverlay()` est
asynchrone. Tant qu'elle n'a pas répondu, le routeur rendait la route « / » —
donc la coquille de l'app normale, donc un premier micro, qui consommait au
passage le drapeau « démarre l'écoute » posé par l'activité avant de se faire
démonter par la redirection. Le micro de la fenêtre d'assistance arrivait
40 ms plus tard, ne trouvait plus le drapeau, et attendait le mot-clé —
pendant que les deux se disputaient le micro du téléphone. À l'écran : « Dis
Jarvis pour lancer la conversation » au lieu d'une écoute, et rien qui
aboutit.

`App.tsx` n'affiche donc RIEN tant qu'il ne sait pas où il est
(`src/lib/demarrageOverlay.ts`, pur), et rend la fenêtre d'assistance
directement plutôt que par une redirection. **Ne remets pas de `navigate()`
vers `/assistant`** : c'est précisément ce qui montait deux micros. Un délai
maximum évite l'écran blanc si le pont ne répond jamais.

**LE MOTEUR DE RECONNAISSANCE-CROUPION NE DOIT JAMAIS ÊTRE CHOISI.** Dès que
l'APK a déclaré le VoiceInteractionService, `com.raphael.jarvis` est apparu
parmi les moteurs de reconnaissance de son téléphone — c'est
`JarvisRecognitionService`, qui ne reconnaît rien. S'il était retenu comme
moteur par défaut, Jarvis deviendrait sourd sans le moindre message. D'où
`android:selectableAsDefault="false"` dans `res/xml/recognition_service.xml` :
l'attribut est celui d'AOSP (`attrs.xml`, styleable `RecognitionService`), et
`findAvailRecognizer` s'en sert pour écarter les moteurs qui ne veulent pas
être choisis. Ne le retire pas.

### Prouver qu'une déclaration a bien atteint l'APK, sans téléphone

Un manifeste juste dans le dépôt ne prouve rien : c'est la coquille Android
publiée qui compte, et la mise à jour rapide ne la remplace pas. La release
se lit d'ici, et c'est la meilleure preuve atteignable sans appareil :

```bash
curl -sSL -o app.apk https://github.com/rnab26/Jarvis-assistant/releases/download/latest-debug/app-debug.apk
unzip -o -q app.apk AndroidManifest.xml 'res/xml/*'
strings -el AndroidManifest.xml | grep -F JarvisVoiceInteractionService   # manifeste : UTF-16
strings -a  res/xml/interaction_service.xml | grep -F recognitionService  # ressource : UTF-8
```

**Le piège, payé le 6 sept. : les deux ne s'encodent pas pareil.** Le
manifeste binaire se lit avec `strings -el` (UTF-16), la ressource XML
compilée avec `strings -a` (UTF-8). Utiliser `-el` sur la seconde ne rend
RIEN — et « rien » se lit exactement comme « la déclaration est absente ».
Vérifié sur la build 192 : les trois services, la permission, la meta-data et
les quatre attributs du XML y sont tous.

**Deux chemins qui n'existent pas, vérifiés : ne les retente pas.** L'action
qui mène pile sur l'écran du choix (`MANAGE_DEFAULT_APP` + `EXTRA_ROLE_NAME`)
est protégée par la permission de signature `MANAGE_ROLE_HOLDERS` ; et le rôle
assistant est `requestable="false"` dans `roles.xml`, ce qui ferme aussi
`RoleManager.createRequestRoleIntent`. On ouvre donc `VOICE_INPUT_SETTINGS`,
puis à défaut la liste des applications par défaut, et les derniers pas restent
écrits sous le bouton. Corollaire pour le chantier f5621562 : **l'appui long ne
peut pas avoir d'interrupteur dans l'app**, c'est un rôle exclusif d'Android
qu'une application ne peut ni s'attribuer ni se retirer.

## Le web se met à jour tout seul, l'app Android jamais

Piège découvert le 3 sept. 2026 : Raphaël pensait suivre les nouveautés en
temps réel, alors que son app installée avait pris un vrai retard (plusieurs
chantiers manquants, dont un indicateur censé justement détecter ce
décalage) — le lien de téléchargement de l'APK était cassé depuis un moment
et chaque tentative de mise à jour échouait silencieusement.

`deploy.yml` republie le site à chaque push : ce que Raphaël voit dans le
navigateur (ou en PWA) est **toujours** à jour, sans rien faire. `android-build.yml`
ne fait que publier un nouvel APK à télécharger — l'app installée sur son
téléphone reste figée sur l'ancienne version tant qu'il ne relance pas
l'installation lui-même. Un chantier « fini et CI verte » sur du code qui
touche `android/`, `capacitor.config.ts` ou du `src/**` utilisé par l'app
native n'est donc fini pour lui **que web**, pas encore en pratique côté
téléphone.

**Depuis le 4 sept., une nuance importante** : un chantier qui ne touche que
`src/**` s'applique par la mise à jour rapide (section précédente), donc SANS
réinstaller — et tout seul au démarrage si le réglage est laissé actif. Reste
vrai pour tout ce qui touche `android/`, `capacitor.config.ts`, `patches/` ou
un plugin Capacitor : l'empreinte du natif change, la mise à jour rapide est
refusée, et il faut vraiment installer l'APK.

**En terminant un chantier qui touche l'app Android**, le dire explicitement
dans la réponse à Raphaël (pas juste « CI verte ») : que ça nécessite une
mise à jour de l'APK pour être visible, et rappeler comment (bouton
« Mettre à jour » dans Paramètres). Le badge « À jour / Nouvelle version
disponible » de Paramètres est fait pour qu'il puisse vérifier lui-même à
tout moment — s'il n'apparaît pas dans l'app qu'il utilise, prendre ça au
sérieux : ça veut dire que ce qu'il a sous les yeux est déjà en retard sur
plusieurs chantiers, pas seulement le dernier.

### Comment on sait quelle version tourne (depuis le 3 sept. 2026)

Raphaël a passé une vingtaine de builds à télécharger et installer sans
que rien ne change, sans aucun moyen de s'en rendre compte. Trois pièces
ont été mises en place pour que ça ne se reproduise pas — ne pas les
défaire :

1. **Chaque APK a une identité.** `versionCode` = numéro de run du
   workflow Android, `versionName` = `AAAA.MM.JJ-b<run>-<sha court>`,
   injectés par la CI (`ANDROID_VERSION_CODE` / `ANDROID_VERSION_NAME`).
   Avant, toutes les builds annonçaient « 1.0 (1) » : Android ne pouvait
   pas distinguer une mise à jour d'une réinstallation.
2. **Paramètres affiche les deux versions** — celle installée et la
   dernière APK publiée. Une installation sans effet se voit donc
   immédiatement, au lieu de se deviner.
3. **La comparaison porte sur l'APK réellement publiée**, pas sur le
   dernier commit de la branche : l'app lit la release `latest-debug`
   via l'API GitHub et y trouve une ligne `commit: <sha>` écrite par le
   workflow. Corollaire : **le workflow Android n'a plus de filtre
   `paths`** — chaque push produit une APK, sinon les deux sources
   divergent à nouveau. Si tu modifies le corps de la release dans
   `android-build.yml`, garde les lignes `version:`, `build:`, `commit:`
   et `date:`, c'est le contrat que lit `src/hooks/useUpdateCheck.ts`.
