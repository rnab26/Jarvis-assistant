# Historique — Tâches, notes et dictée (titres, doublons, rangement)

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

## Une tâche cochée quitte la liste pour l'archive de SA catégorie

Chantiers `20435f77` et `7c37b6b0` (le second dit la même chose, archivé en
doublon), 15 sept. 2026. Ses mots : « Lorsque une tache est noté comme terminé
plutôt qu'elle reste dans la liste de tâches et que ca pollue visuellement je
veux quil y'a une section archives dans les différentes listes de taches et que
la tâche terminé bascule dedans apres l'avoir coché. »

`src/lib/archiveTaches.ts` est **pur** (`verifier-archive-taches.ts`), et le
premier de ses contrôles est un COMPTE : tout ce qui entre ressort d'un côté ou
de l'autre. Une tâche qui sortirait de la liste sans entrer dans l'archive
serait perdue pour de bon — **il n'y a pas de corbeille pour les tâches**,
contrairement aux chantiers.

Trois choses à ne pas défaire :

1. **Une dictée hors ligne n'est JAMAIS archivée**, même si son `status` dit
   « done ». Elle n'existe pas en base : la replier dans un dépliant la
   rendrait invisible alors que c'est précisément la ligne qu'il doit voir.
2. **La dernière cochée est en TÊTE de l'archive.** C'est la seule qu'il vient
   peut-être de cocher par erreur ; en bas d'une liste de trente, il faudrait
   défiler pour se rattraper.
3. **Le dépliant ne s'affiche pas quand il n'y a aucune terminée** — « 0
   terminées » est un contrôle mort, et une catégorie jamais entamée garde
   exactement la hauteur qu'elle avait.

**Le « Annuler » est celui du cockpit, pas un second.** `proposerAnnulation`
(`src/lib/annulation.ts`) est devenu générique dans le même travail : cocher
fait DISPARAÎTRE la ligne de sa vue, exactement comme un chantier archivé, et
deux retours en arrière côte à côte finiraient par ne plus durer le même temps.
L'annulation repasse par `toggleStatus` avec le statut D'ARRIVÉE — c'est lui
qui bascule, lui redonner celui de départ n'annulerait rien.

Réglage livré avec : Paramètres › Tâches et organisation › « Les tâches
terminées » (`jarvis_taches_archives_ouvertes`, replié par défaut, ce qu'il a
demandé).

### Le nom de la catégorie : centré, sur un bandeau, et il ne coûte rien

Sa demande du même jour, capture à l'appui (trois noms de catégorie entourés) :
« centre le nom des catégories de listes dans leur blocs respectifs et fait les
plus ressortir sans que ce soit trip lourd mais quon puisse mieux faire la
distinction dans les differents blocs de liste de taches ».

Pas de majuscules forcées — « HIPOUY » crie, et il demande justement que ce ne
soit pas lourd. Centré, semi-gras, sur un bandeau `bg-muted/40` avec un filet.

**Et la place a été PRISE, pas ajoutée**, comme dans le cockpit. Mesuré sur le
banc (390 × 844, trois catégories, sept tâches) : l'en-tête centré coûte +9
points par carte, et l'écart interne des cartes ramené de 16 à 8 points en rend
8 par intervalle. Bilan, archives repliées : **528 points avant, 515 après** —
le bandeau est gratuit, et il rend même treize points. Le budget est dans
`verifier-taches-web.mjs` (`BUDGET_LISTE`, 609 points archive ouverte) : **si
tu ajoutes quelque chose au bloc d'une catégorie, prends sa place quelque
part.**

Piège de mesure payé au passage : la hauteur de l'EN-TÊTE ne dit rien de son
coût réel. Il remonte dans le padding de la carte par une marge négative, donc
son `getBoundingClientRect` annonce 49 points là où la carte n'en gagne que 9.
Ce qui se mesure, c'est la liste entière.

## Le titre d'une tâche est ce qu'il y a À FAIRE (15 sept. 2026)

Chantier `7b2c99e2`. Sa phrase : « difficile de boucler l'ajout d'une tâche
sans avoir a faire des retouches manuelles ».

**Mesuré sur ses vraies dictées**, relues dans `echanges` :

    « note un rappel comme quoi je dois rappeler dan Marciano jeudi matin
      à 10h »   →  titre créé : « Un rappel comme quoi je dois rappeler dan
                   marciano matin »
    « rajoute une tâche dans les prélèvements de relancer Moli aujourd'hui
      avant midi »  →  « Dans les prelevements de relancer moli avant »

Le titre garde les mots de COMMANDE et perd ceux qui portent le sens. Sur une
liste de trente lignes, « Un rappel comme quoi je dois… » ne se lit pas.

**Sa décision, mot pour mot** : « Les deux : le modèle écrit, la règle
rattrape ». La consigne du serveur reste la première ligne de défense ;
`src/lib/titreTache.ts` (**pur**, `verifier-titre-tache.ts`) est le filet — et
il rattrape aussi les phrases comprises SANS le modèle (`commandeLocale.ts`),
où aucune consigne ne s'applique.

**Il nettoie un TITRE, pas une phrase.** C'est ce que sa décision dit : le
modèle écrit d'abord. Appliquer la même règle à la phrase brute reviendrait à
se passer de lui.

**Et il en fait le moins possible** : une amorce CONNUE, seulement en TÊTE, et
jamais si ce qui reste fait moins de trois caractères. Un titre coupé ment là
où un titre long se lit — d'où autant de contrôles sur ce qui ne doit PAS
bouger (ses vraies tâches : « Rappeler la banque Apoalim », « Acheter coque
airpods… ») que sur ce qui doit bouger. **Ne mets JAMAIS un verbe d'action
dans `AMORCES`** (« rappeler », « appeler », « relancer », « acheter ») : ce
sont eux le titre, et deux contrôles tombent si on le fait.

