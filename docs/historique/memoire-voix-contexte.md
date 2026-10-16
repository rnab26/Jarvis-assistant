# Historique — Mémoire, contexte de la voix, réglages à la voix, notifications, widget

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

**Elle relit ce qu'elle sait AVANT d'écrire (23 sept. 2026).** Mesuré ce
jour-là sur ses 53 souvenirs actifs : « Haim Mazgan » en quatre orthographes
(Desgan, Demazgan — la dictée), « Ilan Régnier » en quatre, et « L'épouse de
Raphaël se prénomme Yael » — tiré d'un « salut Yael » dicté dans un message
à sa femme — à côté de deux souvenirs qui disent Mel. L'extracteur ne voyait
que l'échange. `memoriser` lui joint maintenant jusqu'à huit souvenirs proches
(`chercher_souvenirs`, sur l'empreinte déjà calculée pour l'échange), et la
consigne (`voice-command/extraction.ts`, sortie de memoire.ts pour se
vérifier seule) dit : un fait connu ne se réécrit pas, une personne connue
garde SON orthographe, et une contradiction n'est retenue que s'il corrige
EXPLICITEMENT. `scripts/essayer-consigne.sh memoire-extraction` (vrai modèle,
clé de test) : 5/5, et le témoin sans « ce qu'elle sait » réécrit bien
« La femme de Raphaël s'appelle Yael ». En ligne depuis le 23 sept.
(voice-command v124, chantier 2e40a764).

Le même jour, rangement de l'existant (réversible, `perime_at` — barré dans
l'onglet Mémoire, réactivable) : 29 sur 53. Dix-huit parlaient des bugs et
des chantiers de Jarvis (« Jarvis est une personne avec laquelle Raphaël a des
discussions liées au micro »), écrits avant que la consigne ne l'interdise ;
onze étaient des doublons ou des erreurs de dictée. Deux fiches ont été
réunies (Yakov Alain, Haim Mazgan). **Attention en relisant `souvenirs`** :
filtre par `user_id` — les faits « Dylan / 07 88 99 00 11 » sont ceux des
comptes de test, pas les siens.

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

## L'écran affiché et le dernier bouton touché : dans journal_ecoute et jarvis_erreurs (chantier 6d94ab6a)

Sa demande, 17 sept. 2026 : mieux comprendre comment Jarvis se comporte lors
de ses requêtes et de ses problèmes, à la voix ET au clic dans l'app. Sa
réponse au périmètre, posée en conversation et tranchée le jour même :
« Enrichir l'existant » — pas un quatrième endroit à côté de `journal_ecoute`,
`jarvis_erreurs` et `dev_log`.

**`src/lib/contexteInteraction.ts` est le point UNIQUE que les deux lisent.**
Pur à l'exception de deux variables de module (l'écran actuel, le dernier
appui) — même discipline que `derniereParole` dans `journalEcoute.ts` : en
mémoire seulement, jamais en base ni en stockage local, parce que la question
posée est « où en est-il MAINTENANT », pas « où en était-il à la dernière
ouverture ». `src/hooks/useTraceInteractions.ts` (DOM + `useLocation`, monté
une fois dans `AppRoutes`, App.tsx — avant les retours anticipés qui rendent
soit l'app normale soit la fenêtre d'assistance, pour couvrir les deux) est le
seul endroit qui a besoin du navigateur ; il ne fait qu'écrire dans le module
pur, toute la décision (ce qui reste pertinent, comment le formuler) y est
vérifiable sans navigateur (`scripts/verifier-contexte-interaction.ts`).

**`journalEcoute.ts#noterEcoute` enrichit CHAQUE événement**, sans toucher aux
dizaines d'appels disséminés dans l'app : `detailInteraction()` ajoute `ecran`
et, s'il est encore pertinent (moins de 30 s), `clic` + `clic_il_y_a_ms` au
`detail` jsonb. Le `detail` fourni par l'appelant garde la main sur ces clés.
**`erreurDepuisEcoute` continue de lire le `detail` ORIGINAL**, pas
l'enrichi : son résumé JSON (tronqué à 300 caractères pour certains
événements) ne doit pas voir l'écran et le clic écraser les champs propres à
l'événement — cette même information arrive déjà dans `jarvis_erreurs.contexte`
via le point suivant.

