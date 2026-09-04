# Quatre prompts pour quatre sessions parallèles (3 sept. 2026)

Écrit par la session `claude/resume-sections-chantier-6bahcv`. Raphaël ouvre
quatre sessions Claude Code et colle un de ces prompts dans chacune. Chaque
session prend **un thème entier**, pas un chantier isolé.

## Réparé avant d'ouvrir les sessions (3 sept., 19h)

La branche principale portait des **marqueurs de conflit non résolus commités**
(merge 43f9069), dans `supabase/functions/voice-command/index.ts` et
`scripts/verifier-commande-vocale.mjs`. La fonction ne se serait plus déployée
et le script de vérification ne démarrait plus. C'est résolu : le modèle reste
`gemini-3.5-flash-lite` par défaut, réglable par le secret `GEMINI_MODELE`,
avec les autres versions du Lite en secours de quota. Vérifié : build vert,
les trois contrôles hors réseau verts, **25/25 sur la fonction déployée
(v42)**.

Leçon pour les quatre sessions : après un `git pull` ou un merge, faites
`grep -rn '^<<<<<<< ' --exclude-dir=node_modules .` avant de commiter.

## Règle de non-collision — à respecter par les quatre

Le découpage des fichiers ci-dessous n'est pas indicatif, c'est le contrat qui
évite que deux sessions écrasent le travail l'une de l'autre :

| Session | Fichiers qui lui appartiennent |
|---|---|
| **A — Voix et écoute** | `src/hooks/useSpeechRecognition.ts`, `useSpeechSynthesis.ts`, `useWakeWordSetting.ts`, `useDialogueSetting.ts`, `useVoiceSetting.ts`, `src/lib/motCle.ts`, `dialogueTour.ts`, `dialoguePrefs.ts`, `voicePrefs.ts`, `src/components/voice/MicButton.tsx`, `scripts/verifier-dialogue.ts`, `verifier-mot-cle.ts`, `verifier-ecoute-web.mjs` |
| **B — Le téléphone** | `src/lib/actionsTelephone.ts`, `actionsTelephoneVocales.ts`, `commandeLocale.ts`, `voiceActions.ts`, `android/**`, `capacitor.config.ts`, `supabase/functions/voice-command/**`, `scripts/verifier-commande-locale.ts`, `verifier-commande-vocale.mjs` |
| **C — L'app elle-même** | `src/components/cockpit/**`, `tasks/**`, `layout/**`, `settings/**`, `ui/**`, `src/hooks/useDevItems.ts`, `useDevLog.ts`, `useTasks.ts` |
| **D — Messagerie et agenda** | `supabase/functions/google-calendar/**`, `google-gmail/**` (à créer), `google-oauth/**`, `_shared/google.ts`, `src/lib/googleCalendar.ts`, `src/hooks/useGoogleAccount.ts` |