Le nettoyage est calculé **une seule fois**, en tête du `case "add_task"` de
`voiceActions.ts`, et c'est `titre` qui sert partout en dessous — la
supposition, le doublon, l'écriture et la phrase dite à voix haute. Nettoyer
plus bas ferait cohabiter deux titres : celui écrit en base et celui qu'il
entend.

**Deux de mes contrôles ne vérifiaient pas ce qu'ils annonçaient**, trouvé en
les essayant à l'envers. Celui sur la frontière de mot visait « Noteur de
frais », qu'aucune amorce ne touche : il restait vert quand on retirait la
frontière. Il vise maintenant « Note quelque chose d'important », où
« note que » est un vrai préfixe. Et celui sur « la plus longue amorce gagne »
était protégé par l'ORDRE de la liste, pas par la logique de longueur : il a
été remplacé par l'invariant qui compte pour lui — ce qui reste ne commence
jamais par un morceau de commande — qui rougit quand on casse l'un OU l'autre.

## Après « modifie la tâche », Jarvis dit la NOUVELLE valeur (23 sept. 2026)

Chantier `8b8b6d36`, ouvert tout seul par Jarvis. MESURÉ dans
`journal_ecoute`, le 22 sept. entre 22h22 et 22h24 : SEPT « modifie la
tâche… » d'affilée. Chaque modification avait bien eu lieu — mais la
confirmation disait `"<titre d'AVANT>" mise à jour.` Il entendait l'ancien
nom, concluait que rien n'avait bougé, et recommençait (la dictée alternant
« fonds » et « points », chaque tour annulait le précédent). Ni la
compréhension ni l'écriture n'étaient en cause : la PHRASE l'était.

`src/lib/phraseMiseAJour.ts` (**pur**, `verifier-phrase-mise-a-jour.ts`) dit
ce qui a changé avec sa nouvelle valeur (« renommée en "…" », « pour
vendredi 25 septembre à 10 h », « rangée dans Perso »), garde la tâche telle
qu'il la connaissait comme sujet de la phrase (c'est elle qu'il cherche des
yeux), et dit **« était déjà comme ça »** quand rien n'a vraiment changé —
plutôt qu'un « mise à jour » qui le laisserait croire à un effet. Même règle
pour `update_dev_item`.

## Une phrase à DEUX demandes n'est pas traitée sur l'appareil (15 sept. 2026)

Chantier `7b2c99e2`, sa plainte : « il fait 50% dans la première tâche et 50%
en recréant une autre tâche […] difficile de boucler l'ajout d'une tâche sans
avoir a faire des retouches manuelles ». Et sa décision quand je lui ai demandé
quoi faire d'une phrase qui en porte deux : « **vaut mieux exécuter les deux
dans l'ordre** ».

La consigne du serveur a été corrigée pour ça (« UNE PHRASE QUI PORTE DEUX
DEMANDES DOIT RENDRE DEUX ACTIONS, dans l'ordre où il les a dites »), et elle
marche — `verifier-commande-vocale.mjs` le vérifie sur la fonction déployée.

**Mais elle ne pouvait rien pour le cas qu'il décrit, parce que le modèle n'est
jamais appelé.** Mesuré dans `echanges`, 06:32:17 :

    « supprime la tâche Rappel Jonathan Ducamp ET crée la tâche Rappel
      Jonathan Dukan dans la partie perso… »
    → source: "appareil", réponse : « "Rappel Jonathan Ducamp" supprimée. »

Les règles de `commandeLocale.ts` capturent une queue gloutonne (`(.+)$`) et la
donnent à `meilleur()`, qui retrouve quand même la cible **par ressemblance**
malgré la seconde demande collée derrière. Elle disparaît sans un mot. **Avant
de corriger une commande vocale, regarde d'où la réponse est venue** — la leçon
de l'appel au répondeur du 5 sept., et elle a encore servi ici.

**La réponse est de se taire, pas de comprendre plus.** `secondeDemande.ts`
(pur) reconnaît « liaison + verbe de demande » et fait rendre la main à
l'appareil ; écrire ici un second analyseur de phrases le ferait diverger de
celui du serveur, et deux lectures du même « et » rangeraient la même dictée à
deux endroits.

**L'asymétrie justifie le seuil, et c'est ce qu'il faut garder en tête si on y
touche** : se taire à tort coûte un aller-retour d'une seconde ; parler à tort
perd la moitié de sa demande, en silence. Mesuré sur ses 40 vraies tâches
(**0** déclenchement à tort) et ses 290 vraies dictées (13 retenues).

**Ne mets JAMAIS dans `VERBES_DE_DEMANDE` un mot qui peut être un nom.** C'est
tout le garde-fou : ses vrais titres portent des « et » innocents — « Acheter
coque airpods ET clefs de voiture », « gocardless a relancer ET molly »,
« Appeler Yoni pour démarrer + data ET robot ». Ce qui suit le « et » y est un
complément. Deux contrôles tombent si on le fait.

**Le garde-fou n'est PAS posé sur la recherche ni sur l'itinéraire**, et ce
n'est pas un oubli : là, ce qui suit le « et » fait partie de la QUESTION
(« lance une recherche via Perplexity et demande-lui combien… »), rien n'est
perdu, et les renvoyer au serveur consommerait le quota gratuit que la
reconnaissance locale existe justement pour épargner.

### Et le serveur sait enfin QUELLE tâche attend une réponse

Même chantier, même journée. À 17:32:57, Jarvis venait de proposer une
catégorie pour « rappeler Dan Marciano ». Raphaël répond « non mets-le dans la
catégor » — **phrase coupée par la reconnaissance vocale**. Réponse reçue :

    « Dans quelle catégorie souhaites-tu que je déplace la tâche pour la
      banque Apoalim ? »

— une tâche créée **sept heures plus tôt**. Le modèle a choisi une cible parce
qu'il n'avait aucun moyen de savoir laquelle attendait : `resolveTranscript`
ne lui envoie que la phrase courante, jamais le tour précédent. **Exactement le
même défaut que pour la confirmation d'un envoi** (chantier `21cf48d2`), et il
se corrige pareil — en donnant au serveur l'état que seul l'appareil a.
`MicButton` joint donc `tacheEnAttente` (id, titre, ce qui lui manque), et
`blocTacheEnAttente` (`voice-command/index.ts`) en fait deux phrases de
consigne. **Vide, ça ne rend RIEN** — même règle que `ceQuiLAttend.ts`.

**Pas de version Live, et ce n'est pas un oubli** : en Live le contexte est
scellé à l'ouverture, une tâche créée pendant la conversation ne pourrait pas y
être ajoutée après coup.

**Et la réponse de catégorie acceptait six mots quand la sienne en faisait
sept.** « non mets-le dans la catégorie Leads » était refusée par
`reponseCategorie`, partait au serveur, et c'est ce qui a produit le
déplacement de la mauvaise tâche. Huit mots désormais, et « partie », « section »
et « le » rejoignent les mots d'introduction — **« dans la partie perso » est
son vocabulaire**, relu dans ses vraies dictées ; il dit « partie » au moins
aussi souvent que « catégorie », et « le » manquait là où « la » était présent.
Ce n'est pas le seuil qui protège d'une nouvelle demande prise pour une réponse,
c'est le **« reste vide »** : les deux refus mesurés tiennent (une phrase qui
dit autre chose laisse forcément des mots derrière elle).