**`erreurs.ts#signalerErreur` retombe sur `contextePourErreur()` UNIQUEMENT
quand l'appelant n'a rien fourni.** C'est le vrai trou trouvé en creusant :
`src/lib/notifyError.ts#withErrorToast` — le seul endroit par lequel passent
TOUTES les écritures de l'app — n'a JAMAIS renseigné `contexte`, pas plus que
`useFileEnAttente.ts`. Une écriture qui échouait disait QUOI avait raté
(`detail`), jamais OÙ ni APRÈS QUOI. Les appels qui passent déjà quelque chose
de plus précis (la phrase dictée, dans tout `MicButton.tsx` et
`repondreDecisionVoix.ts`) gardent la main : le repli ne s'applique qu'en
l'absence de `contexte` explicite, jamais en écrasement.

**Aucune migration.** `jarvis_erreurs.contexte` (« ce qui se passait : la
phrase dictée, l'écran, l'action tentée ») et `journal_ecoute.detail` (jsonb)
existaient déjà exactement pour ça — la colonne le disait dans son propre
commentaire depuis la migration 0019, personne ne l'alimentait pour l'écran.

**Ce qui n'est PAS fait, volontairement** : `dev_log` n'a pas été touché.
C'est le journal de bord des sessions et des échanges avec Raphaël, pas un
journal d'interaction — les deux exemples concrets de sa demande (« quel
bouton touché juste avant », « le contexte d'écran au moment d'une erreur »)
visent `journal_ecoute` et `jarvis_erreurs`, pas `dev_log`. Y ajouter quelque
chose ici aurait été une extension non demandée.

