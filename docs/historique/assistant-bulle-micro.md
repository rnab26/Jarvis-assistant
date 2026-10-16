# Historique — Assistant du téléphone, bulle flottante, conflits de micro

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

### La ranger en la glissant sur une croix, et l'appui long qui ne marchait pas (23 sept. 2026)

Chantier `9c22a183`, sa demande : « permettre de supprimer la bulle en la
faisant glisser vers le bas de l'écran au lieu de passer par les
paramètres ». Le geste de toutes les bulles Android : dès qu'elle glisse, une
croix apparaît en bas au centre ; le doigt dessus, elle grossit et rougit ;
lâchée dessus, la bulle est rangée. **La position n'est PAS enregistrée dans
ce cas** — sinon elle réapparaîtrait sur la croix, en bas de l'écran.

**Trouvé en le faisant : l'appui long « pour la ranger » n'a JAMAIS marché.**
L'`OnTouchListener` renvoie `true` dès `ACTION_DOWN`, donc Android n'appelle
jamais `onTouchEvent` — là où il détecte l'appui long : le
`setOnLongClickListener` était du code mort, alors que la notification et
Paramètres le promettaient. L'appui long est maintenant programmé dans
`ACTION_DOWN` (`postDelayed` + `ViewConfiguration.getLongPressTimeout()`) et
annulé au glissement et au relâcher. **Ne remets jamais un
`setOnLongClickListener` sur cette vue** : `verifier-bulle-position.ts` le
refuse.

Trois points à ne pas défaire : la croix est `FLAG_NOT_TOUCHABLE` (posée
par-dessus l'écran, elle volerait sinon les appuis de l'application en
dessous) ; le doigt est comparé au centre RÉEL de la croix
(`getLocationOnScreen`), pas à une position recalculée qui se tromperait de
la barre de navigation ; et **ranger arrête l'écoute** — la teinte rouge de la
bulle était le seul signe que le micro était ouvert.

**Compilé pour de vrai ici, pas seulement en CI** : le build Android ne tourne
que sur le tronc. `BulleService.java` a été compilé avec `javac` contre
l'`android.jar` de la plateforme 34 (téléchargé depuis dl.google.com — Maven
Central refuse par limite de débit) et trois bouchons (`R`,
`BulleEcouteActivity`, `MainActivity`) : rc=0. La méthode vaut pour tout
fichier Java touché hors du tronc. **Non essayé sur un téléphone** : il faut
une vraie APK.

### La fenêtre invisible de la bulle : 2 dip n'avait jamais été essayé (17 sept. 2026)

Chantiers `efe7e44c` / `7b8e68a7`. Sa phrase, le 17 sept. à 14h59, en réponse
au chantier `468734ad` (« la bulle active/désactive le micro sans fenêtre »,
mergé le matin même) : « Fait mais ca fonctionne pas ca saute directement et
pareille pour la bulle jarvis ». Régression réelle, pas le même bug qu'avant :
le 7 sept. il disait encore « La bulle elle fonctionne tres bien », alors que
l'appui long, lui, « bug[ait], ressort[ait] » — déjà, et jamais confirmé
corrigé depuis (aucun test réel entre le 8 et le 17 sept. dans `dev_log`).

**VÉRIFIÉ, PAS SUPPOSÉ** : `journal_ecoute` ne porte aucun évènement autour de
14h59 — ni `ecoute_auto_demarree`, ni rien côté Assistant/Bulle. L'ouverture
plante ou ressort donc AVANT que la moindre instrumentation JS ne s'exécute
(pas même `useTraceInteractions`, monté en tête de `AppRoutes`) — c'est du
côté natif, pas dans `demarrageOverlay.ts`/`App.tsx`, dont la relecture ligne
à ligne (les deux sondes en parallèle, le filet à 1,5 s, `quoiRendre`) n'a
montré aucun défaut de logique.

**Fait CONFIRMÉ, chronologique, pas une supposition** : la release
`latest-debug` correspondant à HEAD (commit `52c0fa2`, run CI 322) a fini de
publier son APK à 14:59:17 UTC — UNE SECONDE avant sa réponse. Il n'a
matériellement pas pu tester cet APK-là : au mieux, ce qu'il a essayé
correspond à un APK installé plus tôt (peut-être avant même le chantier
`468734ad`, mergé à 12h22-12h23). **La régression de la bulle n'est donc
peut-être pas encore confirmée sur le VRAI code du jour** — à revérifier
après une réinstallation propre de l'APK publiée après ce commit-ci.

