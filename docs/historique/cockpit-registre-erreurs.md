# Historique — Cockpit des chantiers (sections, registre des erreurs, « Où j'en suis »)

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

### Un thème sans section, ça se signale — ça ne se corrige jamais tout seul

Chantier 765af020, 6 sept. 2026. Mesuré, pas supposé : `dev_sections` en
déclarait 10 alors que les chantiers portaient 15 thèmes distincts — cinq
thèmes (dont « Site de Mélissa », 6 chantiers) n'avaient donc ni ordre, ni
description, ni la possibilité d'être renommés depuis l'app. La dérive vient
d'un thème écrit librement (voix, SQL d'une session, saisie) sans que rien ne
crée la section correspondante.

`src/lib/themesNonDeclares.ts` (pur, vérifié par
`verifier-themes-non-declares.ts`) compare les thèmes portés aux sections
déclarées via `cleTheme()` — même clé que partout ailleurs. La carte
`ThemesNonDeclares` (silencieuse quand tout est rangé, même famille que
« Ça existe déjà ») les affiche avec un bouton « Déclarer » par thème.

**Le bouton PROPOSE, il ne corrige rien tout seul** : un automatisme qui crée
une section à chaque nouveau thème fabriquerait des sections dans son dos,
pour un thème mal orthographié ou qui ne sert qu'une fois — c'est le même
choix que pour les doublons.