**Non mesuré sur un vrai téléphone** (pas d'appareil ici) : que le clic
capturé en phase de capture (`document.addEventListener("click", ..., {
capture: true })`) survit bien aux boîtes de dialogue et menus qui arrêtent la
propagation (Radix, utilisé par shadcn/ui) — c'est justement pour ce cas que
la capture a été choisie plutôt que la bulle, mais seule une session future
avec les vraies données de `journal_ecoute` le confirmera.

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

## Jarvis répond à la QUESTION POSÉE, pas à un briefing figé

Livré le 7 sept. 2026 (chantier `8fbd6d61`). Le 5 sept. je lui demandais de
COCHER ce que devait contenir son briefing du matin. Il a coché, puis a
expliqué que la question elle-même était mauvaise :

> « Tout ce qu'on lui demande ça ne doit pas être figé. JARVIS doit développer
> une finesse d'esprit […] Si je demande un point global ça me dit tout, si je
> lui dis "j'ai quoi comme rdv aujourd'hui", ou si je lui dis "qu'est-ce qui
> est en retard de mon côté", "j'ai quoi comme décision à prendre sur le
> développement". Bref tout est n'importe quoi, il doit être en mesure de
> répondre. »

**Donc PAS de cases à cocher dans Paramètres pour ce sujet, et ce n'est pas un
oubli** : elles seraient exactement le gabarit figé qu'il rejette. Le point du
matin de 09:15 reste ce qu'il est — c'est une notification, pas une réponse.

**Sur ses quatre exemples, trois avaient déjà de quoi être servis** : les
tâches et leurs échéances partent à chaque phrase, l'agenda a son action, et
« un point global » se compose avec le reste. **Le quatrième n'avait RIEN** —
les questions des sessions vivent dans `dev_log`, qui n'était envoyé nulle
part. « J'ai quoi comme décision à prendre » était la seule de ses phrases à
laquelle Jarvis ne POUVAIT pas répondre. C'est ce trou-là qui est bouché,
et rien de plus.

- `_shared/questionPosee.ts` — la consigne, **une seule source**, importée par
  `voice-command` ET `live-jeton` (comme `honnetete.ts`).
- `_shared/ceQuiLAttend.ts` — le bloc, joint à chaque phrase parce qu'il est
  COURT et que c'est mesuré : un seul point l'attendait le 7 sept., ~150
  caractères contre ~45 000 pour une phrase. Plafonné à 8, le plus ancien
  d'abord. **Vide, il ne rend RIEN** — pas même un titre.

### Le compte rendu d'une session n'est pas une décision qui l'attend

Trouvé en faisant ce chantier, et c'est le vrai défaut. `kind = "action"`
porte **deux sens opposés** que rien dans le schéma ne sépare : une action que
RAPHAËL doit faire (posée par `scripts/demander.sh`) et le compte rendu d'une
action qu'une SESSION a faite (« Fait et archivé. Commit … »).

**Mesuré sur ses 215 entrées de journal** : « en attente de sa décision »
annonçait **5 points quand 1 seul l'attendait**, et **16 messages** pouvaient
faire sonner son téléphone au lieu de **12**. Il aurait été réveillé par le
compte rendu d'une session.

Le discriminant n'est pas une devinette sur le texte : `demander.sh` renseigne
toujours `pourquoi`, un compte rendu jamais. **Et `--pourquoi` y est devenu
OBLIGATOIRE dans le même travail** — tant qu'il était facultatif, la séparation
ne tenait que par habitude, et une demande postée sans lui aurait disparu de
son cockpit sans un bruit.

**La règle a maintenant DEUX copies, pas trois** : `src/lib/journalDestinataire.ts`
côté app, `_shared/destinataire.ts` côté serveur — partagée par `push-notifier`
(qui portait la sienne) et `voice-command`. Une Edge Function ne peut pas
importer `src/`, d'où les deux ; `verifier-question-posee.ts` les fait tourner
sur les mêmes cas et refuse qu'elles divergent, plutôt que de comparer leur
texte.

**Piège de rédaction payé au passage** : écrite en disjonction
(`… || actionQuiLuiRevient(entry)`), la règle laissait passer TOUS les autres
`kind` — un simple `info` aurait fait sonner le téléphone. La forme qui tient
est d'exclure le compte rendu d'abord, puis d'énumérer les `kind`. Un contrôle
garde ce cas précis.

### Une question mal formée n'atteint plus sa carte (17 sept. 2026)

Chantier `f397305d`. Une session a inséré en SQL brut une note TECHNIQUE
adressée à une autre session (`kind='question'`), sans passer par
`scripts/demander.sh` et sans préfixer « Pour la session … ». Elle a atterri
telle quelle sur « Ce qui attend ta décision » — ses mots : « je ne comprends
rien. En fait, il me fait un récap très bizarre, pas clair du tout. »

**La mesure du 7 sept. (« 9 questions sur 14 sans `pourquoi`, toutes
légitimes ») ne tient plus, remesuré le 17 sept. sur les 27 questions
réelles du journal : les 10 sans `pourquoi` sont maintenant TOUTES des
messages entre sessions, zéro question légitime.** La raison : `--pourquoi`
est devenu obligatoire dans `demander.sh` entre-temps — toute question posée
par le chemin canonique en porte un désormais, avec ou sans options.

`questionMalFormee` (même fichier, même paire de copies que ci-dessus) exclut
donc de `enAttenteDeRaphael`/`estPourRaphael` une question sans `pourquoi`,
sans options, et non reconnue par `adresseeAUneSession`. **Volontairement PAS
une liste de préfixes à élargir** (« Session X ici », « Pour les sessions… »
existent aussi et continueraient à échapper à un motif énuméré) : puisqu'une
vraie demande a toujours `pourquoi`, une question qui n'en a pas n'est
structurellement plus une demande bien formée, quelle que soit sa formulation.

## Jarvis se souvient de ce qu'on vient de se dire (23 sept. 2026)

Le trou le plus coûteux, MESURÉ sur ses 409 vraies dictées : `voice-command`
ne recevait que la phrase COURANTE. « Lance le premier épisode » après une
recherche, « classe les deux chantiers créés à l'instant », « mets-la plutôt
dans Perso », « à 9h » dit après sa propre question, « pourquoi tu n'as pas
ouvert le chantier ? » (→ « lequel ? ») tombaient dans le vide. Une dizaine de
correctifs de ce fichier compensaient chacun UN cas de ce même trou
(`tacheEnAttente`, `confirmationEnvoi`, `repriseDictee`…) — ils restent, ils
décident sur l'appareil sans aller-retour.

- `src/lib/memoireDeTravail.ts` (**pur**) : les six derniers tours des dix
  dernières minutes — ce qu'il a dit, ce qui a été FAIT (action + titre, app,
  contact, ids), ce que Jarvis a répondu. Mémoire VIVE, jamais écrite : la
  mémoire longue durée existe pour le reste. `MicButton` l'alimente dans
  `retenirLeTour` (tous les chemins) et à chaque `clarify`, et l'envoie en
  `derniersTours`.