**Une chose ÉTAIT fausse dans le code, indépendamment de cette incertitude,
corrigée ici** : `BulleEcouteActivity` réduisait sa fenêtre à **2 dip** (5-6
pixels réels) — le commentaire d'origine le disait déjà lui-même, « NON
VÉRIFIÉ SUR UN VRAI TÉLÉPHONE ». Un WebView/Chromium créé dans une surface
de quelques pixels est un cas limite documenté sur Android (rendu qui échoue
selon l'appareil et la version du système) — DÉDUIT comme risque plausible,
PAS confirmé comme LA cause faute d'accès à un appareil ici. Rien ne
justifiait de prendre ce risque : **l'invisibilité vient de la classe CSS
`sr-only`** posée par `OverlayMicContent(cache=true)`, pas de la taille de la
fenêtre Android — les deux sont des couches différentes. La fenêtre fait
maintenant 64 dip (une taille de bouton ordinaire, jamais problématique).
`AssistOverlayActivity`, elle, a toujours utilisé une fenêtre normale (40 %
d'écran) et n'a donc jamais couru ce risque précis.

**Second écart trouvé et corrigé au passage** : `BulleEcouteActivity`
n'enregistrait pas `EtatLivePlugin` (chantier `2a5b7802`), contrairement à
`AssistOverlayActivity` — sans lui, la veille de la bulle ne pouvait jamais
savoir qu'une conversation Live tourne dans l'autre fenêtre. `verifier-bulle.ts`
et `verifier-live-croise.ts` gardent maintenant les deux (taille minimale,
plugin enregistré), essayés à l'envers.

**CE QUI RESTE INCONNU, à ne pas présenter comme réglé** : la cause exacte du
« ça saute directement » de l'appui long (probablement le même défaut non
confirmé-corrigé depuis le 7 sept., sans lien avec ce chantier-ci) reste
ouverte. Aucune des deux fenêtres n'est vérifiable depuis cet environnement
(pas de SDK Android, pas d'appareil, pas de logcat) : la seule preuve possible
vient d'un nouvel essai de Raphaël, sur l'APK publiée APRÈS ce commit,
appui long ET bulle testés séparément et décrits précisément (rien ne se
passe / un flash / l'app complète s'ouvre / une fenêtre s'ouvre et se
referme).

### La VRAIE régression du 64 dip : l'écran entier avalait les appuis (17 sept. 2026, suite)

Sa réponse au correctif ci-dessus, dans la foulée : « La bulle fonctionne
encore moins bien qu'avant, corrige. » — PIRE que le simple « ça saute »
d'origine, pas juste « toujours cassé ». Ce n'était pas une supposition à
prendre pour argent comptant : `git log` sur `BulleService.java`,
`JarvisAccessibiliteService.java`, `demarrageOverlay.ts` et
`EtatLivePlugin.java` depuis le commit du build 324 (`71d8a40`) confirme
qu'AUCUNE autre session n'y a touché entre-temps — la seule variable qui a
changé est le passage 2 dip → 64 dip lui-même.

**LA CAUSE, dans les DRAPEAUX de la fenêtre, pas dans sa taille.**
`BulleEcouteActivity` posait `width`/`height`/`gravity`/`x`/`y` mais aucun
drapeau tactile. Documenté par Android
(`WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL`) : une fenêtre FOCUSABLE
(le cas par défaut d'une Activity, aucun code ici ne disait le contraire) qui
n'a pas ce drapeau consomme **TOUS** les événements tactiles de l'écran
**ENTIER**, pas seulement ceux dans ses propres limites. À 2 dip, un WebView
qui échouait vraisemblablement à se créer dans une surface aussi minuscule
laissait cette fenêtre à peine vivante — le défaut existait déjà, mais personne
ne pouvait le voir puisque la fenêtre ne survivait jamais assez longtemps. À
64 dip, elle s'ouvre pour de vrai et reste au premier plan le temps de
l'écoute (plusieurs secondes) : **l'écran entier devenait insensible au
toucher** pendant tout ce temps, sans qu'aucun élément visible ne le laisse
deviner — exactement ce que « fonctionne encore moins bien » décrit. Le
correctif du 2→64 dip n'était pas faux (il restait justifié), il a simplement
rendu visible un second défaut qui dormait depuis le début.

**Corrigé (`FLAG_NOT_TOUCHABLE | FLAG_NOT_FOCUSABLE`)** : cette fenêtre n'a
besoin d'AUCUNE interaction tactile — elle se referme par
`BulleEcoutePlugin.fermer()`, appelé depuis le JS quand `MicButton` revient au
repos, jamais par un appui sur elle. `FLAG_NOT_FOCUSABLE` pose aussi
`FLAG_NOT_TOUCH_MODAL` automatiquement (documenté par Android) : les deux
ensemble laissent tout passer à l'application réellement affichée en dessous,
comme si cette fenêtre n'existait pas pour le doigt.

**Le même piège existait dans `AssistOverlayActivity`** (l'appui long),
repéré en corrigeant le premier : focusable, sans `FLAG_NOT_TOUCH_MODAL`, elle
avalait aussi les appuis dans les DEUX TIERS assombris du haut (l'app en
dessous, visible mais inerte au toucher), pas seulement dans son propre tiers
du bas. Corrigé en ajoutant `FLAG_NOT_TOUCH_MODAL` SEUL — elle reste
focusable, son propre micro et ses propres boutons continuent de fonctionner
normalement, seul le comportement modal disparaît. **PAS confirmé comme LA
cause du « ça bug, ressort » de l'appui long documenté depuis le 7 sept.**
(aucun appareil ici pour le vérifier) : corrigé comme précaution justifiée par
la mécanique Android documentée, pas comme correctif aveugle — exactement la
même posture que le passage à 64 dip lui-même.

`verifier-bulle.ts` garde les trois drapeaux (essayés à l'envers : les
retirer fait rougir chacun des trois contrôles correspondants).

**CE QUI RESTE À CONFIRMER, sur l'APK publiée après ce commit** : que le
premier « ça saute directement » disparaît vraiment pour les deux chemins, et
que l'écran ne se fige plus pendant qu'un appui long ou une bulle écoute —
Raphaël doit pouvoir continuer à taper ailleurs sur l'écran (par exemple
essayer de fermer une autre app) sans que rien ne semble mort. NE PAS
ARCHIVER avant cette confirmation explicite, appui long ET bulle testés
séparément.

## Le conflit de micro avec une autre application : couper avant d'insister

Chantier `7a6e75c4-e639-40dd-97de-ffb4448e606e`, 18 sept. 2026. Son intitulé :
« gérer le conflit d'utilisation du microphone entre Jarvis et d'autres
applications (ex. WhatsApp pour les notes vocales), en permettant la coupure
automatique du micro de Jarvis et sa réactivation manuelle, pour réduire les
manipulations ».

**Ce qui existait déjà, et qu'il ne fallait pas refaire.** La veille
(`src/lib/veille.ts`) coupe déjà le micro TOUT DE SUITE dès que l'app perd le
premier plan (`visible` passe à faux, l'effet qui porte la boucle se démonte
et rend le micro sans attendre la fin de la rafale) — aucun bruit, aucune
insistance dans ce cas précis. Et `REFUS_AVANT_ABANDON` (9 sept., mesuré le
17 sept. sur 229 refus consécutifs) coupe déjà quand le service refuse
d'ouvrir le micro plusieurs fois d'affilée, en exigeant un appui sur le cœur
pour reprendre. Ce qui manquait entre les deux : quand l'app perd le premier
plan **PENDANT que le mot-clé écoutait activement** (le micro était réellement
ouvert), le retour au premier plan relançait la veille TOUTE SEULE — sans
qu'aucun appui ne soit nécessaire, contrairement au cas des refus répétés.

`focusPerduPendantEcoute(statut, documentCache)` (`src/lib/veille.ts`, pure,
vérifiée par `verifier-dialogue.ts`) répond à une seule question : le micro
était-il réellement ouvert (`statut === "wake-listening"`) au moment où l'app
a perdu le premier plan ? Si oui, c'est traité EXACTEMENT comme
`REFUS_AVANT_ABANDON` — même état (`veilleAbandonnee`), même message
(« Le micro est pris par autre chose — j'ai arrêté d'insister. Touche le cœur
pour reprendre. »), même réactivation par le cœur (`handleClick` remet les
deux à zéro). Les deux mécanismes sont complémentaires, pas redondants :
celui-ci coupe en une fraction de seconde sur un signal net (le micro était
ouvert, la reprise du premier plan par une autre app est un fait qu'Android
donne gratuitement) ; `REFUS_AVANT_ABANDON` reste le filet pour les cas où
l'app garde le premier plan (voir plus bas) et où rien ne dit qu'un conflit
est en cours avant d'avoir essayé — et échoué — plusieurs fois.

**Perdre le premier plan alors que la veille était simplement AU REPOS**
(entre deux rafales, aucun micro ouvert) n'est PAS traité comme un conflit :
rien n'a été interrompu, donc rien à couper, et la veille reprend toute seule
au retour — exactement comme avant ce chantier. Sans cette distinction, le
moindre coup d'œil à une notification pendant un silence de la veille aurait
obligé à retoucher le cœur en revenant, ce qui va à l'encontre de l'objectif
même du chantier (réduire les manipulations, pas en ajouter).

**LIMITE CONNUE, à ne pas présenter comme couverte** : cette détection ne voit
que la perte du premier plan de LA FENÊTRE de Jarvis (document.visibilityState).
Elle ne peut rien pour un conflit qui survient alors que Jarvis reste
visible — l'écran partagé d'Android (multi-fenêtres), ou la fenêtre de
l'appui long / la bulle flottante ouverte PAR-DESSUS une autre application
encore au premier plan en dessous (`AssistantOverlayPage`, `BulleEcoutePage` :
deux `BridgeActivity` distinctes, dont le `document.visibilityState` propre
reste « visible » tant que CETTE fenêtre-là est à l'écran, quoi qu'il se passe
dans l'application affichée dessous). Deviner qui tient le micro dans ces
cas-là n'est pas possible depuis ici — Android ne l'expose pas — et ce n'est
pas ce que ce chantier a tenté : `REFUS_AVANT_ABANDON` reste la seule
protection pour eux, non mesurée comme suffisante pour autant. Non vérifié
sur un vrai téléphone (aucun appareil ici) : c'est du `src/`, la mise à jour
rapide suffit, pas besoin d'APK.

Vérifié par un cas ajouté à `scripts/verifier-dialogue.ts` (la fonction pure)
et un banc de bout en bout ajouté à `scripts/verifier-ecoute-web.mjs` (le vrai
`MicButton`, moteur qui accepte de démarrer normalement, premier plan perdu
pendant l'écoute) : la coupure est mesurée à moins de 1,5 s, contre plusieurs
secondes à plusieurs minutes pour atteindre le seuil de vingt refus.

### Et ce signal disait faux huit fois sur huit : on soupçonne, le micro tranche

Chantier `20ae8529`, 28 sept. 2026, capture à l'appui. Ses mots : « La dernière
fois que j'ai ouvert Jarvis, il y a écrit comme quoi le micro était occupé par
autre chose alors que ce n'est pas vrai. Pour rien. »

**MESURÉ dans `journal_ecoute`, pas supposé.** Les **huit** `veille_abandon` de
raison `focus_perdu` posés depuis le 18 sept. (22/09 ×1, 23/09 ×3, 24/09 ×1,
27/09 ×3) sont tous faux, et trois se contredisent frontalement :

- **23/09 17:55** — la rafale ENTENDAIT sa voix à l'instant de l'abandon :
  10 partiels, « mais ça veut dire quoi je te dis je paye un peu c'est quoi ».
- **24/09 11:59** — idem, « contrôle Center » transcrit juste avant.
- **27/09 12:24** — idem, « le monde entier s'est arrêté », puis « météo ».
- **22/09 22:27** — la rafale a **continué APRÈS l'abandon** et s'est terminée
  normalement en silence (code 7), 11,1 s plus tard.
- **27/09 12:42** — `plateforme: "web"`, clic « Tâches » 4,1 s avant : il
  naviguait dans l'app.

Le micro marchait. Sa capture, elle, vient d'un **rechargement de la WebView
après une mise à jour rapide** : `apk_build` passe de 356 à 366 et l'empreinte
de `873edd07` à `8f1b4b43` entre les deux rafales, 20 s après son clic
« Mettre à jour ».

**LA CAUSE EST MÉCANIQUE.** `focusPerduPendantEcoute` se lit dans le NETTOYAGE
de l'effet de veille, qui tourne pour **trois** raisons et pas une : la veille
change d'état, l'abandon change d'état, ou le composant est démonté —
navigation, rechargement, fermeture. Et `visible` retombe à faux sur
`pagehide`, tandis que la spec HTML impose au document de passer à `hidden`
AVANT `pagehide`. « Une autre app a pris le micro » et « cet effet se démonte
pendant que le document est momentanément caché » sont **indistinguables** à
cet instant-là.

**Le second défaut est celui qu'il voit** : c'était irréversible. Une fois
`veilleAbandonnee` posé, le message rouge restait jusqu'à un appui sur le
cœur, même l'app revenue au premier plan depuis longtemps et le micro libre.

**LA PARADE : on ne déclare plus, on SOUPÇONNE.** Le micro est coupé tout de
suite, comme avant — sa demande du 18 sept. ne bouge pas. Mais le verdict
attend le retour au premier plan, où **un essai réel tranche** :
`conflitConfirmeAuRetour(soupçon, démarrage refusé)` (`src/lib/veille.ts`,
**pure**). Refusé (`MOTEUR_OCCUPE`) → c'est un vrai conflit, on le dit ;
accepté → silence, la veille reprend toute seule.

Trois choses à ne pas défaire :

1. **UN essai, pas vingt.** `REFUS_AVANT_ABANDON` reste le filet pour les cas
   où l'app garde le premier plan, et la demande du chantier `7a6e75c4`
   (couper vite, sans attendre le seuil) tient toujours.
2. **Le soupçon est une REF, pas un état**, et il ne doit pas le redevenir :
   la boucle le lit dans un `while` qu'aucun rendu ne réveille, et surtout il
   ne doit PAS survivre au rechargement de page qui l'a si souvent posé pour
   rien — il meurt avec elle, ce qui est exactement le cas de sa capture.
3. **Il se consomme au PREMIER essai du retour**, quel qu'en soit le résultat,
   et un appui sur le cœur le remet à zéro comme `echecsOccupeRef` : un refus
   survenu dix minutes plus tard n'a plus rien à voir avec la perte de premier
   plan d'avant.

**L'ASYMÉTRIE JUSTIFIE CE SENS** : se taire à tort coûte une rafale de plus,
rattrapée par `REFUS_AVANT_ABANDON` ; parler à tort pose un message rouge faux
**qui bloque la veille** jusqu'à un appui manuel — le reproche exact du
28 sept. Deux traces nouvelles pour la mesurer : `veille_conflit_soupconne` et
`veille_conflit_ecarte`.

**Le banc d'avant figeait le défaut** : il exigeait « j'ai arrêté d'insister »
dès la perte du premier plan, avec un moteur qui acceptait pourtant de
démarrer. `verifier-ecoute-web.mjs` a maintenant **les deux moitiés** — le
conflit réel (le moteur refuse au retour → message) et le faux positif (il
accepte → aucun message, reprise seule) — et chacune a été essayée à l'envers :
remettre l'ancien comportement fait rougir trois contrôles, supprimer le
verdict du retour en fait rougir deux.

**CE QUI RESTE INCONNU, à ne pas présenter comme réglé** : quel évènement a
caché le document 3 s après le redémarrage du 27/09. La preuve que le signal
est faux n'en dépend pas — le micro entendait sa voix dans trois autres cas.
**Non constaté sur son téléphone** : c'est du `src/`, la mise à jour rapide
suffit.

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

### Le moteur de Google ne se résume PAS à l'application Google (8 sept. 2026)

Chantier `ba140853`. Ses deux symptômes redits le 7 sept. : « le temps de
connexion à la discussion live est très long » et « le micro s'active, se
désactive à plusieurs reprises ». Le second est maintenant EXPLIQUÉ, mesuré sur
son journal réel.

**La mesure, et elle est sans appel.** Sur 48 heures de `journal_ecoute`, il y
a autant de rafales mortes en 20-60 ms avec le code Android 11
(`ERROR_SERVER_DISCONNECTED`) que de rafales normales : 50 contre 51 sur une
heure, 43 contre 34 sur une autre, heure après heure. **Une ouverture de micro
sur deux ne sert à rien** — et chacune fait sa tonalité sur Samsung. C'est
littéralement ce qu'il décrit.

**La cause : `trouverServiceGoogle()` ne cherchait que
`com.google.android.googlequicksearchbox`**, l'application Google. Elle n'est
PAS installée chez lui. `queryIntentServices` rend, mot pour mot :
`com.google.android.as,com.google.android.tts,com.anthropic.claude,com.raphael.jarvis`.
Le plugin retombait donc sur `"defaut"` — le service par défaut d'Android, dont
tout le reste du projet dit depuis le début qu'il bipe et qu'il coupe. Et le
journal le confirme : `service_reconnaissance` dit `nom: "defaut"` à chaque
ouverture.

`com.google.android.as` est **Android System Intelligence**, la reconnaissance
EMBARQUÉE de Google — celle des Android récents. Elle est préférée à
l'application Google quand les deux sont là : pas d'aller-retour réseau, donc
pas la classe de panne qu'on mesure ici. `com.google.android.tts` est de la
SYNTHÈSE, pas de la reconnaissance : son nom ressemble, et c'est tout.

**Et `com.raphael.jarvis` est dans cette liste** — c'est notre propre
`JarvisRecognitionService`, qui ne reconnaît rien et n'existe que pour
qu'Android accepte Jarvis comme assistant. `selectableAsDefault="false"` ne
parle qu'à Android : il ne l'enlève pas de `queryIntentServices`. Nos DEUX
énumérations l'écartent donc explicitement — celle qui choisit toute seule, et
celle qui propose la liste dans Paramètres. Le choisir rendrait Jarvis sourd,
sans le moindre message.

Trois contrôles dans `verifier-assistant.ts`, **essayés à l'envers**. Le
premier était faux : il cherchait « com.google.android.as » n'importe où dans
le patch, et le paquet est aussi CITÉ dans le commentaire qui explique la
mesure — retiré de la liste, le contrôle restait vert. Il lit maintenant le
CONTENU de `PAQUETS_GOOGLE`. Même piège que le sélecteur Playwright et que
`Filesystem.mkdir`.

**Non vérifié sur l'appareil** (pas de SDK Android ici) : que le service
d'Android System Intelligence répond bien chez lui. La preuve sera dans son
journal — le rapport code 11 / code 7 doit s'effondrer. Et il faut une VRAIE
APK : c'est un patch natif, la mise à jour rapide ne le porte pas.

### Une fermeture subie ne finit pas la conversation (15 sept. 2026)

Chantier `dde25deb`. `journal_ecoute` porte deux fermetures de session Live
avec exactement le même message, indépendantes l'une de l'autre : le 10 sept.
à 20:20:24 UTC après 12,9 s, et le 15 sept. à 06:33:25 après 48,5 s —
celle-là capture à l'appui, **en plein milieu d'une correction de tâche**.

    Session fermée : Internal error occurred.

**LA CAUSE N'EST TOUJOURS PAS ÉTABLIE, et ne la présente pas comme telle** :
le message vient tel quel de la fermeture côté Google. Deux points ne font pas
une mesure. Pour en retrouver d'autres :

```sql
select at, detail from journal_ecoute
where evenement = 'live_fin' and detail->>'raison' ilike '%Internal error%'
order by at desc;
```

**Ce qui a été corrigé n'est donc pas la panne, c'est ce qu'on en faisait.**
`maintenirSessionLive` promet « une conversation qui dure » et rouvrait déjà
la session à la limite des quinze minutes ; une fermeture qui portait une
RAISON, elle, arrêtait tout. Une panne transitoire d'un service tiers n'a pas
à coûter la conversation — il se retrouvait devant un cœur éteint, au milieu
d'une phrase, à devoir rappuyer.

`src/lib/live/repriseLive.ts` est **pur** (`verifier-reprise-live.ts`, dans la
CI) et porte les trois bornes, qu'il faut toutes les trois :

1. **On ne rouvre que ce qui s'était vraiment ouvert.** Une ouverture qui
   échoue (jeton refusé, micro tenu par une autre application) ferme AUSSI
   avec une raison : la rejouer répéterait le même échec en boucle en cachant
   le message qui l'explique. D'où `ouverte`, posé au moment exact où Jarvis
   passe en écoute, et rendu par `finie`.
2. **Deux reprises après panne au maximum, dans un compteur DISTINCT** de
   celui des reconnexions normales. Un quart d'heure de conversation ne doit
   pas consommer le droit de survivre à une panne, ni l'inverse.
3. **En renonçant, on dit qu'on a essayé.** Trois fermetures d'affilée
   présentées comme une seule, et il rappuie pour retomber dessus. La phrase
   dit aussi que ce n'est pas lui.

**La durée ne discrimine QUE les fermetures sans raison** (les quinze minutes
de Google). L'appliquer à une panne annoncée ferait dépendre la survie d'un
seuil qui n'a jamais été mesuré sur ce cas-là — d'où le 10 sept., 12,9 s, qui
se rouvre lui aussi.

**Et la décision est UNE, alors qu'elle était écrite deux fois** : une
première dans `onEtat` pour avaler le « fermee » et laisser le cœur sur
« connexion », une seconde après `await courante.finie` pour reboucler. Elles
étaient d'accord parce que quelqu'un les tenait alignées à la main. Le jour où
elles divergent, le cœur reste sur « connexion » devant une session qui ne
rouvrira jamais, et personne ne le voit. Un contrôle compte les appels à
`deciderReprise` dans `maintenirSessionLive` : deux, pas un.

Cette course-là existait d'ailleurs déjà et a été refermée avec : on avale le
« fermee » en promettant une reprise, il appuie sur arrêter dans l'intervalle
(sa décision l'emporte), et plus personne ne disait à l'écran que c'était
fini. Le drapeau `avalee` tient la promesse.

**Deux trous du même genre trouvés en faisant ce chantier, corrigés avec.** Le
premier est cette course-là : on avale le « fermee » en promettant une reprise,
il appuie sur arrêter dans l'intervalle (sa décision l'emporte), et plus
personne ne disait à l'écran que c'était fini. Le drapeau `avalee` tient la
promesse. Le second est pire parce qu'il est muet : **s'il arrête pendant que
la session se CONNECTE encore**, `arreter()` ne peut rien clore — `courante`
est encore nul — et la session qui aboutit juste après n'a plus personne pour
la fermer. Le micro reste pris, le WebSocket ouvert, et
le drapeau natif n'est jamais rebaissé : la veille de l'autre fenêtre se tait
pour toujours. D'où le `if (arretDemande)` juste après
l'`await demarrerSessionLive`.

**Et le contrôle qui garde ce drapeau a été corrigé dans le même travail, deux
fois.** Il comparait des POSITIONS dans le fichier brut : un commentaire qui
citait l'appel pour expliquer pourquoi il ne fallait pas le déplacer était
compté comme un appel, et la CI a rougi sur du code juste (15 sept. 2026) —
le piège du sélecteur Playwright, de `Filesystem.mkdir` et de
`com.google.android.as`, une quatrième fois. Il ignore maintenant les
commentaires. Et en l'essayant à l'envers, il s'est avéré **ne pas vérifier ce
que son libellé promettait** : sortir l'appel du `finally` pour le poser juste
en dessous le laissait vert, puisque l'ordre était respecté. Il compte
désormais les accolades pour délimiter le bloc, et refuse un second appel
ailleurs.

**Ce qui précède une fermeture part maintenant avec elle.** Les deux premières
occurrences n'ont pu être rapprochées qu'à la main, en relisant les lignes
voisines — et ce qu'on ne relève pas à l'instant ne se retrouve plus après.
`live_fin` emporte donc `ouverte`, `commandes`, `ms_depuis_commande`,
`parlait` et `contexte`, pour TOUTES les fermetures : sans les normales il n'y
a pas de repère, et « trois commandes juste avant » ne voudrait rien dire.
`null` et pas `0` quand ça n'a pas eu lieu. Une reprise après panne se
distingue d'une reconnexion ordinaire par `apres_panne` dans
`live_reconnexion`, sinon le compte des « Internal error » devient illisible.

**Non vérifiable ici** (pas d'appareil, pas de vraie session Google) : que la
reprise se passe bien chez lui. La preuve sera dans son journal — un
`live_reconnexion` avec `apres_panne: true` juste après un `live_fin` qui
porte cette raison. C'est du `src/` : la mise à jour rapide suffit, pas besoin
d'APK.

### Le mode Live affichait du charabia et restait bloqué dessus (17 sept. 2026)

Chantier `40f07c12`. Sa capture : en pleine conversation Live, il demande à
Jarvis de créer un chantier pour un bug qu'il vient de décrire, et l'écran
affiche « Jarvis : <ctrl46><ctrl46> » — du texte brut illisible — puis plus
rien : la conversation reste « en cours » pour de bon.

**VÉRIFIÉ DANS `journal_ecoute` AU MOMENT DES FAITS, PAS SUPPOSÉ** : aucun
`live_commande` ni `live_fin` après sa demande. Le `live_commande` juste avant
(« Appelle Dan Marciano sur WhatsApp ») avait fonctionné normalement. La panne
n'avait donc laissé AUCUNE trace exploitable, et pour cause : rien dans le
projet ne loggait jamais le texte de `outputTranscription` — ni les événements
`live_commande` (qui ne loggent que les APPELS D'OUTIL, pas la parole libre du
modèle) ni l'événement `reponse` (métadonnées seulement, jamais le texte). Un
`grep` sur `journal_ecoute` pour retrouver d'autres occurrences ne pouvait
donc structurellement rien trouver — ce n'est pas que c'était rare, c'est que
rien ne l'aurait jamais enregistré.

**LA CAUSE EST CONFIRMÉE, PAS UNE HYPOTHÈSE** — cherchée le 17 sept. sur le
forum officiel des développeurs Gemini : un bug ouvert en janvier 2026 pour
`gemini-2.5-flash-native-audio-preview`, **le modèle Live exact de Jarvis**,
décrit le même symptôme mot pour mot. Le modèle envoie parfois des jetons de
contrôle bruts (`<ctrl46>`…) à la place de l'audio, plus souvent après un
appel d'outil (Jarvis n'en a qu'un, `commande_jarvis` — et c'est justement une
demande de chantier qui l'a déclenché ici). Cité tel quel : « the session
never recovers; subsequent user turns also produce only control-token
output ». Aucun correctif ni contournement côté Google à cette date — on ne
peut RIEN faire pour empêcher l'envoi, seulement pour ce qui suit.

`src/lib/live/reponseIllisible.ts` (**pur**, vérifié par
`scripts/verifier-reponse-illisible.ts`) porte la détection — un motif précis
(`<ctrl\d+>`) qui ne matche jamais un mot français comme « contrôle » — et le
nettoyage (`sansJetonsDeControle`, qui retire les jetons sans jeter le reste
d'une réponse par ailleurs correcte). Branché dans `sessionLive.ts` :

1. **Jamais affiché tel quel.** `ev.onReponse` ne reçoit plus jamais le brut
   accumulé, seulement sa version nettoyée — vide, rien ne s'affiche du tout,
   plutôt que le charabia.
2. **Jamais bloqué en silence.** Le cas mesuré n'a déclenché ni `onclose`, ni
   `onerror`, ni `goAway` : Google ne ferme rien, il se tait. Un jeton détecté
   arme donc un minuteur de 8 s (`DELAI_REPONSE_ANORMALE_MS`) ; si le tour ne
   se termine toujours pas, on ferme NOUS-MÊMES (`fermer("Le service vocal a
   renvoyé une réponse illisible.")`), ce qui retombe dans `deciderReprise`
   (`repriseLive.ts`, chantier `dde25deb`) — même famille de reprise que pour
   « Internal error occurred », bornée à deux tentatives et honnête en
   renonçant.
3. **Le minuteur ne fuit pas** : désarmé à `turnComplete` (le tour s'est
   terminé normalement, jeton isolé sans suite), à une interruption par
   Raphaël, et dans `fermer()` lui-même (quel que soit le chemin de
   fermeture) — sinon un minuteur resté armé se déclencherait sur une session
   déjà close.

Chaque occurrence laisse maintenant une trace : `noterEcoute("live_reponse_anormale", { echantillon })`,
reprise dans le registre des erreurs (`src/lib/erreurs.ts`,
`evenement === "live_reponse_anormale"`, catégorie `serveur`) — la prochaine
occurrence n'exigera plus l'enquête à la main du 17 sept.

**NON REPRODUIT NI MESURÉ AILLEURS QUE CETTE FOIS** (un seul cas dans
`journal_ecoute`, et structurellement le seul possible avant ce correctif). Ne
présente pas ce chantier comme « la cause d'un bug fréquent corrigée » : c'est
un bug de Google, confirmé mais dont la fréquence chez Raphaël reste inconnue
— seule la nouvelle trace le dira. **Non vérifiable ici** (pas d'appareil, pas
de vraie session Google déclenchant le bug à la demande) : que la reprise se
passe bien chez lui. La preuve sera un `live_reponse_anormale` dans le journal
la prochaine fois que ça se produit, suivi d'une reprise normale au lieu d'un
blocage. C'est du `src/` : la mise à jour rapide suffit, pas besoin d'APK.

### Une longue discussion Live ne repart plus de zéro toutes les dix minutes (23 sept. 2026)

Chantier `0373a04d`, « adapter Jarvis aux longues discussions ». MESURÉ dans
`journal_ecoute` : Google ferme une session Live toutes les ~9-10 minutes
(`live_fin` « Google a demandé de fermer la session », son `goAway`), et
`maintenirSessionLive` en rouvrait une NEUVE — la conversation continuait
pour l'oreille, mais Jarvis avait tout oublié de ce qui venait d'être dit.

**La reprise de session de Google** : `live-jeton` scelle dans le jeton
`sessionResumption` (avec `handle` quand l'app en renvoie une) et
`contextWindowCompression: { slidingWindow: {} }`. Google envoie alors des
`sessionResumptionUpdate` ; `sessionLive.ts` garde la dernière poignée
**REPRENABLE** seulement (pendant un appel d'outil ou une réponse en cours il
en envoie une vide — reprendre là perdrait une partie de l'échange), et la
renvoie à `live-jeton` à la reconnexion suivante. **Côté Google, reprendre ne
consomme pas l'usage unique du jeton** (documentation Live API).

**VÉRIFIÉ contre Google le 23 sept., sans déployer** (clé de TEST, même
configuration que `live-jeton`, jamais affichée) : la configuration est
acceptée par `authTokens.create`, une poignée reprenable arrive après le
premier tour, la session rouverte AVEC elle redonne le mot dit avant la
coupure (« Le mot du jour était ANANAS-VIOLET. ») — et le témoin sans poignée
répond « Je ne me souviens pas d'un mot du jour ». C'est ce que
`scripts/verifier-live-reprise.mjs` rejoue par le VRAI `live-jeton`.

Deux choses à ne pas défaire :

1. **Une poignée qui fait échouer l'ouverture est oubliée, UNE fois**
   (`oublierPoignee` dans `deciderReprise`) : expirée ou refusée, on rouvre
   une conversation neuve plutôt que plus de conversation du tout. La
   suivante n'a plus de poignée, donc un second échec retombe dans la borne 1
   — pas de boucle. `verifier-reprise-live.ts` le garde.
2. **Tant que `live-jeton` déployé ne demande pas la reprise, RIEN ne
   change** : Google n'envoie aucune poignée, `avecPoignee` reste faux, et la
   décision est exactement celle d'avant. Le client a pu partir avant le
   serveur sans rien casser.

**`live-jeton` est en ligne depuis le 23 sept.** (version 30, chantier
2e40a764, après le renouvellement de `SUPABASE_ACCESS_TOKEN`) :
`verifier-live-jeton.mjs`, `verifier-live-contexte.mjs` et
`verifier-live-reprise.mjs` sont verts sur la fonction déployée — rouverte
avec la poignée, la session redonne le mot dit avant la coupure. Sur son
téléphone, la preuve sera un
`live_reconnexion` avec `avec_poignee: true`, et `live_debut` avec
`reprise: 1`.

### Le temps d'ouverture d'une Live : ce que ce N'EST PAS

Même chantier, même jour. `ms_jeton` (notre Edge Function, vue du téléphone)
est **bimodal** sur ses 25 dernières ouvertures : environ 1200-1900 ms, ou
3500-4300 ms, presque rien entre les deux. Une marche pareille a une cause.

`live-jeton` rend maintenant le découpage de son PROPRE temps (`temps: {auth,
lectures, google, serveur}`), et l'app le range dans `journal_ecoute` à côté
des trois autres nombres. Sondée depuis ici, la fonction déployée donne :
**Google 124-353 ms, l'authentification 129-471, les trois lectures 118-877,
le tout dans la fonction 433-1230 ms** — total vu du client 754-1842 ms. Et
après sept minutes d'inactivité, 1054 ms : **le démarrage à froid de l'isolat
ne coûte pas non plus deux secondes.**

Donc la marche de ~2,3 s n'est ni Google, ni nos lectures, ni le réveil de la
fonction. Elle est de SON côté du fil. Le candidat lu dans le code de
supabase-js 2.114 : `functionsFetch` fait `await auth.getSession()` avant
CHAQUE appel d'Edge Function, et `getSession()` renouvelle le jeton quand il
approche de l'expiration — un aller-retour réseau de plus, sur un réseau
mobile. Non prouvé : `ms_jeton - ms_serveur` le dira dès ses prochaines
ouvertures. **Ne recodez rien avant d'avoir lu ces nombres-là.**

**Lu le 23 sept. à 16 h 06 : `ms_jeton` 4632, `ms_session` 1, `ms_serveur`
728.** La piste du renouvellement de jeton est donc MORTE sur une ouverture
lente (1 ms) ; il reste 3,9 s entre son téléphone et la fonction. Sondé d'ici
le même soir après six heures sans appel, le démarrage à froid de
`live-jeton` coûte ~0,6 s de plus qu'à chaud — pas 3,9. Reste son réseau
mobile, qu'on ne mesure pas d'ici.

### Ne coupe PAS la « réflexion » du modèle Live — mesuré, pas supposé

Le 23 sept. au soir, pour ses réponses « hyper longues » : `thinkingConfig:
{ thinkingBudget: 0 }` dans la configuration scellée fait bien gagner du
temps (outil appelé en ~0,3-1 s au lieu de 1,2-1,7 s, premier son ~0,9 s plus
tôt, 16 essais) — **mais avec la VRAIE consigne, la session s'est fermée sur
« Internal error occurred » 6 fois sur 12, contre 0 sur 12 sans ce réglage**,
et il reformulait sa demande en la raccourcissant. Écarté. Si quelqu'un veut
le retenter, c'est `scripts/essayer-consigne-live.sh` qui le dira, en
comptant les fermetures.

### « Tout est en décalage » : on MESURE, on ne recode pas (23 sept. 2026)

Chantier `f82f7a60`. Ses mots : « je vois ça même par rapport à ce qui est
écrit en fonction de comment je discute. Ça prend pas du tout les écrits
rapidement. Tout est en décalage. » Trois causes plausibles se ressemblent
parfaitement à l'écran et se corrigent à trois endroits différents : Google
transcrit tard, nous affichons le mauvais flux, ou le tour entier attend qu'il
se taise. **Rien n'a été recodé** — la note du chantier dit de mesurer d'abord,
et c'est la mesure qui est livrée.

**CE QUI N'EXISTE PAS, et qu'il ne faut pas aller chercher : un signal qui
dirait QUAND il a commencé à parler.** Vérifié dans les types de
`@google/genai` 2.21, pas supposé : `activityStart` / `activityEnd` vivent dans
`LiveSendRealtimeInputParameters` — ce sont des messages que le CLIENT envoie.
`LiveServerContent` n'en porte aucun. Inventer un seuil d'énergie sur le micro
pour le deviner serait une mesure fabriquée ; on ne le fait pas.

**Deux ancres réelles le remplacent**, et `src/lib/live/decalageTranscription.ts`
(pur, `verifier-decalage-transcription.ts`) ne fait rien d'autre que les tenir :

1. **Les mots datés.** `Transcription.words[].endOffset` donne la fin de chaque
   mot « relative to the start of the audio », c'est-à-dire de l'audio que
   Google a REÇU. `capturerMicro` rend maintenant la durée de CHAQUE paquet, et
   `sessionLive` ne l'additionne que pour les paquets **réellement partis** (les
   premiers sont jetés tant que la session n'est pas ouverte, et Google compte
   depuis ce qu'il a reçu). La soustraction donne le retard vrai, sans rien
   supposer. Google n'est pas obligé de remplir `words` : dans ce cas le champ
   reste `null`.
2. **Les deux flux comparés l'un à l'autre.** Google rend
   `interimInputTranscription` (« Low latency transcription updated while the
   user is speaking ») en plus de `inputTranscription` — et **l'app n'affiche
   aujourd'hui que le second**. Les deux décrivent la même phrase : leur écart
   est de la latence pure, quelle que soit l'heure à laquelle il a parlé.
   `avance_interim_ms` est le nombre qui décidera du correctif ; s'il est net,
   il tient en une ligne d'affichage. L'interim est **relevé, pas affiché** :
   l'afficher sans savoir s'il précède vraiment ferait clignoter le texte pour
   rien.

**`ms_premier` ne se lit JAMAIS seul** : il compte aussi le silence entre la fin
du tour précédent et le moment où il se met à parler. Ce sont la FORME des
arrivées (`arrivees`, « i900,i1500,2100 » = un flux, « 2400 » = une rafale en
fin de phrase), l'avance de l'interim et le retard mesuré qui disent la latence.

**`null` partout où la chose n'a pas eu lieu, jamais zéro** — « zéro
milliseconde » et « ça n'est jamais arrivé » se liraient pareil en SQL, et c'est
exactement la confusion qui a coûté l'enquête à la main de
`live_reponse_anormale`. Quatre contrôles essayés à l'envers gardent ce point.

Un tour de parole écrit une ligne `live_transcription` ; un tour du modèle seul
n'en écrit aucune. Pour lire la mesure :

```sql
select at, detail->>'morceaux' as morceaux, detail->>'interims' as interims,
       detail->>'avance_interim_ms' as avance, detail->>'retard_median_ms' as retard,
       detail->>'mots_dates' as mots_dates, detail->>'ms_dernier_a_fini' as fin,
       detail->>'arrivees' as arrivees, detail->>'ms_tour' as tour
from journal_ecoute where evenement = 'live_transcription' order by at desc limit 30;
```

**Ne recode rien avant d'avoir lu ces nombres-là** — c'est la même consigne que
pour `ms_jeton` et `ms_ouverture`, et elle a déjà écarté trois causes supposées
d'un coup.

### Troisième piège de la fenêtre d'assistance : deux tas JS, une seule veille voulue

Chantier `2a5b7802`, 7 sept. 2026. Ses mots : « Lorsque le mode conversation
live est activé, il y a des activations et désactivation de micro
intempestive ca doit etre régler car ces bruits sont tres dérangeant ».

**MESURÉ dans `journal_ecoute`, pas supposé.** Sur une conversation Live de
544957 ms, 70 cycles complets de la veille classique (mot-clé « Jarvis »,
service Android) se sont déclenchés PENDANT — un toutes les ~7-8 secondes, du
début à la fin. Le commentaire de `MicButton` affirmait pourtant « pendant la
conversation, l'état n'est jamais au repos, donc la veille attend » — vrai
dans une seule fenêtre (`statusRef` y reste `listening`/`speaking` tout du
long, vérifié en lisant `sessionLive.ts`), mais l'app en a DEUX : la coquille
normale (`ProtectedShell`) et la fenêtre d'assistance (`AssistantOverlayPage`,
ouverte par l'appui long — devenu son chemin PRINCIPAL vers Jarvis). Cette
dernière est une VRAIE seconde `BridgeActivity` avec son propre WebView, donc
son propre tas JS : le `status` React qui bloque la veille d'une fenêtre
n'existe tout simplement pas dans l'autre. Une Live ouverte dans l'une n'avait
aucun moyen de le dire à l'autre.

**`EtatLivePlugin.java`** — un champ statique `volatile boolean actif`, posé
par n'importe laquelle des deux fenêtres et lu par l'autre. Ça marche parce
que les deux `Activity` vivent dans le MÊME processus (aucun
`android:process` déclaré, vérifié dans le manifeste) : pas besoin de
SharedPreferences ni de sondage réseau, un champ statique suffit — même
principe que `MainActivity.auPremierPlan` pour `AnnonceApresNotification`.
**Enregistré dans LES DEUX `Activity`** (`MainActivity` ET
`AssistOverlayActivity`) : l'oublier dans l'une rendrait le correctif inutile
pour exactement la fenêtre où le bruit se produit — c'est le premier cas que
`scripts/verifier-live-croise.ts` garde, essayé à l'envers.

**Le drapeau couvre TOUTE la conversation maintenue, pas une connexion.**
Posé dans `maintenirSessionLive` (avant que la boucle de reconnexion
démarre) et baissé dans un `finally` qui entoure cette boucle — jamais dans
`demarrerSessionLive`, qui ne voit qu'UNE connexion : le poser là referait
retomber le drapeau à faux pendant chaque reconnexion transparente de Google
(la limite des 15 minutes), exactement le trou qu'on rebouche.

**La boucle de veille lit le drapeau à chaque tour** (`liveAilleurs: await
liveActifQuelquePart()`, dans `peutEcouterEnVeille` — même famille que
`majEnCours`), **`handleClick` ne le lit jamais** : un appui volontaire sur
le cœur reste obéi même si l'autre fenêtre a une Live ouverte, sinon on
remplacerait un bruit gênant par un Jarvis sourd dans une fenêtre qu'il
utilise activement — pire. La moitié de `verifier-live-croise.ts` garde ce
silence-là, pas seulement la détection.

**Non vérifiable ici** (aucun SDK/appareil Android) : que le bruit a
réellement cessé chez lui. La mesure future se lit pareil —
`journal_ecoute`, des rafales de veille qui ne se produisent plus pendant une
fenêtre `live_debut`→`live_fin`.