Deux contrôles : `verifier-seconde-demande.ts` (hors ligne, essayé à l'envers
quatre fois) et deux cas de `verifier-commande-vocale.mjs` — dont **la moitié
qui compte** : une tâche en attente ne doit pas aimanter une nouvelle demande.

### Et une phrase COUPÉE se redemande sur l'appareil, jamais au serveur

**Le bloc `tacheEnAttente` a corrigé la cible et PAS la valeur, et c'est
mesuré.** Une fois le serveur mis au courant de la tâche qui attend, il a bien
visé « rappeler Dan Marciano » — et l'a rangée dans **« Perso »**, la catégorie
suggérée, c'est-à-dire exactement celle que son « non » refusait. Renforcer la
consigne (« s'il dit non, il REFUSE ta suggestion ; sinon demande ») n'y a rien
changé : essayé deux fois sur la fonction déployée, même réponse.

**Seul l'appareil sait qu'une suggestion vient d'être refusée**, donc c'est là
que ça se tranche — comme la confirmation d'un envoi (`21cf48d2`).
`reponseCategorie` a un quatrième verdict, `illisible` : il parle bien du
rangement de cette tâche, mais le nom n'est jamais arrivé. `commandeLocale.ts`
rend alors un `clarify` qui **NOMME la tâche** et liste les catégories — pas un
« cette tâche » vague, qui est ce qui lui a fait répondre à propos de la
mauvaise.

**Ce qui tient le silence est le MOT de rangement** (`categ|partie|section|
liste`), pas la longueur de la phrase : sans lui, « mets la musique dans la
voiture » dite dans les cinq minutes après une création de tâche serait prise
pour une réponse de rangement. Et c'est un PRÉFIXE (`categ`, pas `categorie`) :
sa phrase réelle était coupée sur « la catégor », qui est précisément le cas
qu'on traite. Les deux se vérifient à l'envers — remplacer le préfixe par le
mot entier fait rougir un contrôle, retirer le garde-fou en fait rougir trois.

**Mon propre contrôle bout-en-bout laissait passer ce défaut** : il vérifiait
que la bonne tâche était visée, pas la valeur posée. Une cible juste avec une
valeur fausse reste une tâche mal rangée — c'est-à-dire tout ce qu'il nous
reproche.

**Le serveur n'a pas pu être corrigé PAR LA CONSIGNE**, et c'est la leçon à
garder. Trois versions déployées et remesurées : sans consigne (106), avec une
consigne qui l'explique (107), avec un INTERDIT en toutes lettres (108). Les
trois fois, `update_task` avec la catégorie refusée.

**Ce qui a marché (16 sept., v109) tient en une ligne : on ne lui dit plus le
NOM de la suggestion.** L'app envoie `categorie_a_valider: true`, jamais
« Perso ». Il ne peut pas reposer ce qu'il ne reçoit pas — et privé de ce nom,
il fait spontanément ce que trois consignes n'avaient pas obtenu : il redemande
en NOMMANT la tâche (« Tu souhaites déplacer la tâche "Rappeler Dan Marciano"
dans quelle catégorie ? »). **C'est du code, pas de la prose.**

Mesuré dans les trois sens avant d'être écrit, sur la fonction déployée :
sans nom de catégorie dans la phrase → il redemande ; avec (« non mets-le dans
les leads ») → il range dans Leads, la bonne tâche ; une nouvelle demande
(« ajoute une tâche : acheter du pain ») → `add_task`, la tâche en attente n'est
pas touchée.

**NE REMETS PAS LE NOM DE LA SUGGESTION DANS LE CORPS ENVOYÉ AU SERVEUR** : le
contrôle bout-en-bout rougit, et le défaut revient tel quel. Le verdict
`illisible` côté appareil reste en place par-dessus — il évite l'aller-retour
réseau et couvre le cas où il ne nomme rien du tout.

### Le serveur inventait un rangement une fois sur deux (28 sept. 2026)

Chantier `e945ae83`. Trouvé le 27 sept. en vérifiant un déploiement sans rapport :
le cas « une reponse coupee vise la tache qui ATTEND » de
`verifier-commande-vocale.mjs` a rougi UNE fois sur une passe de 85, sans
signature de quota. **Rejoué six fois (`TOURS=`, ajouté pour ça) : 3 échecs sur
6.** Le garde-fou du 16 sept. ne tenait donc qu'une fois sur deux.

**LA CAUSE, bisectée sur la fonction DÉPLOYÉE, pas supposée.** Même fonction,
même consigne, même phrase, seul le CORPS change :

    corps complet (ce que l'app envoie)  → 3 échecs sur 6
    corps minimal (tâches + catégories)  → 0 échec sur 6

Ce n'est pas la consigne : elle porte déjà « INTERDIT : poser un category_id sur
cette tâche tant qu'il n'a pas PRONONCÉ le nom d'une catégorie », en toutes
lettres. C'est le CONTEXTE qui l'entoure qui la dilue — et trois consignes
renforcées avaient déjà échoué le 15 sept. (chantier `902bf94b`). **Donc du
code**, comme `recuTransmis.ts` : `voice-command/categorieInventee.ts` retire un
`category_id` que le modèle a inventé, et rend à la place la question qui NOMME
la tâche. Mesuré après déploiement (v128) : **8 tours sur 8 justes**.

**L'EXPOSITION RÉELLE EST PLUS ÉTROITE QUE CE CAS NE LE SUGGÈRE, et il faut le
savoir pour ne pas se tromper de correctif.** Vérifié en appelant la vraie
fonction pure : `reponseCategorie("non mets-le dans la catégor")` rend déjà
`illisible` sur l'APPAREIL, donc cette phrase-là ne part jamais au serveur. Ce
qui l'atteint, ce sont les phrases plus longues que la règle locale laisse
passer (mesuré : « non pas celle-là, mets-le plutôt dans la catégorie des leads
s'il te plaît », « non non, range-le dans les prélèvements plutôt que dans
perso » rendent toutes `null`). Le garde-fou serveur est la SECONDE ligne, pas
la première.

**`nommeUneCategorie` est GÉNÉREUX exprès, et c'est toute sa sûreté.** Ce
module s'interpose entre le modèle et ses tâches : croire à tort qu'il a nommé
une catégorie ne change rien (c'est l'état d'avant) ; croire à tort qu'il n'en a
nommé aucune **efface un rangement juste** et lui pose une question inutile.
Même asymétrie que `secondeDemande.ts`. D'où la reconnaissance par le DÉBUT du
nom (« l'administratif » vaut « Admin », « melisa » vaut « Melissa » — sa dictée
écorche les noms propres en permanence).

**TROIS LETTRES AU MINIMUM DE SON CÔTÉ, et c'est un vrai piège :** « mets-LE »
donne le mot « le », qui est un début de « LEads ». Le garde-fou ne se
déclenchait donc JAMAIS sur la phrase même qui l'a motivé — trouvé en lançant le
contrôle, pas en relisant le code.

**Et un contrôle sur dix ne servait à rien**, trouvé en les essayant à l'envers :
monter `DEBUT_SUFFISANT` à 20 laissait tout vert, parce que les préfixes sont
déjà reconnus dans les DEUX sens. Sa seule utilité réelle est un nom **mal
transcrit**, et ce cas manquait ; il est là maintenant, et la mutation rougit.

**La question est MOT POUR MOT celle de l'appareil** (`commandeLocale.ts`, verdict
`illisible`) : deux formulations pour la même situation lui donneraient
l'impression de parler à deux assistants. Le contrôle compare les deux SOURCES,
pas une paraphrase — même stratégie que `verifier-moteur.ts` pour les phrases
d'erreur.

**Ce qui n'est PAS couvert** : si le modèle range dans une catégorie DIFFÉRENTE
de celle qu'il a nommée, le garde-fou laisse passer — il ne vérifie que « a-t-il
nommé une catégorie », pas « est-ce la bonne ». Non mesuré, donc non traité.

### Redire une dictée coupée COMPLÈTE la ligne, elle n'en crée pas une seconde

Cinquième défaut du chantier `7b2c99e2`, mesuré le 16 sept. 2026 sur ses **298
vraies dictées** (`echanges`). Six paires consécutives où la SECONDE contient
la première mot pour mot, et ajoute quelque chose :

    2,1 s   « appeler Mel ma femme »          → « … à 23h19 »
    3,3 s   « lance la musique de Booba »     → « … DKR »
    3,5 s   « Mets-moi un rappel … Ducamp »   → « … échéance à 15h »
    4,6 s   « envoyer un message à ma femme » → « … lui disant que tu l'aimes »
    6,9 s   « vidéo sur YouTube »             → « … qui parle de motivation »
   23,0 s   « Itinéraire de Pierre Amikay »   → « … avec Waze »

**Les six sont le même phénomène, et il n'y a AUCUN faux positif** : le service
de reconnaissance rend un résultat final trop tôt, il redit sa phrase en la
complétant. Ce n'est pas une seconde demande.

**ON COMPLÈTE, ON NE REFUSE PAS — c'est le point à ne pas défaire.**
`deciderDoublonTache` (15 sept.) voit bien que les deux titres se ressemblent
et refuse le second. Mais **c'est le second qui porte l'échéance à 15 h** :
refuser perd ce qu'il vient d'ajouter, et le renvoie exactement à la retouche
manuelle dont il se plaint. `repriseDictee.ts` (pur) transforme donc la
création en complétion de la MÊME tâche.

**La relation de PRÉFIXE est tout le garde-fou**, pas une ressemblance : deux
demandes différentes ne commencent pas l'une par l'autre, mot pour mot.
« rappeler Dan » et « rappeler Mel » se ressemblent beaucoup et ne sont pas la
même demande. Et le préfixe s'arrête **sur une frontière de mot** — sans ça,
« appeler Daniel » reprendrait « appeler Danielle Cohen », qui est quelqu'un
d'autre.

**On n'écrase jamais avec du vide** : le modèle peut ne pas reposer un champ
qu'il avait déduit au tour d'avant (la catégorie, les notes). Seuls les champs
renseignés passent dans le `changes`.

Calculé dans `MicButton`, parce que c'est la seule couche qui tient la phrase
PRÉCÉDENTE — le serveur ne la voit jamais, comme pour la confirmation d'un
envoi (`21cf48d2`).

**Contrôle essayé à l'envers, et sa première version était FAUSSE.** Le cas de
la frontière de mot visait « appeler Dan » → « appeler Daniel Nakache » :
aplatie, la phrase fait onze caractères, donc elle tombait sur
`LONGUEUR_MINIMUM` (12) et jamais sur la frontière — retirer la frontière
laissait le contrôle vert. C'est le piège du contrôle qui vérifie autre chose
que ce qu'il annonce, **payé pour la cinquième fois** dans ce dépôt (sélecteur
Playwright, `Filesystem.mkdir`, `com.google.android.as`, le drapeau Live).
Il vise maintenant « appeler Daniel » → « appeler Danielle Cohen », quatorze
caractères, que seule la frontière peut arrêter.

**Ce n'est branché QUE pour les tâches, et ce n'est pas un oubli** : quatre des
six reprises mesurées visent la musique, un message, un itinéraire et une
vidéo — même défaut, conséquences différentes (une musique relancée se
rattrape, une tâche en double reste dans sa liste). Chantier `e4886791`, en
`[À CADRER]` : la bonne réponse n'est pas la même pour une musique relancée et
pour un message préparé deux fois — et « envoi de messages en son nom » est un
sujet qu'une session autonome ne prend jamais.

### « Prévenir puis refaire » : sa réponse à `e4886791`, pour les quatre familles

Sa décision, 17 sept. 2026, mot pour mot : « Prévenir puis refaire ». Quand il
redit une phrase en l'allongeant APRÈS qu'une PREMIÈRE action de la même
famille a déjà eu lieu (musique/vidéo lancée, itinéraire ouvert, message
préparé), Jarvis le dit avant de refaire, plutôt que d'agir une seconde fois
sans un mot.

`FamilleActionTelephone` (`src/lib/repriseDictee.ts`) porte trois familles —
`"media"` (musique et vidéo, même mécanisme `open_app` + `music_query`),
`"navigation"`, `"message"` — et `phraseRepriseAction` (pure) rend la phrase
d'annonce quand `estUneReprise` a déjà dit oui ET qu'une action de la MÊME
famille vient de partir (`dernierAppelTelephone()`,
`src/lib/actionsTelephoneVocales.ts`, en mémoire du module, jamais relu après
un redémarrage — même principe que `derniereCreation` pour les tâches).
Musique/vidéo/itinéraire livrés le 17 sept. (claude/telephone-batch-0917,
commit `fcc7161`) ; le MESSAGE (chantier `b02d70f5`), volontairement laissé de
côté ce jour-là — « envoi de messages en son nom » est un sujet qu'une session
autonome ne prend jamais —, complété le même jour dans une session où Raphaël
était en ligne.

**Pour le message, « refaire » veut dire RECOMPOSER LE MÊME BROUILLON, pas en
ouvrir un second.** `executerActionTelephone` PRÉPARE toujours sans jamais
envoyer (« Jarvis prépare, Raphaël valide ») : relancer `send_message` avec le
texte complet appelle `preparerWhatsApp`/`preparerSms` une seconde fois pour le
MÊME destinataire, qui affiche le texte à jour — pas de transformation façon
`completerPlutotQueCreer` (pas de ligne en base à cibler pour un message,
contrairement à une tâche). `dernierAppelTelephone()` ne retient donc la
famille `"message"` qu'au moment où un brouillon est RÉELLEMENT préparé
(après résolution du destinataire), jamais avant un échec.

**Pas de collision avec la relecture vocale (`ed32cbcc`,
`confirmationEnvoiVocale.ts`) ni avec la confirmation d'un envoi
(`confirmationEnvoi.ts`), qui partagent `dernierTourRef`** : leur flux de
relecture — quand il est actif (décoché par défaut) — retourne toujours AVANT
d'atteindre ce branchement dans `MicButton.runTurn`, donc les deux mécanismes
ne se déclenchent jamais dans le même tour.

## Une tâche perso qui est en fait un chantier (`src/lib/tacheOuChantier.ts`)

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

**Une demande de SECTION n'est pas un chantier**, depuis le 7 sept. 2026
(chantier `2d575977`). Sa dictée du 4 sept., « une nouvelle section de
chantier qui s'appelle fonctionnalité », était comprise par `chantierDeguise`
comme un CHANTIER — l'amorce « section » y vivait par erreur — et a produit un
chantier vide et incompréhensible (« Fonctionnalité », sans notes, archivé le
6 sept.). `sectionDeguisee` (même fichier) reconnaît maintenant à part les
tournures « une nouvelle section X », « une section qui s'appelle X », « range
ça dans une section X », avec la même prudence que pour le mot « chantier » :
une phrase de maçonnerie qui commence pareil (« une nouvelle section du
chantier Hipouy a été livrée ») ne doit PAS matcher — `ressembleAUneContinuation`
rejette un nom de section qui commencerait par un mot de liaison (« du »,
« est », « a »…) plutôt qu'un vrai nom. `ChantiersEgares.tsx` propose alors
« Créer la section » et vérifie D'ABORD qu'une section équivalente n'existe
pas déjà (`cleTheme`, insensible aux accents) — sinon « Ranger la tâche »
sans rien créer, même logique que pour un chantier déjà livré.

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

### « Ça ne s'actualise pas » : on rend la panne VISIBLE, on ne la devine pas

Chantier `ce69489b`, ses mots : « Les taches ne s'affichent pas en live et il
n'y a aucun moyen d'actualiser ». Deux reproches, et le second était vrai sans
réserve : `refresh` n'était atteignable que depuis l'écran d'erreur — donc
jamais quand le chargement avait RÉUSSI et que c'est le direct qui était tombé.

**Deux fausses pistes écartées avant de corriger, à ne pas reprendre :**

- Le temps réel marche côté serveur. `verifier-donnees.mjs` le prouve à chaque
  passage, sur `tasks` comme sur `dev_items`. Ce n'est ni RLS ni la publication.
- Le jeton qui expire n'est pas la cause. `useRealtimeRefresh` ne pose le jeton
  qu'une fois, ce qui donne toutes les raisons de le soupçonner — mais lu dans
  supabase-js 2.114 (`_handleTokenChanged`), un `TOKEN_REFRESHED` rappelle
  `realtime.setAuth` tout seul.

**Le vrai défaut : `subscribe()` était appelé SANS rappel.** Un
`CHANNEL_ERROR`, un `TIMED_OUT`, une socket qu'Android ferme en veille
passaient sans un mot. La bibliothèque retente d'elle-même (son `rejoinTimer`,
lu dans `RealtimeChannel.js`) : **on ne double donc pas sa boucle de
reconnexion**, on dit seulement où elle en est. Le hook rend
`{ statut, rebrancher }`, et un rejoint recharge la liste — pendant qu'il était
coupé, tout ce qui a changé ailleurs est passé à côté ; retrouver le direct
avec une liste périmée serait le pire des deux.