- `supabase/functions/_shared/derniersTours.ts` : le bloc de consigne. **Vide,
  il ne rend RIEN.** Il dit aussi les limites : ne jamais REFAIRE une action
  listée, ne pas rattacher de force une phrase qui se suffit à elle-même,
  demander quand on ne sait pas à quel échange elle renvoie — et, sur un
  reproche (« pourquoi tu ne l'as pas fait ? ») après un échec, le FAIRE.
- **Pas en Live** : la session garde déjà tout (et la poignée de reprise).

**Vérifié contre le VRAI modèle sans déployer** : `scripts/essayer-consigne.sh
memoire-de-travail` (10/10) — et **en ligne depuis le 23 sept.**
(voice-command v124, chantier 2e40a764), revérifiée 10/10 le 24. Chaque cas qui compte est rejoué SANS la mémoire :
sans elle, il rangeait le mauvais chantier, déplaçait la mauvaise tâche, ne
comprenait pas « à 9h » et redemandait « lequel ? ». Les cas « à ne pas faire »
(une nouvelle tâche après une tâche, « appelle Yoni » après un autre appel)
tiennent.

**Et ce qu'il a VRAIMENT répondu est gardé.** Le serveur n'écrit dans
`echanges` que le `message` du modèle — vide pour une action. Pour 223 de ses
échanges, « Vos conversations » montrait sa phrase sans rien en face.
`completerReponseEchange` (`echangeLocal.ts`) écrit la phrase dite après
l'exécution sur la ligne du serveur (quelques essais espacés : elle est écrite
APRÈS la réponse), jamais par-dessus une réponse déjà là.

### Essayer une consigne sans la déployer : `scripts/essayer-consigne.sh`

Né le 23 sept. 2026, jeton de déploiement expiré. Il prend la consigne de
`voice-command` telle qu'elle est SUR LE DISQUE (le code d'`index.ts` jusqu'à
`Deno.serve`, extrait, jamais recopié), l'appelle avec `GEMINI_API_KEY_TEST`,
et joue les cas de `scripts/consigne/<nom>.ts`. Aucun compte de test, aucune
écriture en base. Deno est installé une fois depuis npm s'il manque. Ce qu'il
ne couvre pas : ce que la fonction LIT en base (souvenirs, corrections…) —
après un déploiement, `verifier-commande-vocale.mjs` reste LA vérification.
**Écris un fichier de cas pour toute modification de consigne**, avec un
témoin sans la modification : c'est ce qui prouve qu'elle sert.

**Son pendant pour le mode Live : `scripts/essayer-consigne-live.sh <nom>`**
(cas dans `scripts/consigne/live-<nom>.mjs`). La consigne de `live-jeton` est
extraite par Deno de la même façon, puis Node ouvre de VRAIES sessions Live
(jeton éphémère, clé de test) et leur parle en texte : ça dit si le modèle
appelle l'outil, avec quoi, et ce qu'il dit. L'audio (fin de phrase, voix) et
le vrai contexte n'y sont pas.

## Ce qu'il disait ne pas savoir faire, alors que l'app le sait (23 sept. 2026)

Relu dans ses 409 vraies dictées : « mets-toi à jour » / « installe la
dernière version » (six fois), « montre-moi les nouvelles fonctionnalités »,
« il me reste assez de crédit ? », « désactive le point du matin jusqu'à
nouvel ordre » — et chaque fois « je ne peux pas, va dans Paramètres ».
`src/lib/capacitesVoix.ts` (**pur**, `verifier-capacites-voix.ts`) les
reconnaît SUR L'APPAREIL (actions `update_app`, `whats_new`, `usage_report`,
`set_notif_pref`) : elles marchent sans le serveur. **Mesuré sur les 409
dictées : 9 déclenchements, tous justes, zéro à tort.**

- **La mise à jour** : rapide → Jarvis le DIT puis applique 4,5 s plus tard
  (appliquer redémarre l'app, il n'entendrait jamais la phrase) ; natif changé
  → il ouvre Paramètres › L'application au lieu de prétendre installer ; GitHub
  muet → ni « à jour » ni « rien à faire ». Une QUESTION (« y a-t-il une mise
  à jour ? ») ne déclenche aucun geste.
- **Quoi de neuf / à essayer** : les archivés des sept derniers jours, et les
  ouverts au marqueur `a_constater` — lus par `marqueurDe`, la seule lecture
  des marqueurs du projet.
- **Le quota** : reprend le verdict de `pastilleQuota` pour ne jamais dire
  autre chose que la pastille sous le cœur. Jamais de pourcentage.
- **Les notifications** : écrit `jarvis_notifications` et émet
  `REGLAGES_RESTAURES`, sur lequel `useNotifications` relit et REPROGRAMME —
  sans lui, « coupe le point du matin » laisserait sonner celui de demain.
