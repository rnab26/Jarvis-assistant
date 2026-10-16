# Historique — Téléphone : contacts, applications, autorisations, contrôle d'écran

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

## Les applications proposées viennent du TÉLÉPHONE, jamais d'une liste écrite

Raphaël, 6 sept. 2026 : « il a une certaine logique de me demander pour un
itinéraire quelle application j'utilise, mais il ne sait pas la lancer. Il me
dit que je peux voir dans l'application à quelle application il a
l'autorisation — sauf qu'en aucun cas il y a Waze. Il n'y a pas les
applications qu'il y a. »

**Même cause racine que WhatsApp Business le matin même** : on supposait au
lieu de regarder. Trois défauts distincts dans cette phrase, et il fallait les
trois.

1. **Il n'y avait AUCUNE liste** pour les itinéraires ni la musique. Ces
   lignes de « Tes applications par défaut » montraient la valeur retenue et
   un bouton « Oublier », rien d'autre — seule la ligne Appels avait un vrai
   sélecteur. `listerApplicationsItineraire()` et `listerApplicationsMusique()`
   interrogent maintenant le système sur l'intent RÉELLEMENT lancé (`geo:`,
   `MEDIA_PLAY_FROM_SEARCH` + `CATEGORY_APP_MUSIC`), et `LigneAvecChoix`
   remplace les trois lignes. `CATEGORY_APP_MUSIC` a dû être ajouté aux
   `<queries>` : sans ça, un lecteur de musique est invisible depuis
   Android 11, en silence.
2. **Demander puis ne rien lancer est pire que ne pas demander.** Une
   préférence qui ne correspondait à aucune application installée retombait en
   silence sur le sélecteur d'Android, et Jarvis annonçait quand même « je
   t'ouvre l'itinéraire ». Il le DIT maintenant, et renvoie vers la carte.
3. **Il renvoyait vers le mauvais écran.** « Autorisations du téléphone » ne
   parle que de ce que le système laisse faire — il n'y a aucune application
   dedans. La consigne l'interdit explicitement, et un contrôle bout-en-bout
   le vérifie.

`scripts/verifier-apps-par-defaut.ts` (CI) tient les trois, et il a été essayé
à l'envers : viser la mauvaise liste, retirer le message d'application
introuvable ou la déclaration `<queries>` le fait rougir.

### « J'ouvre מכבי » : la cause était un nom VIDE, pas une phrase trop longue (23 sept. 2026)

Trois fois le 18 sept. (« Ouvre l'application WhatsApp », « … YouTube »),
après le 5 et le 6 sept. Les deux premières fois, on avait écarté les phrases
longues et les « un épisode » — des contournements, la cause restait.
`aplatir` (`actionsTelephone.ts`) ne gardait que `a-z0-9` : « מכבי » devenait
`""`, et `cible.includes("")` est vrai pour TOUTE demande. Le tri par longueur
mettait ensuite le nom vide en tête. Toute demande qui ne tombait pas pile sur
un nom ouvrait donc la première application au nom hébreu.

Maintenant : les lettres de tous les alphabets restent (`\p{L}\p{N}`), un nom
de moins de trois caractères ne se rapproche de rien, et « l'application X »
est retirée avant de comparer. `verifier-trouver-application.ts` (CI) rejoue
les deux phrases du 18 sept. — essayé à l'envers, quatre contrôles rougissent.
**Tout `aplatir` qui fait un `includes` doit garder les lettres hébreues** :
son téléphone est à moitié en hébreu.

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

## La lecture de liens et de PDF (chantier 13c39a9b)

La recherche (ci-dessus) était livrée depuis le 6 sept. ; il manquait la
seconde moitié du chantier : donner un lien à Jarvis — à la voix, ou par le
partage Android — et qu'il en rapporte le document.

**Rien de nouveau côté téléchargement : tout existait déjà, orphelin.**
`google-gmail/lien.ts` (SSRF, https seul, 8 Mo, PDF/image uniquement),
l'action serveur `document_lien`, et même le client `recupererDocumentLien`
dans `googleGmail.ts` étaient écrits depuis le 3 sept. (chantier `4dabe586`)
— mais **personne ne les appelait**. Ne réécris jamais ce mécanisme, il est
déjà vérifié par `verifier-gmail.mjs`.

**Trouvé en passant, et volontairement PAS corrigé ici** (thème différent,
chantier `4dabe586`) : `list_emails`, `read_email`, `prepare_email_reply`,
`send_email`, `find_receipts` sont dans l'énumération que le modèle connaît
et dans la consigne, mais **aucune de ces actions n'existe dans
`voiceActions.ts`**, et `googleGmail.ts` n'est importé nulle part ailleurs
que par ce chantier. Si le modèle les appelle, le client ne sait pas les
exécuter. Noté dans `dev_log` et dans la note de `4dabe586` — à la session
qui reprend ce chantier de vérifier ce que ça donne réellement.

**`document_lien` a été décorrélée de Gmail** (`google-gmail/index.ts`) :
elle répondait avant `compte_google_absent` si le compte Google n'était pas
branché, alors qu'elle ne touche jamais Gmail. Elle est traitée maintenant
avant la recherche du jeton Google — un lien donné à la voix marche même
sans compte connecté.

Deux chemins, tous les deux réels et vérifiés :
- **La voix** : un verbe d'introduction (« récupère », « va chercher »,
  « prends », « télécharge »…) suivi d'une adresse http(s) — reconnu
  LOCALEMENT (`commandeLocale.ts`, action `read_link`), comme `ask_ai` :
  une adresse dans la phrase ne veut jamais dire autre chose, pas la peine
  de consommer le quota du modèle pour ça.