`src/lib/etatDirect.ts` est **pur** (`verifier-etat-direct.ts`) et **la moitié
de ses contrôles vérifie le silence** : « connexion » ne dit rien d'alarmant
(c'est l'état normal des deux premières secondes de chaque ouverture), et l'âge
de la liste ne s'affiche QUE quand le direct est coupé — tant qu'il marche, la
liste est juste par construction et « à jour il y a 3 min » serait du bruit
permanent. Le réseau l'emporte sur la coupure : dans l'ascenseur les deux sont
vrais, mais « les mises à jour ne passent plus » l'enverrait chercher une panne
dans l'app.

**Et la barre coûte 44 points, mesurés.** Sur l'onglet Tâches elle est
permanente : c'est là qu'il a réclamé le bouton, et un bouton qui n'apparaît
qu'en cas de panne DÉTECTÉE ne sert à rien le jour où la panne ne l'est pas.
Dans le cockpit elle est en `seulementSiProbleme` — essayée en permanence, elle
a fait passer le tableau des chantiers de 482 à 526 points et
`verifier-cockpit-web.mjs` a rougi. La règle du projet tient : si tu ajoutes
quelque chose au cockpit, prends sa place quelque part.

### Et tout le reste en direct, réglages compris (migration 0054)

Chantier `e687f0e2` (et `67dd962b`, la même demande dictée deux jours plus
tôt), 23 sept. 2026 : « un réglage doit s'appliquer instantanément ».
**Mesuré avant** : la publication `supabase_realtime` portait 9 tables, pas les
réglages — relus seulement à la connexion. Et un défaut muet :
`useEntrainement` s'abonnait à `sequences_entrainement`, absente de la
publication, donc « SUBSCRIBED » et jamais rien.