- `src/lib/systemeVoix.ts` construit ce que le micro sait de la version et du
  quota, au même endroit pour l'app et la fenêtre de l'appui long.

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

## Naviguer vers une section de Paramètres : la moitié « application »

Chantier `aac9a0dd` (17 sept. 2026 ; `59468714` en était un doublon — même
demande dictée deux fois, « Jarvis doit pouvoir manipuler/configurer/
paramétrer toutes les fonctionnalités sur simple commande vocale » —, archivé
au profit du premier). Sa demande : Jarvis doit pouvoir naviguer dans l'app
(« emmène-moi dans les notifications ») et guider physiquement vers un réglage
incompris.

**Ce chantier livre UNIQUEMENT la moitié application.** La reconnaissance de
la phrase elle-même (extraire « notifications » de « emmène-moi dans les
notifications ») est le même travail que `commandeLocale.ts` — isoler la
commande du verbe qui l'introduit — et vit dans
`supabase/functions/voice-command/**`, `src/lib/commandeLocale.ts`,
`MicButton.tsx` : hors du périmètre du thème « L'app elle-même », propriété du
thème « Le téléphone ». Une question précise reste ouverte en `dev_log`
(item_id `aac9a0dd`) pour la session qui porte la voix — ne la reproblématise
pas, elle nomme déjà l'API prête à appeler ci-dessous.

- `src/lib/sectionsParametres.ts` — **une seule source** pour le catalogue des
  sections de Paramètres (`SECTIONS_PARAMETRES`, déplacé depuis
  `SettingsPage.tsx` où il vivait en double emploi potentiel) et
  `sectionCorrespond` (déplacé depuis `Section.tsx`, qui le réexporte pour ne
  pas casser l'import existant). `resoudreCibleParametres(cible)` — **pure**,
  `scripts/verifier-navigation-parametres.ts` — résout une cible déjà propre
  (une clé exacte, ou un mot isolé) vers UNE section, ou `null` si rien ou
  PLUSIEURS sections correspondent. Mesuré sur le vrai catalogue et pas
  supposé : « google », « notification » (au singulier) et « mise à jour »
  vivent chacun dans les mots-clés de DEUX sections à la fois et se taisent
  donc à raison — ce n'est pas un défaut à corriger.
- `SettingsPage.tsx` lit `?section=<cible>` dans l'URL (`useSearchParams`),
  résout via `resoudreCibleParametres`, retient la clé trouvée en état, et
  retire le paramètre de l'URL dans tous les cas (résolu ou pas) — le laisser
  referait tenter la même résolution à chaque rendu.
- `Section.tsx` reçoit `cibleNavigation` (vrai quand CETTE section est la
  cible) : elle s'ouvre seule, défile jusqu'à elle et se met en évidence (un
  contour, 2,5 s) — sans qu'on ait cliqué dessus. Vérifié dans un vrai
  navigateur (`scripts/harness/reglages.tsx`, bloc `#navigation-section`, dans
  `verifier-reglages-web.mjs`) : le composant RÉEL, pas une paraphrase.

**Pourquoi une mise en évidence DOM et pas le contrôle d'écran du chantier
3f3ad20b** (l'idée initiale de la demande, « s'appuyant sur le contrôle
d'écran déjà livré ») : ce mécanisme (service d'accessibilité Android) existe
pour cliquer sur l'écran d'une AUTRE application, dont notre app n'a pas le
contrôle direct. Sur SA PROPRE interface, Jarvis a déjà le contrôle total
(React, DOM) — y superposer un clic d'accessibilité serait plus fragile
(dépend d'un service que Raphaël doit activer, relit l'arbre à chaque fois)
pour un résultat que `scrollIntoView` + une classe CSS obtiennent directement
et de façon fiable. Ne réintroduis pas cette confusion : le contrôle d'écran
3f3ad20b reste réservé aux écrans d'AUTRES applications.

**Ce qui n'est PAS encore utilisable de bout en bout, et il ne faut pas le
présenter comme livré** : rien n'appelle encore
`navigate("/settings?section=<cible>")` — ni une action vocale (hors
périmètre, voir plus haut), ni un lien ailleurs dans l'app. C'est une API
prête, pas une fonctionnalité que Raphaël peut déclencher aujourd'hui.

## Changer d'onglet à la voix (chantier a9c75d52, 23 sept. 2026)

La moitié « Paramètres » existait (`navigate_settings`, ci-dessus) ; les
ONGLETS non. MESURÉ sur la commande locale avant ce travail : « ouvre le
cockpit » → `open_app` « Le cockpit » (une application DU TÉLÉPHONE qui
porterait ce nom), « ouvre la mémoire » et « ouvre les paramètres » pareil,
« va dans le cockpit » → la section cockpit de Paramètres, et « emmène-moi
dans mes notes » ou « va dans mes tâches » → rien.

`src/lib/ongletsApp.ts` (**pur**, `verifier-onglets-app.ts`) : un verbe de
déplacement, puis EN ENTIER un nom d'onglet (article, possessif, « l'onglet »,
« la page » tolérés) — les libellés de `DashboardLayout.tsx` y sont tous. La
règle passe AVANT les sections de Paramètres et « ouvre <application> ».
**La moitié du contrôle vérifie le silence** : « ouvre WhatsApp », « ouvre
Samsung Notes », « emmène-moi à la villa Dan » (itinéraire), « va voir les
réglages du cockpit » (section), « montre-moi mes tâches » et « lis mes
notes » (qui les LISENT) ne bougent pas.