- **Le partage Android** : `useShareReceiver.ts` distingue maintenant un
  texte partagé qui **N'EST QUE** un lien (`texteEstUnLien()`,
  `documentLien.ts`) d'un texte qui en contient un au milieu d'autre chose —
  sinon un message qu'il voulait garder tel quel serait remplacé par le
  document du lien. Ce n'est PAS le même chemin que le rapprochement d'une
  réponse d'IA (`allerRetourIA.ts`) : celui-ci se vérifie en premier (une
  question en attente prime), celui-là ne s'applique que si aucune réponse
  d'IA n'a été rapprochée.

`src/lib/documentLien.ts` (pur) décide tout ce qui peut se tromper en
silence : extraire l'adresse sans avaler la ponctuation de fin de phrase,
distinguer « lien seul » de « lien au milieu d'un message », et nommer le
fichier enregistré par le SITE d'origine plutôt qu'un horodatage nu — sinon
dix documents s'appelleraient tous « Document ». `lireDocumentLien.ts`
(non pur) relie lecture et enregistrement, et rend `{ ok, message }` : la
voix dit `message` dans tous les cas (succès ou échec), un toast le colore
en vert ou en rouge selon `ok`.

**Nouveau côté stockage** : `useDocuments.ts` gagne `saveBinaryDocument()`,
le pendant de `saveTextDocument()` pour un contenu binaire (PDF/image) déjà
encodé en base64 par le serveur — `saveTextDocument` écrirait un fichier
texte illisible pour un vrai PDF.

## « Garde ça » : reprendre la réponse d'une IA sans le geste de partage

Livré le 7 sept. 2026 (chantier `7d7967b2`, NIVEAU 3 de `0262afdf`). Avant, la
seule façon de ramener une réponse Perplexity/ChatGPT dans Jarvis était
l'appui long puis « Partager » (`useShareReceiver.ts`, toujours en place et
inchangé). Depuis le service d'accessibilité livré le 6 sept. (`3f3ad20b`),
Jarvis lit déjà l'écran de l'application du dessous — plus besoin de
`onHandleAssist`/`AssistStructure`, qui aurait exigé d'être l'assistant par
défaut.

`src/lib/ecranTelephone.ts` gagne `texteVisible()` : **l'inverse de
`resumeEcran()`**, qui ne garde que ce qui est cliquable (pour désigner un
bouton). Ici on veut tout le texte visible, paragraphes compris, dans l'ordre
de lecture, en écartant les doublons consécutifs (le même texte porté par un
conteneur ET son enfant — fréquent dans les arbres Android).