**Un thème qui n'a qu'un seul chantier ne mérite pas forcément sa propre
section.** Les cinq trouvés le 6 sept. : deux (« Site de Mélissa », « Le
cockpit ») avaient plusieurs chantiers et une raison claire de durer — ils ont
eu leur section. Les trois autres (« Comportement », « Intégration IA »,
« Tâches et rappels ») n'avaient qu'un chantier chacun, topiquement proches
d'une section existante : rattachés directement (`update dev_items set
theme = ...`) à « L'app elle-même » ou « Recherche et veille » plutôt que
d'éparpiller trois sections d'un seul élément.

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
faute de repère, plutôt que de présenter tout le cockpit comme nouveau.

**Le repère suit son COMPTE, plus son écran** (chantier `ae0f3a7b`, 6 sept.).
Il était local, avec pour raison écrite « la retrouver sur un autre appareil
n'aurait aucun sens » — et c'était faux pour lui : il utilise l'app ET le site
dans la même matinée. Il appuyait sur « Vu » sur le téléphone, et le site lui
réannonçait les quatorze mêmes chantiers livrés.

- La base porte la vérité (table `visites_cockpit`, migration 0025) ; le
  localStorage reste le chemin RAPIDE, parce que le cockpit s'affiche avant que
  le réseau ait répondu et qu'un bandeau qui apparaît puis disparaît est pire
  que pas de bandeau.
- **Le repère ne recule jamais**, et c'est le SQL qui le garantit
  (`marquer_cockpit_vu` fait un `greatest`), pas le client : deux écrans
  ouverts, celui qu'on quitte en dernier ne doit pas effacer le passage de
  l'autre.
- **Une panne de lecture ne se lit pas comme « tu n'as jamais rien vu »**
  (`repereApresLecture` dans `src/lib/cockpitVu.ts`) — sinon le bandeau
  réannonce six semaines de travail à quelqu'un qui vient de tout regarder.
  Et quand l'écriture échoue, le bandeau le DIT : « ce Vu ne vaut que sur cet
  écran ».
- `ANON_KEY=... node scripts/verifier-visite-cockpit.mjs` couvre ce que le hors
  ligne ne peut pas : le non-recul côté SQL et le cloisonnement RLS.

**Et une troisième catégorie de clé est née avec lui : `MIROIR_EN_BASE`**
(`src/lib/reglages.ts`). Une donnée qui doit suivre son compte sans être une
préférence ne va ni dans `REGLAGES` — qui obligerait à lui offrir un contrôle
dans Paramètres, et un réglage « date de ta dernière visite » n'a aucun sens —
ni dans `STOCKAGE_LOCAL_ASSUME`, dont la raison écrite dirait le contraire de
ce que fait le code. `verifier-reglages.ts` exige que la table annoncée existe
vraiment dans une migration : sans ça, la clé promettrait un partage entre ses
écrans que personne ne réalise.

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

### Un extrait, UNE fonction : `extraitAuMot` (`src/lib/journalBord.ts`)

Trois endroits du cockpit coupent un texte long pour l'afficher sur une ligne :
le bandeau « depuis ton dernier passage », la citation d'une réponse du
journal, et la ligne repliée d'un point qui attend sa décision. Il y en avait
**trois copies privées**, et la troisième a été la fois de trop.

**Mesuré le 17 sept. 2026 sur ses vraies données** : `CeQuiAttendTaDecision`
affichait le corps ENTIER de la question sur la ligne REPLIÉE. Ses cinq points
en attente faisaient 697, 561, 146, 110 et 86 caractères ; la carte montait à
**924 points de haut pour quatre points repliés** — 231 par point, là où une
ligne devrait en coûter 70 — et poussait « Où j'en suis » hors du premier
écran. C'est la même régression que celle déjà documentée ici (« la carte
faisait 616 points pour UN point »), dont la parade avait été de replier chaque
point : **replier ne suffit pas si la ligne repliée porte 697 caractères.**
Après correction, la carte fait 484 points, 161 par point.

Deux choses que la fonction fait et qu'il ne faut pas défaire : couper AU MOT
(une phrase coupée au caractère près se termine n'importe où), et écraser les
blancs AVANT de couper (une note de session contient des retours à la ligne,
qui feraient un extrait haut de cinq lignes pour trois mots).

**Ce qu'on n'a PAS fait, et pourquoi** : plafonner le nombre de points
affichés. Cette carte existe pour lui dire ce qui l'attend ; en cacher derrière
un « voir les autres » la viderait de son sens. Le texte entier apparaît quand
il OUVRE le point — c'est là qu'il en a besoin, pour répondre.

**Le débordement restant vient du bandeau, et c'est mesuré.**
`verifier-cockpit-reel.mjs` a maintenant deux mesures : avec le bandeau
« Depuis ton dernier passage » (1102 points le 17 sept., donc rouge) et une
fois qu'il a appuyé sur « Vu » (770, vert). Le bandeau est TRANSIENT et c'est
la première chose sur laquelle il agit. Sans cette seconde mesure, on ne sait
pas si le débordement se règle en un appui ou s'il faut reprendre de la place
ailleurs. **Le premier contrôle reste rouge exprès** : le raccourcir demanderait
de rogner le bandeau, dont le contenu a été décidé sur son retour du 6 sept.
(« les livrés se lisent TOUS »). C'est son arbitrage, pas le nôtre.

### Un chantier déplié montre sa dernière mise à jour, pas tout le pavé

Chantier `e71199d6`, 17 sept. 2026, captures à l'appui. Ses mots : « regarde
le pavé que je suis obligé de lire et de faire défiler pour comprendre quel
est le blocage […] je ne comprends même pas, donc j'avance même pas dessus. »
Déplier un vieux chantier (fa16146d, plusieurs sessions sur plusieurs jours)
affichait tout `notes` en entier, sans troncature — plusieurs milliers de
caractères, jargon technique, dates, IDs de commit.

**Ne JAMAIS raccourcir ni perdre le contenu réel des notes** — c'est la
mémoire du projet (section juste au-dessus : « un chantier garde ce qu'on y a
écrit »). Le correctif est uniquement dans l'AFFICHAGE.

`src/lib/derniereMajChantier.ts` (**pur**, `verifier-derniere-maj.ts`) isole
le DERNIER paragraphe des notes — les sessions ajoutent toujours leur mise à
jour à la suite des précédentes, séparée par une ou plusieurs lignes vides,
qu'elles l'introduisent par un « --- <date> », un « MISE À JOUR DU… », un
crochet « [EN COURS, <session>, <date>] » ou rien de tout ça (aucun en-tête
n'est systématique — mesuré sur plusieurs vraies notes avant de coder, la
ligne vide l'est). Le marqueur et l'intro d'origine ouvrent la note : ils sont
donc le PREMIER paragraphe, jamais pris pour la dernière mise à jour.

`DevItemCard.tsx` déplié montre cette dernière mise à jour seule, en tête.
Le pavé complet va derrière « Voir tout l'historique », qui RÉUTILISE
`CarteRepliable` (repliée par défaut) plutôt que d'inventer un second
accordéon — et ne s'affiche PAS DU TOUT quand il n'y a qu'une seule mise à
jour (rien à cacher, donc rien à proposer). **Cet accordéon est un composant
interactif : il doit rester HORS du `<button>` qui déplie la ligne**, comme
`HistoriqueChantier` déjà — un bouton dans un bouton casse le HTML.

**Mesuré avant/après sur fa16146d (vraies données, 17 sept.)** : 2050 points
déplié avant, 512 après — l'accordéon fermé. Le marqueur, lui, reste affiché
comme avant, inchangé.

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

**`[LIVRÉ — RESTE À CONSTATER SUR SON TÉLÉPHONE]`, ajouté le 7 sept. 2026
(chantier `cc2d9392`) : NE PAS le confondre avec `[LIBRE]`.** Le code est
fini, seul un essai sur l'appareil manque (installer l'APK, activer un accès
spécial…) — personne d'ici ne peut le faire. Deux chantiers réels
(`3f3ad20b`, `f5621562`) marqués `[LIBRE — reste la vérification…]` ont été
repris par une session autonome qui a refait un travail déjà livré, parce que
`chantiersPrenables` (`src/lib/passeAutonome.ts`) n'accepte QUE le marqueur
exact `libre`. Ce nouveau marqueur compte aussi dans « pour toi » (voir
`attendSaDecision`, `src/lib/etatChantier.ts`) — même mécanisme que
`[À CADRER]`, une seule notion pour « ça attend une décision ou un geste de
Raphaël », pas une deuxième à côté.

### Il répond sur un chantier « à constater », et ce qui marche est retenu (migration 0053)

Chantiers `56b1a074`, `fa209b63`, `6af9c51b`, `c2fd0205`, 23 sept. 2026. Ses
mots : « Impossible de répondre aux chantiers "à constater" dans le cockpit,
contrairement à ce qui est prévu pour les sessions Claude Code » ; « les
chantiers ne sont pas mis à jour quand les sessions terminent » ; « savoir bien
mémoriser lorsqu'on signale que quelque chose fonctionne bien pour ne pas
régresser ». **Mesuré le jour même** : 93f6ee23 portait son « Ca marche tres
bien » depuis six jours sans avoir été archivé — sa réponse partait dans le
journal, et rien au bout ne bougeait.

- **« Tu l'as essayé ? » — Ça marche / Ça ne marche pas**, sur la carte dépliée
  d'un chantier `a_constater` ET dans « Ce qui attend ta décision » (une seule
  ligne repliée, « N chantiers livrés attendent ton essai », un à la fois une
  fois ouverte — le budget de hauteur du cockpit tient ; en « Vue simple » ils
  suivent ses questions dans la même file). `ConstatChantier.tsx`.
- **Ça marche** archive, écrit sa réponse au journal, et l'inscrit dans
  `ce_qui_marche`. **Ça ne marche pas** exige ses mots et rend le chantier
  `[LIBRE — RETOUR DE RAPHAËL …]` : la session suivante le reprend. « Annuler »
  (8 s) défait les TROIS écritures.
- **La note se calcule en TypeScript** (`src/lib/constatChantier.ts`, pur,
  `verifier-constat-chantier.ts`) — le marqueur ne se lit jamais en SQL. Le
  crochet d'en-tête est REMPLACÉ seulement s'il est simple, non imbriqué, et
  porte bien « à constater » ; sinon le nouveau est posé au-dessus, séparé par
  une ligne de texte (deux crochets collés, `marqueurDe` lirait « reste à
  constater » avant « libre »). **Le crochet se lit en comptant les crochets
  imbriqués**, jamais avec `^\[([^\]]*)\]` : c'est le piège payé à la main le
  18 sept.
- **La base écrit tout d'un bloc** (`constater_chantier`) et **refuse si la note
  a bougé depuis que l'écran l'a lue** — sinon on écraserait ce qu'une session
  vient d'écrire. Son propre constat ne lui revient PAS en notification
  « chantier livré » (`jarvis.constat_par_raphael`, lu par
  `notifier_push_chantiers_livres`).
- **À la voix** : « parfait », « ça marche », « tout se passe bien » juste après
  une action (`satisfactionSignaleePar`, `retours.ts`) — rangé par famille
  d'action comme les échecs. Mesuré sur ses 477 vraies dictées : **zéro**
  déclenchement à tort. « c'est bon », « ok », « merci » n'y sont PAS : ce sont
  ses mots pour valider un envoi. **Le tour précédent n'est pas oublié** après
  un compliment, contrairement à une plainte : « parfait, vas-y envoie-le » est
  aussi une confirmation d'envoi.
- **Où ça sert** : le hook de démarrage a deux blocs de plus — « Ses réponses
  restées sans suite » (une réponse plus récente que le dernier changement du
  chantier dans `dev_items_historique`) et « Ce qu'il a confirmé qui MARCHE —
  ne le casse pas ». Et Jarvis le reçoit dans sa consigne
  (`_shared/ceQuiMarche.ts`, voice-command ET live-jeton).

`ANON_KEY=... node scripts/verifier-constat-reel.mjs` couvre ce que le hors
ligne ne peut pas : les trois écritures d'un bloc, l'annulation, le refus d'une
note périmée, le cloisonnement RLS, le regroupement des « parfait ».

### Un chantier garde ce qu'on y a écrit (migration 0027)

Initiative d'une session le 6 sept. 2026, chantier `765b3d02`. La raison est
écrite quelques sections plus haut, dans ce fichier même : « Le 5 sept. puis le
6, deux notes ont été écrasées de cette façon — l'une contenait un retour de
Raphaël qui n'était écrit nulle part ailleurs. » La parade était une consigne
(« relis la note dans un appel SÉPARÉ »), et une consigne qu'aucun mécanisme ne
soutient finit par être oubliée : c'est arrivé deux fois en deux jours.

**Un TRIGGER, pas une écriture côté app**, et c'est le point à ne pas défaire :
les notes sont réécrites depuis l'app, la commande vocale, `scripts/sql.sh` et
les sessions Claude Code. Un seul de ces chemins oublié, et la trace manque
précisément le jour où on en a besoin. `dev_items_historique` +
`tracer_changement_dev_item()`.

**Les réservations ne sont PAS tracées.** `claim_dev_item` tourne à chaque
passe autonome, toutes les heures : les enregistrer noierait en un jour les
changements qui comptent. Le trigger ne regarde que `title`, `notes`, `status`,
`priority`, `theme`, `archived_at`.

**Restaurer une note laisse elle-même une trace** (`restaurer_note_chantier`),
sinon on remplace une perte par une autre. Et on ne restaure QUE des notes :
rendre un ancien statut sans le dire ferait mentir le tableau.

Côté écran, dans la carte DÉPLIÉE et replié par défaut, chargé seulement quand
on l'ouvre — soixante cartes qui interrogeraient la base au montage rendraient
le cockpit inutilisable pour une information que personne ne regarde la plupart
du temps. Le budget de hauteur du tableau n'a donc pas bougé.

`src/lib/historiqueChantier.ts` (pur) tient la seule distinction qui compte :
une note **complétée** (l'ancienne y est encore) n'a rien à récupérer ; une
note **réécrite** en a tout. Seule la seconde propose « Revenir à cette note »,
et seule une perte de plus de 200 caractères mérite qu'on prévienne — un
signalement qui se déclenche à tort n'est plus lu du tout.

Deux contrôles : `verifier-historique-chantier.ts` (hors ligne, la lecture) et
`ANON_KEY=... node scripts/verifier-historique-reel.mjs` (le trigger depuis
n'importe quel chemin, le silence sur les réservations, la restauration tracée,
le cloisonnement RLS, et la suppression qui emporte l'historique).

### Une SUPPRESSION de dev_items, elle, ne laissait aucune trace (migration 0036)

Trouvé le 7 sept. 2026 (chantier `019144d8`) en enquêtant sur la disparition
sans explication du chantier `348ca1d3` : un vrai `DELETE`, pas un archivage,
entre le 6 sept. ~17h et le 7 sept. 04h12 UTC — zéro ligne dans `dev_log`,
zéro ligne dans `dev_items_historique`. Son contenu n'a été récupéré que
parce qu'une copie traînait par ailleurs dans une conversation ; sans elle,
il aurait été perdu pour de bon.

**La cause, vérifiée et pas supposée** :
`select * from information_schema.triggers where event_object_table =
'dev_items'` ne montrait qu'UPDATE. `tracer_changement_dev_item()` (migration
0027) ne s'était jamais déclenchée sur DELETE.

**Bloquer le DELETE aurait été plus simple, et c'était faux** : la
suppression est une vraie fonctionnalité du cockpit (bouton « Choisir » >
Supprimer, confirmée à l'écran) — `dev_items_delete_own` existe depuis la
migration 0003. La bonne réponse est de TRACER, pas d'interdire.

**Pourquoi une table séparée (`dev_items_supprimes`), pas
`dev_items_historique`** : `item_id` y référence `dev_items(id) on delete
cascade`. Une ligne de trace insérée avant le DELETE y serait emportée par ce
même DELETE — exactement le trou qu'on rebouchait. `dev_items_supprimes` n'a
aucun lien de cascade vers `dev_items` : elle survit à la suppression qu'elle
décrit. Un trigger `BEFORE DELETE` y copie la ligne complète (titre, notes,
statut, priorité, thème, dates), et `restaurer_chantier_supprime(p_id)`
recrée le chantier à l'identique — même logique que `restaurer_note_chantier`
de la migration 0027 : la restauration efface la trace pour ne pas pouvoir
recréer le même chantier deux fois.

Vérifié pour de vrai, avec un chantier créé et supprimé exprès (jamais un
vrai chantier de quelqu'un d'autre) : `ANON_KEY=... node
scripts/verifier-historique-reel.mjs` couvre maintenant aussi la trace posée
par le DELETE, son cloisonnement RLS, et la restauration qui rend le même
titre et la même note.

### Une trace de suppression ne doit jamais empêcher de supprimer un COMPTE (migrations 0044, 0055)

Deux fois le même défaut, à un jour d'écart. PostgreSQL supprime la ligne
d'`auth.users` PUIS applique les cascades ; un trigger `BEFORE DELETE` qui
écrit une trace (`dev_items_supprimes`, `taches_supprimees`) référençant ce
compte échoue alors sur sa clé étrangère (« Key (user_id) is not present in
table users »), et tout le DELETE du compte est annulé. La 0044 l'a corrigé
pour les chantiers le 8 sept. ; la 0045 (trace des tâches, le lendemain) a
recopié le mécanisme SANS le garde-fou, et la 0055 l'y a remis le 23 sept.

**Tout trigger de trace posé sur une table rattachée à `auth.users` commence
par** `if not exists (select 1 from auth.users where id = old.user_id) then
return old; end if;` — une trace dont le propriétaire a disparu ne peut plus
être ni lue ni restaurée (RLS `auth.uid() = user_id`).

Le symptôme est silencieux : les scripts de vérification créent un compte de
test, puis le suppriment sans lire le retour — cinq comptes `…@jarvis-test.local`
sont ainsi restés en base, et leurs « essai temps réel » apparaissaient au
démarrage de chaque session (le hook lit en service_role). `verifier-donnees.mjs`
lit maintenant ce retour, sur un compte qui a des tâches ET des chantiers :
c'est lui qui rougira à la prochaine trace sans garde-fou.

### Reprendre une discussion dans le journal (migration 0048)

Ses mots, dictés le 17 sept. 2026 à 07 h 57 : « Dans le cockpit dev : journal
de bord, incohérence sur la durée de consultation des conversations et
impossibilité de reprendre la discussion ». Il l'avait déjà dicté quatre
minutes plus tôt, en moins précis — les deux chantiers ont été fusionnés.

**MESURÉ le même matin, et c'est ce qui rend sa phrase limpide** : 304 entrées
au journal sur 14,5 jours, et **UNE SEULE** portait un bouton « Répondre ». Il
n'apparaissait que sur une question sans réponse (`kind === "question" &&
!answered_at`). Les 303 autres — 208 notes d'information des sessions, 18
blocages, 42 réponses, 30 entrées écrites par lui — n'offraient aucun moyen
d'enchaîner. Et l'écran n'en montrait que 60, **sans un mot** : 244 entrées
coupées en silence, ce qui se lit exactement comme « il n'y a plus rien ».

- `src/lib/filJournal.ts` — **pur**, vérifié par `verifier-fil-journal.ts`.
- Migration 0047 : `dev_log.repond_a`, et le rattrapage conservateur de
  l'existant (18 des 42 réponses, celles dont la question est certaine).

**On répond à TOUT**, et la tentation à écarter est de remettre une condition
« intelligente » : une note d'information est précisément ce à quoi il veut
pouvoir répondre, c'est par là que les sessions lui parlent.

**Mais « marquer traité » ne vaut QUE pour une question en attente** : c'est ce
drapeau qui la sort de la colonne « pour toi ». Poser `answered_at` sur une
note serait invisible aujourd'hui et faux le jour où quelque chose comptera les
entrées traitées.

**`repond_a` n'est pas `item_id`.** Le second dit sur quel CHANTIER porte une
entrée — plusieurs fils vivent sur le même chantier, et une entrée peut n'en
avoir aucun. Sans lien vers l'entrée précise, une réponse à une note retombait
dans le flux sans que rien ne dise ce qu'elle répondait : le défaut de départ,
à l'envers. `on delete set null` et pas `cascade` : effacer une question ne doit
jamais emporter la réponse de Raphaël.

**Et l'écran dit ce qu'il ne montre pas** (« 60 entrées affichées sur 304 » +
« Voir les 60 précédentes »), mais **se tait quand tout est affiché** — un
« 304 sur 304 » permanent est du bruit, et le bruit permanent cache le jour où
il dit autre chose. Le total vient de `count: "exact"` dans la MÊME requête que
la page : deux requêtes pourraient annoncer un total qui n'a jamais correspondu
à ce qui est à l'écran. Total inconnu (le compte a échoué, la liste est
arrivée) → on se tait.

**Piège du banc, payé ici** : un contrôle qui DÉPLIE le journal doit le
refermer. Déplié, il affiche le corps des entrées — dont celui d'une décision
qu'un contrôle plus bas vérifie comme absente de l'écran une fois répondue. Un
banc doit rendre la page dans l'état où il l'a trouvée.

### La durée des conversations : ce que l'app en disait était faux

Même signalement, l'autre moitié. `MemoirePage` affirmait « Le mot-à-mot des
conversations, lui, disparaît au bout de sept jours » — **à trois lignes de la
carte qui dit l'inverse**, « Combien de temps c'est gardé se règle dans
Paramètres › Mémoire (sans limite par défaut) ». Les deux sous ses yeux, sur le
même écran.

La phrase était vraie jusqu'à la migration 0023 (5 sept.), qui a sorti la durée
du code : `purger_echanges()` lit `retention_echanges(user_id)` et ne supprime
**rien** tant que le réglage vaut « sans limite ». Vérifié le 17 sept. sur sa
base : `retention_echanges` rend `null`, et 369 échanges couvrent 14,1 jours —
aucun purgé. La phrase a donc été retirée (une seule affirmation, dans la carte
qui montre les conversations), et le commentaire de `src/types/database.ts` qui
disait la même chose corrigé.

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