**La fenêtre de l'appui long n'a pas d'onglets** : `MicButton` y reçoit
`sansOnglets`, et Jarvis dit qu'il faut ouvrir l'application plutôt que de
naviguer dans le vide. Un onglet ajouté à la barre se déclare dans
`ongletsApp.ts` dans le même travail.

## Le widget de tâches DÉFILE (chantier 562f1475, 27 sept. 2026)

Sa demande : « Peux tu faire en sorte quon puisse défiler les taches dans les
widgets creer de jarvis ». **Ce n'était pas un réglage à monter.**

**MESURÉ avant de coder** : 43 tâches à faire, 14 urgentes, et son réglage
`jarvis_widget_config` à `maxTasks: 5` — *l'ancien maximum du sélecteur*, posé
huit minutes avant sa demande. Il était au plafond, et le widget lui cachait 9
urgentes sur 14. La liste était **un seul `TextView`** (`maxLines="4"`,
`ellipsize="end"`) rempli par le provider : rien ne pouvait défiler, par
construction.

Android n'offre **qu'une** façon de faire défiler quelque chose dans un widget :
une vue de collection branchée sur un `RemoteViewsService`. D'où
`JarvisWidgetTachesService.java`, et la frontière compte :

- `src/lib/widgetTaches.ts` — **pur** : quelles tâches partent, dans quel ordre,
  avec quelle étiquette d'échéance, et le plafond. C'est là que ça peut être
  faux en silence (une tâche cochée qui reste, un plafond qui coupe les
  urgentes).
- `JarvisWidgetTachesService.java` — la fabrique. Elle ne DÉCIDE rien : ni tri,
  ni plafond. Une seconde règle écrite là contredirait l'onglet Tâches, et
  `verifier-widget-taches.ts` la refuse.

**Le réglage a changé de SENS, et c'est le point à ne pas défaire.** « Tâches
affichées » (1 à 5) est devenu « Tâches portées » (Toutes / 5 / 10 / 20 / 50) :
ce qui est VISIBLE dépend maintenant de la hauteur qu'il donne au widget sur son
écran d'accueil, plus d'un nombre. `TOUTES` (0) est le défaut — un plafond par
défaut n'avait de sens que tant que la liste ne défilait pas. `PLAFOND_WIDGET`
(50) n'est pas une préférence : la charge utile d'une mise à jour de RemoteViews
est plafonnée (~1 Mo), et au-delà la mise à jour ENTIÈRE échoue, widget vide à la
clé. `maxResizeHeight` est passé de 220 à 600 dp : à 220 il pouvait défiler sans
jamais pouvoir s'agrandir.

**Cinq oublis, tous MUETS, que le contrôle garde** — c'est pour ça qu'il lit le
code plutôt que de faire confiance, faute de SDK Android ici :

1. `setRemoteAdapter` absent → la liste reste vide.
2. `notifyAppWidgetViewDataChanged` absent → elle se fige sur son premier
   dessin ; une tâche cochée y reste affichée.
3. L'intent de l'adaptateur non rendu unique (`setData` + `toUri`) → Android
   distingue deux adaptateurs par les DONNÉES de l'intent, **extras exclus** :
   deux widgets côte à côte partagent une fabrique, et le second se fige sur le
   contenu du premier.
4. `BIND_REMOTEVIEWS` absent du manifeste → Android refuse de se lier au
   service, et ne le dit nulle part.