`src/lib/garderReponseEcran.ts` (non pur : appelle le plugin d'accessibilité)
relie lecture d'écran et rapprochement : il lit l'écran, passe le texte à
`rapprocher()` de `allerRetourIA.ts` — **le même module, les mêmes
garde-fous** que pour le partage (fenêtre de 30 min, texte trop court, « c'est
ma propre question repartagée ») — et enregistre par le même chemin que
`useShareReceiver.ts` (`saveTextDocument`). Pas un second mécanisme de
rapprochement ni un second chemin d'enregistrement.

**Reconnue LOCALEMENT** (`commandeLocale.ts`, action `garder_reponse_ecran`),
comme `move_last_entry` : lire l'écran est une décision qui vit sur
l'appareil, le modèle ne voit pas l'écran et n'a rien à faire dans cette
boucle. « garde ça », « retiens ça/sa réponse/cette réponse/la réponse »,
« note ça » — vocabulaire fermé exprès, comme pour la confirmation d'un envoi
(`confirmationEnvoi.ts`) : un faux négatif renvoie la phrase au serveur (qui
ne saura pas non plus, mais ne casse rien), un faux positif lirait l'écran
pour rien.

Si le service d'accessibilité n'est pas activé, la commande **le dit et
renvoie vers Paramètres** (`phraseEcran({ fait: "echec", cause:
"service_inactif" })`, déjà écrite) — jamais un échec silencieux.

## Les applications d'IA : l'IA reprend la main, ou Jarvis lit sa réponse

Chantier `acad6f74`, réponse de Raphaël le 5 sept. 2026 aux trois sens
possibles d'« intégrer les IA » (relayer / rapporter / répartir) :

1. **RELAYER** — « je pense que de façon générale c'est plus logique que
   L'IA reprenne la main » → comportement par défaut : Jarvis passe le relais
   et se tait. Et c'est un RÉGLAGE, pas une valeur en dur : `src/lib/relaisIA.ts`
   (pur) porte la clé `jarvis_ia_relais_lecture` et sa lecture
   (`lectureVoulue`, `false` tant qu'il n'a rien choisi). Le contrôle vit dans
   la même carte que la favorite — Paramètres › Ce que Jarvis utilise › « Tes
   applications d'IA » › « Jarvis lit la réponse » (`ConnecteursIA.tsx`).
   Activé, la réponse captée (par « garde ça » ci-dessus OU par le partage
   Android) est en plus lue à voix haute — depuis `garderReponseEcran.ts` en
   la mettant dans la phrase que Jarvis dit ensuite (jamais un second appel à
   la synthèse en parallèle, qui se couperait la parole), et depuis
   `useShareReceiver.ts` par un appel direct à `parler()` puisque ce chemin
   n'est pas un tour de voix.
2. **RAPPORTER** — « pas encore nécessaire » → écarté, ne pas y consacrer de
   temps.
3. **RÉPARTIR** — nommer l'IA à l'oral l'emporte TOUJOURS sur la favorite
   (« demande à Perplexity… » y va, quoi qu'il y ait dans les réglages), et
   Raphaël a explicitement écarté un catalogue de catégories par sujet.
   **Déjà en place avant ce chantier** (`app_name` absent seulement quand il
   ne nomme personne, côté local ET côté serveur) — rien à refaire ici,
   vérifié par `verifier-apps-ia.ts` et `verifier-commande-vocale.mjs`.

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

### « Envoie-le », « vas-y » après un message préparé : reconnu sur l'appareil, pas par le modèle

Chantier `21cf48d2`, 6 sept. 2026. Raphaël a activé le service (capture à
l'appui), mais le message ne partait toujours pas. `journal_ecoute` a montré
pourquoi : deux `send_message` consécutifs pour la même demande, jamais un
`screen_action` — le modèle rouvrait le même brouillon WhatsApp au lieu de
cliquer sur « Envoyer ».

**Un premier correctif, une consigne côté serveur, ne pouvait pas marcher —
et ça vaut d'être écrit pour ne pas le retenter.** `resolveTranscript`
(`MicButton.tsx`) envoie à `voice-command` la phrase courante SEULE, sans le
tour précédent ni son résultat : aucune consigne ne peut apprendre au modèle
qu'un message vient d'être préparé, puisqu'il ne reçoit jamais cette
information à l'appel suivant.

Le vrai correctif vit donc côté appareil, avec l'état que seul lui a :
`src/lib/confirmationEnvoi.ts` (pur, vérifié par
`verifier-confirmation-envoi.ts`) lit `dernierTourRef` — la même ref que
`MicButton` tient déjà pour signaler ses propres échecs — et traduit une
confirmation nue (« envoie-le », « vas-y », « c'est bon », « confirme »,
« appuie sur envoyer », ou « envoyer LE message » redit) dans les 90
secondes après un `send_message` directement en `screen_action` (clic sur
« Envoyer »), avant tout aller-retour réseau. Même famille que
`move_last_entry` dans `commandeLocale.ts`, mais nécessairement hors de ce
module-là : ces phrases sont trop génériques pour être reconnues par leur
seul texte, il faut le tour précédent pour les désambiguïser.

**Le signal qui sépare une confirmation d'une nouvelle demande est
l'article.** « Envoyer UN message » (indéfini) est une nouvelle demande ;
« envoyer LE message » (défini), ou une confirmation sans objet du tout, se
rattache au message déjà préparé. Vérifié sur les deux phrases réelles du
6 sept., mot pour mot — la reconnaissance vocale y a transcrit l'infinitif
« Envoyer », jamais l'impératif « Envoie » attendu.

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

### « Clique sur la vidéo » : le contexte, comme un humain (23 sept. 2026)

Chantier `a67ac63d`. Le 18 sept. à 10h15 il fait lancer « Booba DKR » sur
YouTube, puis dit « clique sur la vidéo » : Jarvis hésite entre « Autres
options » et « Booba - DKR (Clip officiel) », et ne lance rien. Sa correction,
écrite dans le registre : « je veux une réaction instantanée, pas obligé de
préciser tous les détails, on a un contexte faut qu'il comprenne tout seul
comme un humain ».

**La règle de sûreté ci-dessus ne bouge pas, sauf dans UN cas précis** :
une désignation GÉNÉRIQUE (`designationGenerique` : « la vidéo », « le
message », « le résultat » — une nature, au défini, sans rang ni mot qui
l'identifie). Alors, dans `designer` :

1. les **commandes de l'application** (`COMMANDES_D_APPLICATION` : « Autres
   options », « Partager », « Rechercher »…) sont écartées — « la vidéo » ne
   veut jamais dire « Autres options » ;
2. s'il vient de lancer une recherche musique/vidéo (`derniereRechercheMedia`,
   10 minutes, `actionsTelephoneVocales.ts`), l'élément dont le libellé porte
   **au moins la moitié** de ses mots gagne — le PREMIER si plusieurs, parce
   que c'est ce que l'application a classé en tête pour SA recherche ;
3. sinon, un seul élément de contenu restant suffit.

**Dès qu'il nomme quelque chose** (« celle avec Kaaris », « la deuxième »),
ce sont SES mots qui décident et l'ambiguïté se signale comme avant. Les
contrôles de `verifier-ecran.ts` gardent les deux moitiés, dont l'écran exact
du 18 sept.

**Et un clic refusé laisse maintenant l'écran ENTIER dans le journal**
(`ecran_action.visibles`, `libellesVisibles`, 40 libellés de 40 caractères) :
le 21 sept. à 22h29, « Envoyer » était introuvable dans WhatsApp et seule la
phrase dite restait — impossible de savoir si le bouton manquait ou portait
un autre nom (chantier `615c03ab`, en attente de la prochaine occurrence).

### Ce que ça ne fait pas, et qu'il ne faut pas présenter comme livré

**Rien de tout ça n'est vérifié sur l'appareil** : il n'y a pas de SDK Android
ici, la CI prouve que ça compile, pas que ça clique. Et le service ne
s'active pas tout seul — c'est un accès spécial qu'il accorde une fois dans
les réglages d'Android (Paramètres › Ce que Jarvis utilise › « Appuyer sur
l'écran à ta place » y renvoie). **Il faut une vraie APK**, la mise à jour
rapide ne remplace pas la coquille Android.

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