Sont maintenant diffusées aussi : `reglages`, `souvenirs`, `echanges`,
`place_reminders`, `prononciations`, `passes_autonomes`,
`sequences_entrainement`, `visites_cockpit` (et `ce_qui_marche`, 0053).
`verifier-donnees.mjs` prouve l'arrivée d'une écriture sur CHACUNE des 16.

Deux choix à ne pas défaire. **Un réglage distant n'est PAS appliqué pendant
qu'une modification locale attend de partir** (le délai d'une seconde de
`useReglagesSync`) : sa copie, plus ancienne, effacerait le geste qu'il vient
de faire. Et **le repère « Vu » ne recule jamais**, même en direct : un « Vu »
appuyé sur l'autre écran range le bandeau d'ici, jamais l'inverse.
`souvenirs` et `echanges` restent en identité de réplication par défaut (leur
empreinte de 384 nombres à chaque rattrapage) : une suppression faite ailleurs
s'y voit au retour au premier plan, pas en direct.

### La section suggérée à la saisie (`src/lib/suggestionTheme.ts`)

Calcul **local**, jamais un appel au modèle : ranger un chantier n'a pas à
consommer le quota gratuit qui a déjà laissé Raphaël sans Jarvis le 3 sept. La
suggestion s'appuie sur le vocabulaire des chantiers déjà rangés, elle affiche
les mots sur lesquels elle s'appuie, et **elle se tait quand rien ne se
détache** — une suggestion fausse est acceptée sans être relue, donc elle coûte
plus cher qu'une absence de suggestion.