5. `setEmptyView` absent → une liste vide est un rectangle vide, qui se lit
   exactement comme un widget en panne.

**L'appui a dû être redistribué, et ce n'est pas un oubli** : une `ListView`
consomme les appuis qui la touchent, donc le clic posé sur la racine ne serait
plus jamais reçu au-dessus de la liste. Le **cœur** et l'**en-tête** gardent
« ouvre et écoute » (chantier `0ea8fd8d`) ; une **ligne** ouvre l'app sans rien
dicter, par `setPendingIntentTemplate` + `setOnClickFillInIntent` — RemoteViews
refuse un `PendingIntent` par ligne dans une vue de collection, l'appui ne
ferait rien. Le modèle est `FLAG_MUTABLE` : immuable, Android ne peut pas y
ajouter ce que la ligne y met.

**Trouvé en écrivant le module pur, corrigé avec** : `widgetSnapshot` calculait
« aujourd'hui » avec `toISOString().slice(0, 10)`, donc en UTC. Il vit en Israël
(UTC+2/+3) : entre minuit et 3 h du matin, ses tâches dues **aujourd'hui**
cessaient d'être comptées urgentes. Même piège que `jourLocal()` dans
`echeance.ts` et que la fenêtre « aujourd'hui » du cockpit.

**Et trois contrôles sur dix-huit ne servaient à rien, trouvés en les essayant à
l'envers** — le piège de ce dépôt, une sixième fois. Deux cherchaient leurs
attributs XML avec un `[\s\S]*?` non borné : ils traversaient la fin de la
balise visée et trouvaient le `0dp` du `TextView` vide plus bas, ou le
`match_parent` de la racine — remettre `wrap_content` les laissait VERTS. Ils
isolent maintenant la balise avant de la lire. Le troisième vérifiait que le
jour se lit en LOCAL : le conteneur de la CI est en UTC, où local et UTC
désignent le même jour, donc remettre `toISOString()` ne le faisait pas rougir.
**Le script se relance lui-même sous `TZ=Asia/Jerusalem`** — poser
`process.env.TZ` en cours de route ne suffit pas, Node garde le fuseau de son
démarrage (mesuré le même jour).

**La consigne serveur disait encore « 1 à 5 », et le témoin prouve que ça
comptait** : `scripts/essayer-consigne.sh widget --temoin` remonte l'ancienne
description et remesure sur le VRAI modèle (clé de test, sans déployer).
Résultat, le 27 sept. : « montre toutes mes tâches sur le widget » ne posait
AUCUN `max_tasks`, et « limite le widget à **dix** tâches » rendait
`max_tasks: 5` — le modèle rabattait dix sur le plafond écrit dans la
description. Avec la nouvelle, 5 cas sur 5. Le témoin patche le **schéma
d'outil**, pas `CONSIGNES` : les deux mentions (`max_tasks.description` et la
longue prose de l'énumération `action`) y vivent, et une première version qui
cherchait dans `CONSIGNES` s'arrêtait sur « introuvable » — ce qui se lit comme
un bug de la consigne alors que c'était le témoin qui visait à côté.

**Non vérifié sur l'appareil**, et il ne faut pas le présenter autrement : il n'y
a ni SDK Android ni téléphone ici. La CI prouve que ça compile, pas que ça
défile. Et **ça touche `android/` : il lui faut une vraie APK**, la mise à jour
rapide ne porte pas un nouveau service natif.

## Les réglages à la voix : dix-sept, compris SUR LE TÉLÉPHONE, et ils s'appliquent tout de suite (23 sept. 2026)

Chantier `8e1da88b`, né du parapluie a9c75d52. `src/lib/reglagesVoix.ts` est
passé de 9 à 14 réglages : l'annonce du résultat de chaque action, le mode
Live, la clôture du Live à la voix, la vue simple du cockpit, et ce que le
cockpit compte comme livré. Chacun relu dans le module qui possède la clé
(valeur stockée exacte). **Écartés exprès**, et la raison est dans l'en-tête
du module : l'annonce app fermée (recopiée côté Android par son écran), les
curseurs continus (des paliers seraient inventés), l'archive des tâches (lue
une seule fois à l'ouverture de l'onglet), l'envoi automatique des messages
(envoi en son nom).