**`supabase/functions/voice-command/index.ts` et `src/lib/commandeLocale.ts`
appartiennent à la session B, à elle seule.** Une session qui a besoin d'une
nouvelle action vocale ne les modifie pas : elle écrit sa demande dans
`dev_log` (`kind = 'question'`, avec le nom de l'action et ses paramètres) et
B l'ajoute. Deux sessions dans ce fichier en même temps = un déploiement qui
écrase l'autre, et Jarvis muet.

`src/components/voice/MicButton.tsx` est à A, mais B et C peuvent avoir besoin
d'y toucher : dans ce cas, annonce-le dans `dev_log` **avant**, et fais un
diff minimal.

---

## Prompt session A — Voix et écoute

```
Tu prends le thème « Voix et écoute » du cockpit, en entier. C'est le thème le
plus urgent : Raphaël a testé l'app en direct hier soir et a remonté quatre
symptômes qu'il vit à chaque phrase.

Réserve d'abord tes chantiers avec le nom de ta branche :
  scripts/sql.sh "select claim_dev_item('6b33ee97-d4b6-4d7a-96cf-005b87da6736', '<ta branche>', 180)"
  scripts/sql.sh "select claim_dev_item('3435b4a2-22ef-4d71-ba24-016017a1fb77', '<ta branche>', 180)"

Puis lis leurs notes en entier (elles sont tronquées dans le bloc de
démarrage) :
  scripts/sql.sh "select id, title, notes from dev_items where theme = 'Voix et écoute' and archived_at is null"

Les cinq chantiers du thème et leur état :
- 6b33ee97 (high) — les 4 symptômes du test en direct. C'est ton cœur de
  travail. Traite-les ENSEMBLE : ils viennent probablement du même
  sous-système (micro + tour de parole), et Raphaël en a assez des correctifs
  posés un symptôme à la fois.
- 3435b4a2 — « déclencher la discussion uniquement quand je t'appelle ». Même
  cause racine que le symptôme 4 (micro qui s'active tout seul). Je l'ai
  reclassé dans ton thème pour ça. Il n'a pas de notes : sa demande, c'est que
  Jarvis n'écoute pas en continu.
- 796c442c — réveil vocal en arrière-plan, écran éteint : REPORTÉ par Raphaël
  le 2 sept. Ne le code pas, ne rouvre pas la décision.
- 6dd16f83 — doublon du précédent. Ne le code pas.
- 2de46233 — ElevenLabs : REPORTÉ par Raphaël le 3 sept. (« note-le pour plus
  tard »). Ne le code pas, ne lui repose pas la question.

Donc tu as deux chantiers à traiter, et ils sont liés. Priorité dans l'ordre
où ça le gêne :
1. Le symptôme 4 d'abord — micro qui s'active et se coupe tout seul, y compris
   quand il dicte à une AUTRE application. Si c'est vraiment Jarvis, c'est une
   écoute non voulue, pas un inconfort. Vérifie d'abord si c'est bien nous
   (écoute de fond, réveil vocal qui tourne sans qu'il le sache) avant de
   corriger quoi que ce soit ; si ce n'est pas nous, dis-le clairement plutôt
   que de patcher au hasard.
2. Le tour de parole bloquant (symptôme 3) : il veut une vraie conversation
   continue, pas un aller-retour à relancer à la main. Regarde dialogueTour.ts
   et le réglage « Rythme de la discussion » — ça ressemble à une régression.
3. La latence de 3-4 secondes à la prise de parole (symptôme 2).
4. Le réveil au mot « Jarvis » qui ne se déclenche toujours pas (symptôme 1).
   Attention : ne le confonds pas avec 796c442c, qui est le réveil ÉCRAN
   ÉTEINT et qui, lui, est reporté. Ici c'est app ouverte.

Périmètre de fichiers qui t'appartient — deux autres sessions travaillent en
parallèle sur « Le téléphone » et « L'app elle-même », ne déborde pas :
  src/hooks/useSpeechRecognition.ts, useSpeechSynthesis.ts,
  useWakeWordSetting.ts, useDialogueSetting.ts, useVoiceSetting.ts,
  src/lib/motCle.ts, dialogueTour.ts, dialoguePrefs.ts, voicePrefs.ts,
  src/components/voice/MicButton.tsx,
  scripts/verifier-dialogue.ts, verifier-mot-cle.ts, verifier-ecoute-web.mjs

NE TOUCHE PAS à supabase/functions/voice-command/ ni à
src/lib/commandeLocale.ts : ils appartiennent à la session « Le téléphone ».
Si tu as besoin d'une nouvelle action vocale, écris-la en demande dans dev_log
(kind = 'question') et elle l'ajoutera.

Vérifie avec les scripts canoniques du dépôt, ne réinvente pas les tiens :
  node --experimental-strip-types scripts/verifier-dialogue.ts
  node --experimental-strip-types scripts/verifier-mot-cle.ts
  node scripts/verifier-ecoute-web.mjs
Ces trois-là tournent sans réseau. Ajoute des cas à ces scripts pour chacun
des quatre symptômes, de façon qu'une régression future se voie toute seule.

Ce que Raphaël attend à la fin : que tu lui dises ce qui est corrigé, avec la
preuve (script au vert, pas « ça devrait marcher »), et surtout que le travail
touche l'app Android — donc rappelle-lui qu'il doit mettre à jour l'APK
(bouton « Mettre à jour » dans Paramètres) pour le voir sur son téléphone. Le
web se met à jour tout seul, pas l'app installée.

Avant de t'arrêter, même en cours de route : écris ton état dans dev_log ou
dans les notes du chantier, et libère ta réservation.
```

---

## Prompt session B — Le téléphone

```
Tu prends le thème « Le téléphone » du cockpit, en entier.

Réserve d'abord, avec le nom de ta branche :
  scripts/sql.sh "select claim_dev_item('3de0e08a-9fdb-4ed2-a98c-66678aa39026', '<ta branche>', 180)"

Puis lis les notes complètes (elles sont longues et contiennent des décisions
déjà prises par Raphaël — ne les rouvre pas) :
  scripts/sql.sh "select id, title, notes from dev_items where theme = 'Le téléphone' and archived_at is null"

Les cinq chantiers du thème :
- 3de0e08a (high) — MUSIQUE : « mets-moi la musique Maes la planque » → Jarvis
  répond bien mais Android ouvre le sélecteur « Terminer l'action avec ». Il
  veut que ça joue directement. COMMENCE PAR CELUI-LÀ : c'est un vrai bug
  qu'il vit, il est entièrement spécifié dans les notes, et la solution est
  déjà arbitrée par lui — la première fois qu'une commande touche une
  catégorie (musique, navigation, messages), Jarvis pose UNE question, retient
  la réponse et ne redemande plus.
  Deux pièges dans les notes, lis-les vraiment : (a) le correctif doit servir
  aux DEUX chemins, la commande locale (commandeLocale.ts) ET le modèle
  (open_app + music_query), avec une seule source de vérité pour « quelle app
  pour la musique » ; (b) la préférence se stocke en base (et si tu passes par
  localStorage, sa clé DOIT être déclarée dans CLES_REGLAGES de
  src/lib/reglages.ts, sinon elle est perdue à la réinstallation, en silence).
- 3f3ad20b (high) — contrôle du téléphone comme s'il était l'utilisateur.
  Raphaël a explicitement ROUVERT ce chantier : ne le referme pas avec
  l'argument « risque de sécurité », il l'a déjà entendu et tranché. Sa
  décision : LISTE NOIRE (autorisé par défaut, interdit sur les apps
  bancaires), pas liste blanche. La majorité de ses exemples est DÉJÀ LIVRÉE
  (ouvrir une app, musique, play/pause, appeler, préparer un WhatsApp ou un
  SMS, alarme, itinéraire). Il ne reste QUE l'action dans l'écran d'une app
  tierce, qui exige un service d'accessibilité Android natif. C'est un
  chantier lourd, à faire d'un bloc — évalue-le et, si tu ne peux pas le
  finir proprement, dis-le et écris l'état, ne le commence pas à moitié.
- b1b6172d, a40fccaa (iOS), f5621562 — les trois sont marqués
  [À CADRER AVEC RAPHAËL AVANT DE COMMENCER]. Ne les code pas.

Périmètre de fichiers qui t'appartient — deux autres sessions travaillent en
parallèle sur « Voix et écoute » et « L'app elle-même » :
  src/lib/actionsTelephone.ts, actionsTelephoneVocales.ts, commandeLocale.ts,
  voiceActions.ts, android/**, capacitor.config.ts,
  supabase/functions/voice-command/**,
  scripts/verifier-commande-locale.ts, verifier-commande-vocale.mjs

Tu es la SEULE session autorisée à toucher voice-command et commandeLocale.ts.
Les deux autres t'enverront leurs demandes d'actions vocales par dev_log
(kind = 'question') : relis dev_log en fin de travail et sers-les si c'est
rapide, sinon réponds-y.

Deux règles de ce dépôt à ne pas contourner :
- voice-command NE SE DÉPLOIE PAS au push. Après toute modification :
    scripts/deployer-fonction.sh voice-command
  (il exige SUPABASE_ACCESS_TOKEN dans l'environnement ; s'il manque, dis-le
  et laisse le déploiement en attente — ne recopie jamais 35 Ko de code dans
  l'outil MCP).
- Jarvis tourne sur Gemini, offre gratuite (décision de Raphaël du 3 sept., à
  ne pas rouvrir). Ne remets pas Anthropic. Tout ce qui est propre à Gemini
  vit dans supabase/functions/_shared/gemini.ts.

Vérifie avec les scripts canoniques :
  node --experimental-strip-types scripts/verifier-commande-locale.ts
  ANON_KEY=... PAUSE_MS=5000 node scripts/verifier-commande-vocale.mjs
  (PAUSE_MS=5000 est obligatoire : le quota gratuit Gemini est de 15 requêtes
  par minute. La clé publique se récupère avec mcp__Supabase__get_publishable_keys.)
Ajoute un cas de contrôle pour la phrase exacte de Raphaël, « mets-moi la
musique Maes la planque », sans le mot « sur » — c'est cette forme-là qui
partait dans le modèle et cassait.

Ton travail touche l'app Android : à la fin, dis explicitement à Raphaël qu'il
doit mettre à jour l'APK (bouton « Mettre à jour » dans Paramètres) pour le
voir sur son téléphone, la CI verte ne suffit pas.

Avant de t'arrêter, même en cours de route : écris ton état dans dev_log ou
dans les notes du chantier, et libère ta réservation.
```

---

## Prompt session C — L'app elle-même

```
Tu prends le thème « L'app elle-même » du cockpit, en entier.

Réserve d'abord, avec le nom de ta branche :
  scripts/sql.sh "select claim_dev_item('7c1677e1-ab02-4683-8bf0-83903a6caf06', '<ta branche>', 180)"

Puis lis les notes complètes :
  scripts/sql.sh "select id, title, notes from dev_items where theme = 'L''app elle-même' and archived_at is null"

Les trois chantiers du thème :
- 7c1677e1 — RÉAFFICHER LA FENÊTRE D'ENVOI DIRECT DE CHANTIER À CLAUDE CODE.
  Commence par là, c'est le seul entièrement codable. Raphaël veut retrouver,
  dans le cockpit, une fenêtre où il écrit ce qu'il faut faire, et il veut
  aussi pouvoir la déclencher à la voix.
  ATTENTION à ne pas inventer un mécanisme qui n'existe pas : il n'y a pas
  d'API pour « pousser » un chantier vers une session Claude Code en cours. Le
  mécanisme réel de ce dépôt, c'est la base : une session lit dev_items et
  dev_log à son démarrage (hook .claude/hooks/session-start.sh). « Envoyer à
  Claude Code » veut donc dire écrire une ligne dans dev_items (et/ou dev_log)
  que la prochaine session lira. Construis ça, et dis-lui honnêtement que
  l'effet est différé jusqu'à la prochaine session — ne lui laisse pas croire
  à un envoi temps réel.
  La partie vocale ne se code PAS chez toi : voice-command et commandeLocale.ts
  appartiennent à la session « Le téléphone ». Écris ta demande dans dev_log
  (kind = 'question', avec le nom de l'action et ses paramètres) et elle
  l'ajoutera. Livre la fenêtre d'abord, elle vaut déjà seule.
- cc6d7a09 — « Augmenter capacité et intelligence de Jarvis ». Ce n'est pas un
  chantier de code : il demande qu'on EXPLORE et qu'on lui PROPOSE des
  solutions déjà matures. Traite-le comme une recherche, et rends-lui une
  fiche (artefact) avec des options cliquables et ta recommandation marquée,
  pas un mur de texte — il lit depuis son téléphone. Contrainte à ne pas
  oublier dans tes propositions : il a décidé le 3 sept. de NE PAS recharger
  de crédit Anthropic et de rester sur l'offre gratuite de Gemini. Son
  argument : « ce n'est pas vraiment de l'IA, c'est plus un assistant qui va
  faire des commandes ». Toute proposition payante doit être présentée comme
  telle, avec son coût, et ne jamais être mise en place sans son accord.
- e90bb0ff — « Améliorer le visuel général », marqué [À CADRER AVEC RAPHAËL].
  Tout ce qu'on a de lui : « plus compact et ergonomique surtout au niveau des
  tâches, et pensée plus smart moins brut ». Ne code pas au hasard : c'est un
  bon candidat à mettre dans la même fiche que cc6d7a09, avec des maquettes ou
  des options visuelles qu'il tranche au pouce.

Périmètre de fichiers qui t'appartient — deux autres sessions travaillent en
parallèle sur « Voix et écoute » et « Le téléphone » :
  src/components/cockpit/**, tasks/**, layout/**, settings/**, ui/**,
  src/hooks/useDevItems.ts, useDevLog.ts, useTasks.ts
  (+ une migration numérotée dans supabase/migrations/ si tu as besoin de DDL)

NE TOUCHE PAS à supabase/functions/voice-command/, src/lib/commandeLocale.ts,
ni aux fichiers d'écoute/dialogue (motCle.ts, dialogueTour.ts, les hooks
useSpeech*) : ils appartiennent aux deux autres sessions.

Si tu publies une fiche (artefact) : déclare la capacité db pour que ses
réponses soient enregistrées côté serveur, et AJOUTE SON URL à la liste des
fiches dans CLAUDE.md, dans le même commit — sinon elle est perdue pour les
sessions suivantes. Avant de lui poser quoi que ce soit, relis les fiches
déjà publiées listées dans CLAUDE.md : il a déjà répondu à beaucoup de choses.

Avant de t'arrêter, même en cours de route : écris ton état dans dev_log ou
dans les notes du chantier, et libère ta réservation.
```

---

## Prompt session D — Messagerie et agenda (débloquée le 3 sept. à 20h05)

Le verrou Google est levé : Raphaël a publié l'application en production et
branché son compte. Vérifié en direct contre l'API Google avec son jeton :
Gmail `200` (r.nabet26@gmail.com, 16 782 messages), Agenda `200`, refresh token
enregistré, portées `gmail.modify` + `calendar.events`.

```
Tu prends le thème « Messagerie et agenda » du cockpit. Il vient d'être débloqué :
Raphaël a publié l'application Google en production et branché son compte le 3 sept.
à 20h05. Vérifié en direct contre l'API Google avec son jeton réel : Gmail 200
(r.nabet26@gmail.com, 16782 messages), Agenda 200, refresh_token enregistré,
portées gmail.modify + calendar.events. Ne lui redemande RIEN sur la configuration
Google, c'est fait.

AVANT TOUT : la branche principale porte des marqueurs de conflit commités. Fais
  git merge origin/claude/resume-sections-chantier-6bahcv
et lis docs/prompts-sessions.md. Après tout pull ou merge :
  grep -rn '^<<<<<<< ' --exclude-dir=node_modules .

Réserve avec le nom de ta branche :
  scripts/sql.sh "select claim_dev_item('ea220515-24d1-4fc4-9483-e596df1250c0', '<ta branche>', 180)"
  scripts/sql.sh "select claim_dev_item('37ffbe6b-4a53-45b0-b758-0af55b48d98d', '<ta branche>', 180)"

Puis lis les notes complètes :
  scripts/sql.sh "select id, title, status, notes from dev_items where theme = 'Messagerie et agenda' and archived_at is null"

- ea220515 (high, in_progress) — GOOGLE AGENDA. Le code est écrit et déployé
  (Edge Function google-calendar avec list/create/update/delete, quatre actions
  vocales dans voice-command, carte Compte Google dans Paramètres). Il n'avait
  jamais pu être essayé sur un vrai compte. COMMENCE PAR LÀ, et par une
  vérification de bout en bout sur SON compte à lui, pas sur l'utilisateur de test :
  lire sa journée, créer un rendez-vous, le modifier, le supprimer. Les heures
  qu'il dicte sont des heures locales (Israël) et doivent le rester. Si tout passe,
  marque le chantier fait et archive-le avec le commit en référence. S'il y a un
  écart, corrige-le : c'est ça, le vrai travail de ce chantier.
  Piège de portée : calendar.events donne accès aux ÉVÉNEMENTS, pas à la liste des
  agendas ni à leur création. Si une action a besoin d'autre chose, il faudra que
  Raphaël reconnecte son compte après ajout de la portée — dis-le-lui plutôt que de
  le découvrir en marche.

- 37ffbe6b (normal) — GMAIL, lecture ET écriture, avec pièces jointes. Tout est à
  construire : il n'existe AUCUNE fonction gmail dans supabase/functions/ (vérifié).
  Ce qu'il veut, dans ses mots : « Lecture et écriture, récupération de documents et
  envoi de fichiers si nécessaire. Si j'ai reçu un mail qui m'intéresse, lui dire de
  me lire ce mail et que moi je lui dise quoi répondre. » Donc le cœur, c'est le
  cycle lire → il dicte → répondre, pas une boîte de réception complète.
  Construis-le sur le modèle de google-calendar : une Edge Function google-gmail à
  côté, qui réutilise _shared/google.ts pour le rafraîchissement du jeton. La portée
  gmail.modify couvre la lecture, l'envoi et les pièces jointes — pas besoin d'une
  portée de plus.
  RÈGLE ABSOLUE : envoyer un mail part vers l'extérieur au nom de Raphaël. Jarvis
  PRÉPARE et lui fait valider à la voix avant l'envoi, jamais d'envoi direct sans
  confirmation — c'est la même règle que pour les messages, et elle n'est pas
  négociable.

- ed32cbcc (high) — WhatsApp, et 4dabe586 (high) — reçus/factures vers finbot.
  Les deux restent [À CADRER AVEC RAPHAËL] : ils dépendent d'un arbitrage WhatsApp
  qu'il n'a pas encore rendu. NE LES CODE PAS. Si tu as fini les deux premiers,
  prépare-lui plutôt une fiche (artefact) sur l'arbitrage WhatsApp : options
  cliquables, ta recommandation marquée, un champ libre.

Fichiers qui t'appartiennent :
  supabase/functions/google-calendar/**, supabase/functions/google-gmail/** (à créer),
  supabase/functions/google-oauth/**, supabase/functions/_shared/google.ts,
  src/lib/googleCalendar.ts, src/hooks/useGoogleAccount.ts,
  supabase/migrations/ (migration numérotée si tu as besoin de DDL)

NE TOUCHE PAS à supabase/functions/voice-command/index.ts : il appartient à la
session « Le téléphone », qui travaille dedans en ce moment. Deux sessions dans ce
fichier = un déploiement qui écrase l'autre, et Jarvis muet. Pour tes nouvelles
actions vocales Gmail, écris ta demande dans dev_log (kind = 'question', avec le nom
de l'action et ses paramètres) et elle l'ajoutera. Les quatre actions AGENDA y sont
déjà, tu n'as rien à demander pour ea220515.

Attention aussi à _shared/google.ts : si tu le modifies, tu changes une dépendance de
voice-command. Annonce-le dans dev_log avant, et garde un diff minimal.

Déploiement — les Edge Functions NE se déploient PAS au push :
  scripts/deployer-fonction.sh google-calendar
  scripts/deployer-fonction.sh google-gmail
Le script conserve le réglage verify_jwt existant : google-oauth DOIT rester ouvert
(verify_jwt false), Google appelle son callback sans jeton et le refermer casserait
la connexion du compte.

Vérifie, et n'annonce rien sans preuve :
  ANON_KEY=... PAUSE_MS=5000 node scripts/verifier-commande-vocale.mjs
Ajoute à ce script les cas Gmail que tu livres, comme les cas agenda y sont déjà.

Avant de t'arrêter : écris ton état dans dev_log, libère tes réservations.
```

## Ce qui reste hors de ces quatre sessions

- **Ce qu'il me signale**, **Mémoire et apprentissage**, **Recherche et veille**
  (11 chantiers) : bloqués sur trois arbitrages que Raphaël n'a pas encore
  rendus dans la fiche « Les 4 verrous » — la voix, WhatsApp, et le moteur de
  recherche web. Deux chantiers du thème « Messagerie et agenda » (WhatsApp et
  reçus/factures) attendent le même arbitrage WhatsApp.

---

## Répartition du 4 sept. (nuit) — après le test en direct de Raphaël

Écrit par la session `claude/cockpit-chantiers-ikfpnq` (Voix et écoute), à
partir de deux sources qu'on n'avait pas avant : la table `journal_ecoute`
(ce que fait vraiment le micro sur son téléphone, APK b74) et les journaux
de `voice-command` (quota Gemini). Trois chantiers nouveaux, trois prompts.
Chacun se colle dans une session neuve.

### Prompt B-bis — Le téléphone : service Google, et la musique qui ne joue pas

```
Tu reprends le thème « Le téléphone ». Deux chantiers, dans cet ordre, et
tous deux prouvés par des données réelles — lis leurs notes en entier :
  scripts/sql.sh "select id, title, notes from dev_items where id in ('bb79f3e4-bf4f-4285-a8f7-bded55c42e85','3de0e08a-9fdb-4ed2-a98c-66678aa39026')"
Réserve-les avec le nom de ta branche (claim_dev_item).

1. bb79f3e4 (high) — PASSER SUR LE SERVICE DE RECONNAISSANCE GOOGLE, en
   natif. La table journal_ecoute montre que chaque phrase de Raphaël enchaîne
   2 à 4 sessions du service Samsung (il coupe à chaque respiration), donc
   une tonalité et ~0,7 s de sourdité au milieu de ses phrases ; en veille, une
   tonalité toutes les ~10 s. Il ne veut plus de la tonalité, et rien côté JS
   ne peut la couper. Le correctif est dans les notes : créer le
   SpeechRecognizer avec le service Google quand il est présent (pas de
   tonalité, DICTATION_MODE respecté), sinon garder le défaut. Ça se fait
   dans le plugin @capacitor-community/speech-recognition (patch-package qui
   s'applique en CI) ou en plugin local dans android/. Écris dans
   journal_ecoute quel service a été choisi (evenement service_reconnaissance)
   pour qu'on le sache sans deviner. Côté JS rien ne change : la veille et la
   commande passent par le même plugin.
2. 3de0e08a (high) — la musique : la question du lecteur marche, Apple Music
   s'ouvre, mais le TITRE demandé ne se lance pas (« mets-moi la musique de
   Booba Dolce Camara », journal du 3 sept. 01:02). Il manque la lecture dans
   l'app choisie : INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH avec le paquet cible,
   ou ce qu'Apple Music Android accepte — vérifie, ne suppose pas.

Périmètre : le tien (android/**, package.json pour patch-package,
commandeLocale.ts, actionsTelephone*.ts, voice-command/**). Tu es la seule
session sur ces fichiers. Après tout pull ou merge :
  grep -rn '^<<<<<<< ' --exclude-dir=node_modules .
Vérifie avec scripts/verifier-commande-locale.ts et, pour la fonction,
ANON_KEY=... PAUSE_MS=5000 node scripts/verifier-commande-vocale.mjs — mais
lis d'abord le chantier 4eaf9c1d (quota) : tant qu'il n'est pas livré, chaque
passage de ce script consomme le quota du jour de Raphaël.
Ton travail touche l'app Android : dis-lui à la fin qu'il doit mettre à jour
l'APK (Paramètres → Mettre à jour). Écris ton état avant de t'arrêter et
libère ta réservation.
```

### Prompt M — Le moteur : quota Gemini et clé de test

```
Tu prends le thème « Cout de fonctionnement » : un seul chantier, prouvé
dans les journaux de voice-command, lis ses notes en entier :
  scripts/sql.sh "select id, title, notes from dev_items where id = '4eaf9c1d-594f-48cd-b49a-ba29d3801e75'"
Réserve-le avec le nom de ta branche.

Le quota JOURNALIER de gemini-3.1-flash-lite (500/jour) est épuisé depuis le
3 sept. 21h28 UTC : il sert à la fois de secours à la commande vocale et de
modèle de la mémoire, et les contrôles lancés par quatre sessions dans la
journée l'ont vidé. Raphaël s'est retrouvé avec « J'ai atteint la limite de
l'offre gratuite » en pleine conversation. Il a dit : ne limitez pas vos
tests, c'est eux qui font avancer le moteur — donc une clé séparée pour eux.

À faire, dans supabase/functions/_shared/gemini.ts, voice-command/index.ts,
voice-command/memoire.ts et scripts/verifier-commande-vocale.mjs (annonce-le
dans dev_log : voice-command appartient à la session « Le téléphone », tu
n'y touches que pour ce chantier) :
(a) secret GEMINI_API_KEY_TEST, utilisé par la fonction quand la requête
    porte la marque du script de vérification (en-tête ou champ du corps) ;
    Raphaël crée cette clé sur un AUTRE projet Google AI Studio (les quotas
    sont par projet) et la dépose dans les variables d'environnement, puis
    scripts/pousser-secret.sh GEMINI_API_KEY_TEST — ne lui demande jamais de
    la coller dans la conversation ;
(b) la mémoire sur un modèle hors de la chaîne de secours, et qui SAUTE en
    silence sur un 429 ;
(c) une chaîne de secours à seaux vraiment distincts (voir les notes), et
    une ligne de journal quand un secours est utilisé ;
(d) le quotaId et la limite journalisés quand un 429 arrive.
Déploie avec scripts/deployer-fonction.sh voice-command, vérifie avec
ANON_KEY=... PAUSE_MS=5000 node scripts/verifier-commande-vocale.mjs.
Jarvis tourne sur Gemini gratuit, décision de Raphaël, ne remets pas
Anthropic. Écris ton état avant de t'arrêter et libère ta réservation.
```

### Prompt E — Apprentissage : l'auto-audit de Jarvis

```
Tu prends le chantier « Auto-audit » du thème « Mémoire et apprentissage »,
demandé par Raphaël le 3 sept. au soir. Lis ses notes en entier, elles
contiennent sa demande ET une proposition de mécanique :
  scripts/sql.sh "select id, title, notes from dev_items where id = '25a58902-c131-4966-b67d-76c3e115af44'"
Réserve-le avec le nom de ta branche.

Ce qu'il veut : que Jarvis détecte ses échecs (par lui-même, ou quand
Raphaël lui dit « tu n'as pas… »), les enregistre dans un secteur dédié, se
corrige par CONTEXTE de requête (pas par phrase), et signale automatiquement
aux sessions Claude Code un rapport pour qu'elles corrigent. Il est ouvert à
une meilleure mécanique que la sienne — mais pas à du code qui se modifie
tout seul à l'exécution : la boucle de ce dépôt, c'est Jarvis constate et
documente, Claude Code corrige, le cockpit relie les deux.

Phase 1, [LIBRE] : table retours (migration numérotée, RLS) alimentée côté
client ; détection des trois signaux (erreur d'action, plainte de Raphaël,
demande identique répétée dans la minute) ; regroupement par contexte
(famille d'action + app + version) ; injection des échecs récents groupés
dans le bloc de démarrage de chaque session (.claude/hooks/session-start.sh)
; création automatique d'un dev_item « auto-généré » par contexte à partir de
deux échecs, avec les transcripts en preuve et le thème déduit de la famille
d'action. Un exemple réel à rejouer pour te calibrer : journal_ecoute du
3 sept. 01:02-01:04 (Israël), la musique Booba.

Périmètre : nouveau src/lib/retours.ts, la migration, le hook de démarrage.
MicButton.tsx appartient à « Voix et écoute » : annonce dans dev_log avant
d'y toucher et fais un diff minimal (un appel après executeVoiceAction).
Ne touche ni à voice-command ni à commandeLocale.ts. Après tout pull ou
merge : grep -rn '^<<<<<<< ' --exclude-dir=node_modules .
Écris ton état avant de t'arrêter et libère ta réservation.
```

## Prompt F — Cadrage : les décisions qui attendent Raphaël (4 sept., après-midi)

Demandé par Raphaël le 4 sept. : « rédige-moi un prompt que je vais
copier-coller dans une autre session, comme ça je le fais à part ». Cette
session ne code rien : elle rassemble tout ce qui est marqué
`[À CADRER AVEC RAPHAËL AVANT DE COMMENCER]` en UNE fiche, attend ses
réponses, et réécrit les chantiers en `[LIBRE]`.

```
Tu prends le CADRAGE : les chantiers marqués [À CADRER AVEC RAPHAËL AVANT DE COMMENCER] dans le cockpit. Tu ne codes RIEN dans cette session. Ton livrable est UNE fiche (artefact) que je remplis au pouce depuis mon téléphone, puis les chantiers réécrits [LIBRE] à partir de mes réponses.

1. Lis l'état du projet injecté au démarrage, puis le détail COMPLET de chaque chantier à cadrer : scripts/sql.sh "select id, title, theme, notes from dev_items where archived_at is null and notes like '[À CADRER%' order by theme". Lis aussi les fiches déjà publiées, listées dans CLAUDE.md (section « Les fiches déjà publiées »), avec l'outil Artifact (action read, puis read_db sur la même URL) : ne me repose AUCUNE question à laquelle j'ai déjà répondu.

2. Regroupe par thème. Pour chaque chantier : ce que je veux (déjà su), ce qui reste réellement à trancher (coût, accès, périmètre, risque), les options avec TA recommandation, et ce que chaque option coûte (temps, argent, permissions sur le téléphone). Si un chantier ne demande en fait aucune décision, dis-le et passe-le [LIBRE] tout de suite, sans me le soumettre.

3. Publie UNE seule fiche (outil Artifact, capacité db, sur le modèle des fiches précédentes) : une carte par décision, options cliquables avec la recommandation marquée, UN champ commentaire ET un bouton photo PAR question (règle non négociable, voir CLAUDE.md), les décisions séparées des actions que je dois faire moi-même. Réponses enregistrées dans le document fiche/cadrage. Ajoute l'URL de la fiche à la liste des fiches dans CLAUDE.md, dans le même commit, sur ta branche puis fusionnée dans claude/new-session-rn6puh comme le font les autres sessions. Donne-moi le lien, puis attends.

4. Quand je te dis « c'est rempli » : relis fiche/cadrage avec read_db, réécris chaque chantier de façon autoportante (mes réponses mot pour mot, ce qui est écarté pour qu'on ne le repropose pas, les fichiers concernés, le marqueur [LIBRE] ou [REPORTÉ PAR RAPHAËL]), et écris dans dev_log ce que tu as fait. Ne commence PAS à coder : d'autres sessions prendront les chantiers, un thème chacune.

Ne touche pas à : src/components/voice/MicButton.tsx, src/lib/live/**, src/hooks/useSpeechRecognition.ts, supabase/functions/live-jeton/**, scripts/harness/**, scripts/verifier-ecoute-web.mjs : la session Voix et écoute (claude/cockpit-chantiers-ikfpnq) y travaille.
```