## Une dictée qui part au mauvais endroit se corrige d'un mot

Sa demande du 6 sept. 2026 : « Si jarvis a un doute ou est-ce qu'il faut
déposer une requête ou un chantier il faut qu'il donne une supposition a
raphael ou bien raphael lui indique lui meme ou la placer. »

Ce qui existait (`tacheOuChantier.ts`, la carte de l'onglet Tâches) est du
RATTRAPAGE : ça répare après coup, parfois des jours plus tard — une de ses
demandes a dormi dans sa liste de courses, invisible de toutes les sessions.
`src/lib/ouVaCetteDictee.ts` (pur) traite l'INSTANT de la dictée.

- **On annonce, on ne demande pas.** Sa règle du 5 sept. tient : rien
  n'attend sa réponse. Jarvis range au mieux, DIT ce qui l'a fait pencher, et
  la correction reste possible — le compromis de `actionsTelephoneFenetre.ts`.
- **La correction DÉPLACE, elle ne recrée pas**, et n'efface qu'après avoir
  écrit ailleurs : l'inverse perdrait sa dictée si la seconde écriture échoue,
  et recréer sans effacer laisserait l'originale dans la mauvaise liste.
- **Elle est reconnue SUR L'APPAREIL** (`commandeLocale.ts`) : c'est une
  reprise dite dans la foulée, un aller-retour au modèle coûterait une seconde
  et une chance de plus de la comprendre comme une nouvelle demande.
- **Une seule règle de reconnaissance**, `chantierDeguise`, mesurée sur ses
  vraies lignes. Une seconde divergerait, et l'onglet Tâches ne dirait plus la
  même chose que la voix du même titre.
- **Le sens inverse n'est PAS détecté**, et c'est voulu : rien ne le mesure.
  La correction, elle, marche dans les deux sens.

**La moitié de `verifier-ou-va-cette-dictee.ts` vérifie le REFUS** : « ajoute
un chantier pour refaire la salle de bain » porte exactement les mêmes mots
que « mets-le en chantier ». La prendre pour une correction déplacerait la
ligne précédente AU LIEU de créer celle-ci — on perdrait sa demande et on
abîmerait la précédente, d'un coup.

## Une tâche sans date se rappelle d'elle-même ; sans catégorie, il valide

Chantier `eeca8cca`, élargi par Raphaël le 7 sept. 2026 à 13h40 : « mise a
part la date jarvis doit apprendre a me connaître […] il doit aussi savoir
définir dans quel contexte quel catégorie de tâche il faut l'ajouter si je ne
lui dit pas il doit me le suggérer a voix haute et je lui valide ».

**Deux règles différentes, et il ne faut pas les confondre.** La DATE
manquante suit la règle du 5 sept. (« on annonce, on ne demande pas ») :
Jarvis dit « sans date, dis-moi pour quand » et n'attend rien. La CATÉGORIE
supposée, elle, EST une vraie question — sa demande explicite pour ce cas
précis, l'inverse de la règle générale — et rien n'est écrit avant qu'il
valide.

- `src/lib/tacheDateEtCategorie.ts` (pur) reconnaît une réponse qui arrive
  dans la foulée (« vendredi », « demain matin », « oui », « plutôt dans
  Perso »), et surtout ce qu'il ne faut PAS prendre pour une réponse : une
  phrase longue qui ne fait que CONTENIR une date ou le nom d'une catégorie
  en passant (« demain je pars en voyage, ajoute une tâche pour réserver
  l'hôtel ») est une NOUVELLE demande, pas une réponse — la prendre pour
  telle daterait ou rangerait la MAUVAISE tâche.
- `src/lib/suggestionCategorie.ts` (pur) — même algorithme que
  `suggestionTheme.ts` (recouvrement de vocabulaire, silence quand rien ne se
  détache), adapté aux tâches et catégories plutôt qu'aux chantiers et
  sections.
- `commandeLocale.ts` reconnaît la réponse SUR L'APPAREIL, contre l'état tenu
  par `voiceActions.ts` (`derniereTacheEnAttente`, même mécanisme que
  `derniereCreation` pour « non, mets-le en chantier ») — fenêtre de 5
  minutes, comme la correction de destination.
- **Le serveur ne devine plus une catégorie en silence.** Avant, la consigne
  de `voice-command` lui disait de poser `category_id` « le mieux
  correspondant » sans le dire — l'inverse exact de sa demande. Une seule
  source de vérité désormais : le serveur ne pose `category_id` que si
  l'utilisateur l'a dit explicitement, sinon c'est le téléphone qui suggère
  et attend sa validation.
- `useTasks().addTask` rend maintenant l'id de la tâche créée (`{ id }`,
  jamais un objet reconstitué de valeurs qu'on n'a pas vraiment lues) : sans
  lui, impossible de compléter la MÊME tâche plutôt que d'en créer une
  seconde.

`scripts/verifier-tache-date-categorie.ts`, essayé à l'envers (désactiver le
garde-fou contre une phrase longue fait effectivement rougir le contrôle
avant d'être remis en place).

## Un chantier créé à la voix : la section et le titre se PROPOSENT

Chantiers `9369ad72` (classement automatique) et `1be8988d` (titres), tous
deux répondus par Raphaël le 17 sept. 2026, mot pour mot : « Proposer, je
valide » — même règle que `suggestionTheme.ts` (saisie manuelle du cockpit)
et `suggestionCategorie.ts` (tâches, ci-dessus). Avant, la consigne du
serveur disait explicitement à `add_dev_item` de « classer le chantier dans
un thème » — exactement l'inverse de sa décision, en silence.

**Deux défauts, MESURÉS sur ses vrais chantiers OUVERTS, pas supposés** :

```sql
select title from dev_items where archived_at is null
  and title ~* '^(dans |un |une |comme quoi)';
```

`54b307b1` (« Comme quoi tous les bruits exterieurs derangent le micro ») et
`b8a4befd` (« Dans le cockpit pour que tout »), tous deux créés le jour même.
**Ils ne se réparent PAS de la même façon**, et c'est le point à ne pas
perdre : le premier garde une amorce de dictée devant une phrase par ailleurs
complète (mesuré sur trois vrais titres « comme quoi… » du cockpit, aucun
tronqué) — réparable localement, comme `titreTache.ts` pour les tâches. Le
second est tronqué EN PLEIN MOT — sa note commence par « Dans le cockpit pour
que tout ce qui concerne le bloc mettre a jour… », le titre s'arrête à
« tout » : le contenu réel n'a jamais été synthétisé, et aucune règle locale
ne peut le reconstituer (retirer « dans le » laisserait « cockpit pour que
tout », toujours incompréhensible). Ce second cas se corrige côté consigne
serveur uniquement.

- `src/lib/titreChantier.ts` (pur) — `suggererTitreChantier`, mêmes
  garde-fous que `titreTache.ts` (une amorce CONNUE, seulement en tête,
  jamais si le reste est trop court) mais une liste d'amorces mesurée sur les
  vrais titres de chantiers, pas recopiée de celle des tâches : `AMORCES` n'y
  contient QUE `"comme quoi"` pour l'instant. **`null` quand rien de
  récupérable ne se détache** — proposer un fragment tout aussi
  incompréhensible serait pire que se taire.
- `src/lib/chantierEnAttente.ts` (pur) — le chantier en attente d'une
  validation (section et/ou titre), et la reconnaissance de la réponse. **Les
  deux suggestions se valident ENSEMBLE, d'un seul « oui »** : les poser comme
  deux questions séparées l'obligerait à répondre deux fois à la même
  création — le défaut que la fenêtre de complétion des tâches (date +
  catégorie) a déjà réglé en les regroupant. Mêmes verdicts que
  `reponseCategorie` (accepter / refuser / corriger / illisible), transposés
  aux sections. **100 % LOCAL, sans round-trip serveur** — à la différence de
  la catégorie des tâches, dont l'« illisible » repart au serveur : le volume
  mesuré (un seul cas réel de titre à corriger) ne justifie pas encore cette
  complexité, et une phrase coupée sur une section se redemande directement
  ici, en nommant le chantier.
- `voiceActions.ts` : `add_dev_item` ne calcule une suggestion de section que
  **quand le thème n'a pas été dit explicitement** — le serveur peut encore
  classer un chantier, mais seulement si sa consigne le lui a permis (il l'a
  nommé lui-même). `complete_last_chantier` (nouvelle action, reconnue
  UNIQUEMENT par `commandeLocale.ts`, jamais par le serveur) applique la
  validation. **Une correction de section ne touche jamais le titre en
  silence** : le titre ne se renomme que sur un « oui » entier.

**Trouvé en touchant ce code, corrigé dans le même travail** : `addDevItem`
ne distinguait pas un échec réel d'une écriture partie dans la file hors
ligne (contrairement à `addTask`, qui rend `{ id, enAttente }`) — un chantier
dicté hors réseau s'entendait donc répondre « ajouté au cockpit », exactement
le mensonge que `honnetete.ts` interdit pour les tâches depuis le chantier
9476c7a0. Réparé avec la même `phraseHorsLigne`, et `addDevItem` rend
maintenant le chantier créé (`DevItem | undefined`) plutôt que `unknown` —
c'est aussi ce qui donne l'id du chantier à la suggestion en attente.

**Et le titre garde SES accents** (23 sept. 2026). Les règles locales de
`commandeLocale.ts` comparent le texte APLATI (sans accents, en minuscules) ;
jusque-là le titre et la note d'un chantier ou d'une tâche en sortaient tels
quels — « Ameliorer la gestion des contacts lors », « programme » là où il
avait dit « programmé », « Appeler yoni ». `retrouverAccents(phrase, aplati)`
réaligne mot à mot sur la phrase dictée (un suffixe ne suffit pas : les mots
de date sont retirés du milieu). Les anciens contrôles de
`verifier-commande-locale.ts` ATTENDAIENT le texte aplati : ils figeaient le
défaut, ils ont été corrigés avec lui.

`scripts/verifier-chantier-en-attente.ts` : les deux titres réels mesurés
(un récupérable, un non), les verdicts de réponse, la fenêtre de complétion,
et la consigne serveur (plus posée de thème deviné, plus de titre tronqué).

## Un onglet dédié aux notes personnelles

Chantier `5ad49cc0`, 6 sept. 2026. Sa dictée : « creer un onglet dedie aux
notes personnelles pour une meilleure organisation, distinct des taches, des
documents et de la memoire ». Du texte libre, sans échéance et sans que
Jarvis en fasse quoi que ce soit tout seul — le seul des quatre endroits où
atterrit du texte à ne rien déclencher.

Table `notes` (migration 0036), même cloisonnement RLS que `tasks`, même
mécanisme temps réel que `tasks`/`categories`/`dev_items` (REPLICA IDENTITY
FULL + publication) — sans ça une note créée depuis le web resterait
invisible dans l'app ouverte. `src/hooks/useNotes.ts`, `NotesPage.tsx`
(onglet « Notes », entre Docs et Mémoire), `NoteFormDialog.tsx` (créer et
modifier, même dialogue). Le jeu complet attendu d'une liste : créer, voir,
modifier, supprimer (`ConfirmerAction`, comme partout dans l'app), chercher
(titre et contenu), et les états vide / chargement / erreur / « rien trouvé ».
Vérifié dans un vrai navigateur, écran de téléphone :
`scripts/verifier-notes-web.mjs`.

**L'action vocale est livrée depuis le 23 sept. 2026** (chantier `447560d1`,
sa dictée : « Ouvre un chantier comme quoi tu dois pouvoir créer des notes »).
Avant, « crée une note courses : lait » devenait une TÂCHE « Note courses :
lait » — la règle des tâches de `commandeLocale.ts` la prenait. Maintenant
`src/lib/notesVocales.ts` (pur, `verifier-notes-vocales.ts`) reconnaît, SUR
L'APPAREIL et donc aussi en Live : créer (« crée une note X : … », « nouvelle
note : … », « mets dans mes notes … », titre entre guillemets compris), lister
et chercher, lire une note, la compléter (« ajoute à la note X : … »), la
supprimer (avec « Annuler » huit secondes — une note n'a pas d'archive). Le
contenu garde les accents de SA phrase (`suffixeOriginal`), pas le texte
aplati des règles locales. **Ce qui n'est PAS une note**, mesuré sur ses 477
dictées : « note ça » (garder la réponse), « note un rappel… » (tâche), « note
que Dylan… » (mémoire), « une note de frais », « une note à la tâche X », et sa
dictée du 14 sept. « créer une note me rappelant d'appeler Adam… dans perso »,
qui est un rappel. Le serveur connaît aussi `add_note`/`list_notes`, **en
ligne depuis le 23 sept.** (chantier 2e40a764 : voice-command v124, live-jeton
v31) : en Live, une demande de note part à l'outil au lieu de « je ne sais
pas ».
`_shared/environnement.ts` (les deux consignes) connaît déjà l'onglet, pour
que Jarvis n'envoie pas Raphaël vers un écran qu'il ignore. Au passage, la
même mise à jour a corrigé une description devenue fausse depuis le 7 sept. :
elle comptait encore Paramètres comme un onglet alors qu'il vit désormais
dans un bouton en haut à droite.