**Trouvé en le faisant, et c'est le vrai défaut : un réglage changé à la voix
ne s'appliquait pas.** `ecrireReglage` n'émet que `REGLAGE_MODIFIE` (la
sauvegarde en base) ; les écrans et hooks qui gardent un réglage en mémoire se
relisent sur `REGLAGES_RESTAURES`. « Mets le thème sombre » écrivait donc la
valeur, et l'écran restait clair jusqu'au redémarrage — d'autant que la
relecture du thème vivait dans la carte Thème de Paramètres, montée seulement
quand cet écran est ouvert. Désormais `set_setting` émet
`REGLAGES_RESTAURES`, et `src/components/ThemeEnDirect.tsx`, monté UNE fois à
la racine (App.tsx), est la seule relecture du thème de l'app.

`verifier-reglages-voix.ts` exige pour CHAQUE réglage vocal un lecteur connu
qui l'applique tout de suite (`RELU_PAR`) : un réglage ajouté sans lecteur
fait rougir le contrôle. `verifier-reglages-web.mjs` rejoue le chemin de la
voix dans un vrai navigateur (essayé à l'envers : sans `ThemeEnDirect`, il
rougit). **La moitié serveur** (`_shared/branchements.ts`, l'énumération et la
consigne de `voice-command`) est en ligne depuis le 23 sept. (chantier
2e40a764 : voice-command v124, live-jeton v31) — le modèle connaît les
dix-sept, au micro comme en Live.

### Le soir même : « règle ta vitesse de réponse », et « qu'est-ce que j'ai paramétré ? »

Ses mots après un essai : « elle est toujours pas capable de me dire qu'est-ce
que j'ai paramétré […] j'aimerais pouvoir régler Jarvis à l'oral, dire “règle
ta vitesse de réponse” […] il y a beaucoup de réglages, à l'utilisation ça
devient vite difficile ». **Mesuré sur la vraie consigne Live alors en ligne**
(`scripts/essayer-consigne-live.sh reglages`, témoin) : à « Règle ta vitesse de
réponse sur rapide », le modèle répondait « je ne peux pas » sans appeler
l'outil — `_shared/environnement.ts` disait encore « NEUF de tes réglages » —
et à « quelle est ta vitesse de réponse ? », il inventait « quasi
instantanée ». Consigne corrigée : 10 demandes de réglage sur 10 partent à
l'outil, une question générale reste une réponse directe.

- **Tout se reconnaît SUR LE TÉLÉPHONE** (`commandeReglage`, dans
  `reglagesVoix.ts`, pur) : régler (« mets le thème sombre », « active le mode
  Live »), ajuster d'un palier (« réponds plus vite », « parle plus
  lentement », « ne me coupe pas la parole ») — action `adjust_setting`, que
  le serveur ne connaît pas —, lire UN réglage (« quelle est ta vitesse de
  réponse ? », ou « règle ta vitesse de réponse » sans valeur) ou TOUS
  (« qu'est-ce que j'ai paramétré ? »). Aucun modèle : ça marche pendant que
  Google sature. Tout est ANCRÉ — « coupe le mode Live et appelle Yoni » part
  au serveur. **Mesuré sur ses 409 dictées et 160 commandes Live : zéro prise
  à tort**, et sa commande de 16 h 07 (« activer la lecture des rappels à voix
  haute », morte sur un 503) passe.
- **Trois curseurs réglables par paliers nommés** : la vitesse de réponse
  (`jarvis_dialogue_pause_ms` : posée 3,5 s / normale 2 s / rapide 1 s), le
  débit de la voix (`jarvis_voice_rate`), l'écoute après réponse
  (`jarvis_dialogue_suite_ms`). Une valeur posée au curseur ENTRE deux paliers
  se dit telle quelle, et « plus vite » va au palier voisin dans ce sens,
  jamais à l'envers. **La vitesse de réponse ne joue pas en Live** (c'est
  Google qui décide de la fin de phrase) : la confirmation le DIT quand le
  mode Live est allumé.
- **« Qu'est-ce que j'ai réglé ? » dit les VALEURS**, pas la liste de ce qu'il
  pourrait changer : chaque réglage vocal lu comme le lit son module (`defaut`
  de chaque entrée, relu dans ce module, et aligné sur `branchements.ts` par un
  contrôle), plus les applications par défaut, la voix coupée, le point du
  matin, les heures de silence et la lecture des rappels.
- L'écriture vit dans UNE fonction, `appliquerReglage` (`voiceActions.ts`),
  partagée par « mets X » et « plus vite » : un contrôle refuse une écriture à
  part dans l'un des deux cas.

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
