# Historique — Vérifications du dépôt, Gmail, noms de fichiers

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

## Un nom de fichier n'est PAS une clé de stockage (15 sept. 2026)

Chantier `020cb823`. Sa capture : l'onglet Docs en rouge, « Aucun document. »
en dessous, et ce message tel quel —

    Invalid key: 8bb3be37-…/טופס 18 פופי יוגה 162437_260915_בעמ.pdf

`useDocuments` posait le nom du fichier DIRECTEMENT dans la clé de l'objet
Supabase Storage. Storage valide cette clé, et son alphabet est étroit.

**MESURÉ CONTRE SON VRAI PROJET, pas lu dans une documentation** — un POST par
caractère sur `storage/v1/object/documents`, le 15 sept. :

    ACCEPTÉS : ! * ' & $ @ ; : + , ? = ( ) - . _ (espace) et A-Z a-z 0-9
    REFUSÉS  : ~ ^ % " < > | \ ` { } # [ ]  — et tout non-ASCII.

**L'HÉBREU N'ÉTAIT QUE LA MOITIÉ VISIBLE, et c'est le point à retenir** :
« facture été.pdf » et « reçu.pdf » rendaient 400 eux aussi. Il vit entre le
français et l'hébreu. Ne réduis pas `src/lib/nomDocument.ts` à « le support de
l'hébreu » — le jour où quelqu'un le simplifie sur cette lecture, les accents
recassent.

**Pourquoi on n'assainit pas bêtement.** Remplacer l'interdit par « _ » tenait
en une ligne — et son document se serait appelé
« ____ 18 ____ ____ 162437_260915____.pdf ». Un nom de document sert à le
RETROUVER ; le perdre en l'enregistrant est une autre façon de ne pas
l'importer. D'où un échappement réversible `=uXXXX`, `=` étant accepté par
Storage (mesuré).

**Le marqueur est `=u`, et les deux caractères comptent.** Avec `=` seul,
l'ancienne clé « budget=2026.pdf » — un nom parfaitement ordinaire — se serait
affichée « budget….pdf » : `2026` est de l'hexadécimal valide, U+2026 étant les
points de suspension. On aurait réparé l'import en abîmant l'affichage de ce
qui était déjà là. **C'est un contrôle qui l'a trouvé**, pas l'usage.

**Un nom déjà ASCII traverse INCHANGÉ** : les documents d'avant ce correctif
gardent leur clé, il n'y a rien à migrer. Un contrôle garde ce cas — s'il
tombe, toute la bibliothèque existante devient introuvable.

Les **trois** chemins d'écriture y passent (l'import à l'écran,
`saveTextDocument` et `saveBinaryDocument` de la voix) : un seul oublié, et le
défaut revient par la porte de derrière. Le téléchargement pose
`{ download: nomLisible(...) }` sur l'URL signée — sans quoi le fichier
enregistré sur le téléphone porterait la clé échappée et serait introuvable
hors de Jarvis. Et `messageEchecImport` fait que « Invalid key » ne lui est
**plus jamais** renvoyé : la phrase dit que le défaut vient de Jarvis, pas de
son fichier, sinon il renomme ses documents pour rien.

### Le banc de l'écran recopiait ce qu'il devait vérifier

`ligneDeDocument()` (dans `nomDocument.ts`) convertit une ligne de Storage en
ligne de la liste, et **`useDocuments` comme le banc d'essai appellent la
même**. Tant qu'elle était recopiée des deux côtés, casser la conversion dans
le hook laissait `verifier-documents-web.mjs` VERT — essayé à l'envers le
15 sept., c'est le piège du contrôle qui vérifie sa propre paraphrase, déjà
payé par le sélecteur Playwright, `Filesystem.mkdir` et `com.google.android.as`.
Maintenant cinq contrôles rougissent.

Pour cela, `JarvisDataContext` est **exporté** : le banc monte la VRAIE
`DocumentsPage` avec un `documentsState` fabriqué, au lieu d'en recopier une
version qui finirait par dire autre chose que l'écran. Rien d'autre ne doit le
consommer directement — `useJarvisData()` reste le chemin de l'application.

Ce que le banc voit et qu'aucun contrôle pur ne peut voir : un nom hébreu
s'écrit de droite à gauche, et mêlé à des chiffres et à une extension latine il
passe par l'algorithme bidirectionnel du navigateur, dans une ligne `truncate`
à côté de deux boutons. Le module pur prouve que le nom revient intact ; seul
un vrai moteur de rendu dit s'il TIENT sur 390 points de large.

**Vérifié bout en bout contre son Storage** : son nom brut → 400 « Invalid
key », la clé échappée → 200, et la liste redonne exactement son nom. Les
objets d'essai ont été supprimés. **Non constaté sur son téléphone** : c'est à
lui d'importer pour de vrai le PDF de sa capture. C'est du `src/`, la mise à
jour rapide suffit.

## Les vérifications du dépôt

Une seule méthode canonique par sujet, à relancer plutôt qu'à réinventer :

```bash
ANON_KEY=... node scripts/verifier-commande-vocale.mjs   # la Edge Function déployée
ANON_KEY=... node scripts/verifier-donnees.mjs           # temps réel + réglages, RLS comprise
node --experimental-strip-types scripts/verifier-dialogue.ts   # tours de parole, sans réseau
node --experimental-strip-types scripts/verifier-mot-cle.ts    # réveil « Jarvis », sans réseau
node --experimental-strip-types scripts/verifier-prechauffage.ts  # espacement du préchauffage de la connexion Live, sans réseau
node --experimental-strip-types scripts/verifier-ouverture-live.ts  # l'ordre des trois étapes d'une ouverture Live : le micro en même temps que la connexion, jamais avant le jeton, sans réseau
node --experimental-strip-types scripts/verifier-reprise-live.ts  # une fermeture Live subie rouvre la conversation, une panne installée ne boucle pas, sans réseau
ANON_KEY=... node scripts/verifier-live-reprise.mjs      # une conversation Live rouverte avec la poignée se souvient de ce qui a été dit (live-jeton déployé)
node --experimental-strip-types scripts/verifier-phrase-mise-a-jour.ts  # « modifie la tâche » : Jarvis dit la NOUVELLE valeur, pas l'ancien titre, sans réseau
node --experimental-strip-types scripts/verifier-reponse-illisible.ts  # le mode Live ne montre jamais de charabia (<ctrl46>…) et ne reste pas bloqué dessus, sans réseau
node --experimental-strip-types scripts/verifier-decalage-transcription.ts  # « tout est en décalage » : la mesure du retard de la transcription Live rend null quand on n'a rien su, jamais zéro, sans réseau
node --experimental-strip-types scripts/verifier-commande-locale.ts  # commandes comprises sans modèle
node --experimental-strip-types scripts/verifier-documents.ts    # un lien dicté ou partagé : l'adresse, le nom du fichier, sans réseau
node --experimental-strip-types scripts/verifier-nom-document.ts  # un nom de fichier hébreu ou accentué devient une clé que Storage accepte, et se relit, sans réseau
node scripts/verifier-ecoute-web.mjs                     # moteur d'écoute + banc du cœur (vrai MicButton), vrai navigateur
node --experimental-strip-types scripts/verifier-live-croise.ts  # la veille se tait quand Live tourne dans l'AUTRE fenêtre (ProtectedShell/AssistantOverlayPage), sans réseau
node --experimental-strip-types scripts/verifier-fin-conversation.ts  # « terminé » ferme le Live, « termine le chantier » non
node --experimental-strip-types scripts/verifier-envoi-chantier.ts  # « Envoyer à Claude Code », sans réseau
node --experimental-strip-types scripts/verifier-echeance.ts    # l'étiquette d'échéance d'une tâche, sans réseau
node --experimental-strip-types scripts/verifier-etat-direct.ts  # « les tâches ne s'affichent pas en live » : ce qu'on dit, et surtout ce qu'on ne dit pas, sans réseau
node --experimental-strip-types scripts/verifier-action-suggeree.ts  # le bouton « Appeler » d'un rappel, et surtout ce qu'il ne propose pas, sans réseau
node --experimental-strip-types scripts/verifier-theme.ts       # pas deux thèmes pour le même sujet, sans réseau
node --experimental-strip-types scripts/verifier-dedoublonnage.ts   # la mémoire ne réécrit pas trois fois la même chose, sans réseau
node --experimental-strip-types scripts/verifier-corrections.ts   # ce que Raphaël reprend arrive au modèle, et rien d'autre, sans réseau
node --experimental-strip-types scripts/verifier-moteur.ts        # quel fournisseur, quel modèle, quels seaux de quota — vrai répartiteur, fetch en doublure
node --experimental-strip-types scripts/verifier-consommation.ts   # ce qu'on lui dit de sa consommation, et ce qu'on ne lui dit pas, sans réseau
node --experimental-strip-types scripts/verifier-moteur-actif.ts  # quel moteur Jarvis annonce à voix haute, mesuré et pas deviné, sans réseau
node --experimental-strip-types scripts/verifier-veille-modele.ts # on ne change pas de modèle à la légère, sans réseau
npx tsc -p supabase/functions/tsconfig.json                      # le code des Edge Functions se tient (aucun Deno requis)
node --experimental-strip-types scripts/verifier-pannes-silencieuses.ts  # une panne de la mémoire ne se lit pas comme une absence, sans réseau
node --experimental-strip-types scripts/verifier-retours.ts       # Jarvis constate ses échecs, et se tait le reste du temps, sans réseau
node --experimental-strip-types scripts/verifier-contexte-interaction.ts  # l'écran affiché et le dernier bouton touché, dans journal_ecoute et jarvis_erreurs, sans réseau
ANON_KEY=... node scripts/verifier-memoire.mjs           # la mémoire de bout en bout : dédoublonnage réel + retrouver une conversation
node scripts/verifier-memoire-web.mjs                    # « Vos conversations » parcourue dans un vrai navigateur, en écran de téléphone
node --experimental-strip-types scripts/verifier-notifications.ts   # ce que Jarvis fera sonner, et quand, sans réseau
node --experimental-strip-types scripts/verifier-question-posee.ts  # Jarvis répond à la question posée ; l'app et le serveur disent la même chose, sans réseau
node --experimental-strip-types scripts/verifier-maj-web.ts      # la mise à jour rapide : paquet, chemins, verdict, sans réseau
node --experimental-strip-types scripts/verifier-telechargement-apk.ts  # télécharger l'APK : aucun chemin ne peut rester muet, sans réseau
node --experimental-strip-types scripts/verifier-reglages.ts     # toute préférence est déclarée ET réglable, sans réseau
node --experimental-strip-types scripts/verifier-autorisations.ts  # un bouton « Autoriser » n'est jamais mort, sans réseau
node --experimental-strip-types scripts/verifier-musique.ts       # « je lance » n'est dit que si ça joue vraiment, sans réseau
node --experimental-strip-types scripts/verifier-doublon-vocal.ts  # dicter deux fois ne crée pas deux chantiers, sans réseau
node --experimental-strip-types scripts/verifier-ou-va-cette-dictee.ts  # tâche ou chantier : la supposition dite, et la correction d'un mot, sans réseau
node --experimental-strip-types scripts/verifier-tache-date-categorie.ts  # « pour quand ? » complète la même tâche, la catégorie suggérée attend sa validation, sans réseau
node --experimental-strip-types scripts/verifier-chantier-en-attente.ts  # un chantier créé à la voix : la section et le titre se proposent, ne s'appliquent jamais seuls, sans réseau
node --experimental-strip-types scripts/verifier-titre-tache.ts  # le titre d'une tâche est ce qu'il y a à faire, et surtout ce qui ne doit PAS être touché, sans réseau
node --experimental-strip-types scripts/verifier-seconde-demande.ts  # une phrase à deux demandes rend la main au serveur, et ses vrais titres à « et » n'y tombent pas, sans réseau
node --experimental-strip-types scripts/verifier-reprise-dictee.ts  # redire une dictée coupée complète la même tâche au lieu d'en créer une seconde, sans réseau
node --experimental-strip-types scripts/verifier-fenetre-annulation.ts  # le temps d'arrêter une commande mal entendue, sans réseau
node --experimental-strip-types scripts/verifier-confirmation-envoi.ts  # « vas-y » après un message préparé devient un clic, pas un second brouillon, sans réseau
node --experimental-strip-types scripts/verifier-correction-message.ts  # corriger ou relire un message WhatsApp/SMS préparé, à la voix — et le silence sur un autre domaine (tâche, chantier…), sans réseau
node --experimental-strip-types scripts/verifier-message-annonce.ts  # quand et quoi Jarvis annonce d'un message programmé — PAS de notification, et le silence en conversation, sans réseau
node --experimental-strip-types scripts/verifier-bulle.ts        # la bulle flottante : état réel, service déclaré, sans réseau
node --experimental-strip-types scripts/verifier-ecran.ts        # appuyer sur l'écran d'une autre app : et surtout ne RIEN toucher quand on n'est pas sûr, sans réseau
node --experimental-strip-types scripts/verifier-apps-ia.ts      # les IA déjà installées : mises en avant sans jamais limiter, sans réseau
node --experimental-strip-types scripts/verifier-apps-par-defaut.ts  # les applications proposées sont celles du téléphone, sans réseau
node --experimental-strip-types scripts/verifier-trouver-application.ts  # « ouvre l'application WhatsApp » ouvre WhatsApp, jamais מכבי, sans réseau
node --experimental-strip-types scripts/verifier-memoire-de-travail.ts  # ce qu'on vient de se dire part avec la phrase, et rien de vieux, sans réseau
node --experimental-strip-types scripts/verifier-capacites-voix.ts  # « mets-toi à jour », « quoi de neuf », le quota, « coupe le point du matin » — et ce qui n'en est pas, sans réseau
scripts/essayer-consigne.sh memoire-de-travail           # la consigne sur le disque contre le VRAI modèle (clé de test), sans déployer ni compte
scripts/essayer-consigne.sh memoire-extraction           # la mémoire ne réécrit pas ce qu'elle sait, ni une erreur de dictée qui le contredit
scripts/essayer-consigne.sh reglages                     # un réglage en phrase libre devient set_setting côté serveur, jamais « je ne peux pas »
scripts/essayer-consigne.sh widget                       # le widget porte toutes ses tâches quand il le demande ; le témoin (--temoin) rabattait « dix » sur cinq
scripts/essayer-consigne.sh tache-en-attente             # « non mets-le dans la catégor » vise la tâche QUI ATTEND — plusieurs tours, et un témoin, parce qu'un échec unique ne dit pas s'il est causé ou s'il varie
scripts/essayer-consigne-live.sh reglages                # en Live, une demande de réglage part à l'outil (vraie session Google, clé de test)
node --experimental-strip-types scripts/verifier-assistant.ts     # Jarvis choisissable comme assistant du téléphone, sans réseau
node --experimental-strip-types scripts/verifier-honnetete.ts     # « préparé » ne devient jamais « envoyé », et Jarvis sait à quoi il est branché, sans réseau
node scripts/verifier-autorisations-web.mjs              # l'écran des autorisations dans un vrai navigateur, en écran de téléphone
node --experimental-strip-types scripts/verifier-sections.ts    # groupement, ordre, compteurs et filtre du cockpit, sans réseau
SUPABASE_SERVICE_ROLE_KEY=... node scripts/verifier-cockpit-marqueurs.mjs  # un chantier livré dont le crochet d'en-tête dit encore [LIBRE] : à relancer avant de dire à Raphaël que le cockpit est propre
node --experimental-strip-types scripts/verifier-themes-non-declares.ts  # un thème sans section se signale, jamais tout seul, sans réseau
node --experimental-strip-types scripts/verifier-suggestion-theme.ts  # la section suggérée à la saisie, sans réseau
node --experimental-strip-types scripts/verifier-navigation-parametres.ts  # une cible résolue vers UNE section de Paramètres, jamais une mauvaise, sans réseau
node --experimental-strip-types scripts/verifier-onglets-app.ts  # « ouvre le cockpit » change d'onglet — et « ouvre WhatsApp », l'itinéraire, « lis mes notes » ne bougent pas, sans réseau
node --experimental-strip-types scripts/verifier-widget-taches.ts  # le widget de tâches DÉFILE : la décision pure, et tout le câblage Android qui échoue en silence, sans réseau
node --experimental-strip-types scripts/verifier-categorie-inventee.ts  # le serveur ne range jamais une tâche dans une catégorie qu'il n'a pas prononcée — et surtout, il ne touche pas à un rangement JUSTE, sans réseau
node --experimental-strip-types scripts/verifier-doublon-chantier.ts  # « ça existe déjà » : la redite et le déjà-livré, sans réseau
node --experimental-strip-types scripts/verifier-doublons-existants.ts  # les doublons déjà en base, et surtout le silence quand il n'y en a pas
node --experimental-strip-types scripts/verifier-tache-ou-chantier.ts  # une tâche perso qui est en fait un chantier — et le silence sur les chantiers de maçonnerie
node --experimental-strip-types scripts/verifier-archive-taches.ts  # une tâche cochée va dans l'archive de sa catégorie, et rien ne se perd entre les deux, sans réseau
node --experimental-strip-types scripts/verifier-coupure-reseau.ts  # une coupure de connexion ne s'annonce jamais comme une réponse du serveur, et « Réessayer » ne part jamais tout seul, sans réseau
node --experimental-strip-types scripts/verifier-bouton-maj.ts  # on ne propose JAMAIS une mise à jour quand il n'y en a pas, et un téléchargement figé ne dure pas dix minutes, sans réseau
node --experimental-strip-types scripts/verifier-depuis-derniere-visite.ts  # ce qui a bougé pendant son absence, et le repère « déjà vu », sans réseau
ANON_KEY=... node scripts/verifier-visite-cockpit.mjs    # le repère « déjà vu » suit son compte : non-recul côté SQL et cloisonnement RLS
node --experimental-strip-types scripts/verifier-file-en-attente.ts   # une tâche dictée hors réseau ne se perd pas et ne se dédouble pas, sans réseau
node --experimental-strip-types scripts/verifier-sessions-autonomes.ts  # une session autonome se retire quand il le faut, sans réseau
node --experimental-strip-types scripts/verifier-historique-chantier.ts  # une note complétée n'est pas une note écrasée, sans réseau
node --experimental-strip-types scripts/verifier-fil-journal.ts  # reprendre une discussion au journal, et dire ce qu'on ne montre pas, sans réseau
node --experimental-strip-types scripts/verifier-derniere-maj.ts  # un chantier déplié montre sa dernière mise à jour d'abord, jamais le marqueur ni une entrée du milieu, sans réseau
node --experimental-strip-types scripts/verifier-notes-vocales.ts  # ses notes à la voix — et surtout « note ça », « note un rappel », « note de frais » qui n'en sont pas, sans réseau
node --experimental-strip-types scripts/verifier-constat-chantier.ts  # « Ça marche / Ça ne marche pas » sur un chantier livré : le crochet d'en-tête change, rien ne se perd, sans réseau
ANON_KEY=... node scripts/verifier-constat-reel.mjs      # sa réponse sur un chantier livré : trois écritures d'un bloc, annulation, RLS, « ce qui marche »
ANON_KEY=... node scripts/verifier-historique-reel.mjs   # un chantier garde ce qu'on y a écrit : trigger, restauration tracée, RLS
node scripts/verifier-cockpit-web.mjs                    # le cockpit parcouru dans un vrai navigateur, en écran de téléphone
scripts/verifier-cockpit-reel.mjs                        # le même, sur ses VRAIES données (lit la base ; pas dans la CI)
node scripts/verifier-taches-web.mjs                     # la corbeille d'une tâche demande avant de supprimer, vrai navigateur
node scripts/verifier-notes-web.mjs                      # l'onglet Notes : créer/modifier/supprimer avec confirmation/chercher, vrai navigateur
node scripts/verifier-programmes-web.mjs                 # l'écran Programmé : à qui il partira, choisir le contact, « pas parti », annuler avec confirmation, vrai navigateur
node --experimental-strip-types scripts/verifier-destinataire-programme.ts  # un message programmé : destinataire vérifié dans le répertoire en le dictant, jamais « ce contact », sans réseau
node scripts/verifier-documents-web.mjs                  # l'onglet Docs : un nom hébreu ou accentué s'affiche et tient sur un écran de téléphone, vrai navigateur
node scripts/verifier-ios-web.mjs                        # le site dans un vrai moteur WEBKIT à la taille d'un iPhone : rendu, zones tactiles, contrat « sur l'écran d'accueil »
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

### Transmettre un reçu retrouvé au contact désigné (chantier 4dabe586)

La seconde moitié du titre du chantier, restée hors du périmètre
« Messagerie » depuis le 7/8 sept. 2026 (propriété du contrôle du téléphone,
`3f3ad20b`) : `find_receipts` ne pouvait QUE lister les reçus, jamais les
transmettre — Jarvis le disait lui-même dans sa réponse (« je ne peux pas
encore te les transmettre moi-même »). Livrée le 17 sept. par une session
avec Raphaël en ligne, dans le thème « Messagerie et agenda ».

Nouvelle action serveur `transmettre_recu` (`mail_cible` pour désigner LEQUEL
message — mêmes mots que `read_email` : « le dernier », « la facture
d'électricité » — et les mêmes champs destinataire que `send_message` :
`contact_id`/`contact_name`/`phone_number`/`message_channel`). Côté client
(`voiceActions.ts`), elle résout le message (`retrouverMessage`, déjà utilisé
par `read_email`), lit ses pièces jointes (`gmail.lireMessage`), récupère la
première via `recupererPieceJointe` — **l'action serveur `piece_jointe`
existait déjà, déployée depuis le 3 sept., mais n'était appelée depuis aucun
chemin de la voix** —, et délègue le partage à
`transmettreFichier()` (`actionsTelephoneVocales.ts`).

**Un fichier trouvé sur Gmail n'est pas sur le téléphone : il faut l'y
écrire avant de le partager.** `transmettreFichier` écrit le base64 reçu dans
le cache de l'app (`@capacitor/filesystem`, `Directory.Cache`, même outil que
`majWeb.ts` pour un paquet téléchargé — chemin `partage/<nom>`, couvert par
le `<cache-path path="." />` déjà déclaré dans `file_paths.xml`), obtient son
chemin natif (`Filesystem.getUri`), puis appelle le nouveau plugin
`ActionsTelephone.partagerFichier` (`ActionsTelephonePlugin.java`) : un
`FileProvider.getUriForFile` (même motif que `ApkDownloaderPlugin` pour
installer une APK) et un `Intent.ACTION_SEND` avec `EXTRA_STREAM`.

**Même règle que `preparerWhatsApp`/`preparerSms` : ça PRÉPARE, ça n'envoie
jamais tout seul.** Et une limite honnête, pas contournée : **il n'existe
aucun intent public pour cibler UNE conversation précise avec une pièce
jointe**, contrairement au texte seul (`send_message` avec un numéro connu
ouvre directement la bonne conversation via le lien wa.me). Avec un `paquet`
visé (WhatsApp ou WhatsApp Business, résolu par `quelWhatsApp()` comme pour
`send_message`), l'application affiche son PROPRE écran de destinataire ;
sans lui (SMS, ou aucune préférence claire), le sélecteur Android habituel.
Le nom du destinataire désigné dans la phrase sert à le NOMMER dans la
réponse (« Je prépare le reçu pour Dan sur WhatsApp, choisis-le et appuie sur
envoyer »), pas à viser techniquement sa conversation — ne le présente jamais
comme si Jarvis avait choisi le destinataire à sa place.

**Le serveur retire un `find_receipts` qui accompagne un `transmettre_recu`**
(`voice-command/recuTransmis.ts`, 24 sept. 2026, v125). Mesuré avec la vraie
consigne : le modèle rendait la liste PUIS la transmission 3 fois sur 4,
malgré « jamais confondu avec find_receipts » en toutes lettres. Le téléphone
retrouve le reçu seul par `mail_cible` : la liste ne faisait que lire à voix
haute ce qu'il n'avait pas demandé. « Retrouve mes reçus » seul reste une
liste — `verifier-gmail-voix.ts` garde les deux.

**Touche `android/**` : une nouvelle APK est nécessaire**, la mise à jour
rapide ne porte pas un nouveau plugin natif. **Non constaté sur un vrai
compte Gmail** (pas de compte de test dans cet environnement, jeton Google
expiré depuis le 8 sept. selon `verifier-gmail.mjs`) : le chantier reste
ouvert jusqu'à ce que Raphaël confirme que « transmets ce reçu à … » ouvre
bien WhatsApp avec le bon fichier attaché.

### Les messages programmés (`messages_programmes`, migration 0017)

La table ne sait pas envoyer, et ne doit jamais le savoir : décision de Raphaël
du 3 sept., on reste sur le téléphone et rien ne part sans qu'il appuie. D'où
`statut`, où **« annoncé » est distinct de « envoyé »** — un message que Jarvis
a présenté sans réponse ne doit pas disparaître de sa liste comme s'il était
parti. `canal` reste `null` tant qu'il n'a pas dit WhatsApp ou SMS.
Client : `src/lib/messagesProgrammes.ts`.

### L'écran « Programmé » : voir et modifier à la main (chantier 0c0193e3, 18 sept. 2026)

Sa demande, mot pour mot, le jour où il a accepté que les messages programmés
partent désormais tout seuls sans validation vocale au moment de l'envoi
(voir la note du chantier `ed32cbcc` pour cette décision-là, hors périmètre
ici) : « le top du top, ça serait qu'il y ait une section
programmation/automatisation dans Jarvis même, comme ça je peux voir tout ce
qui est programmé, et si nécessaire je peux le modifier à la main. »

Nouvel onglet **Programmé** (`src/pages/ProgrammesPage.tsx`,
`useMessagesProgrammesListe`), qui **AFFICHE ET MODIFIE les données, il
n'exécute rien** — ni clic, ni ouverture de WhatsApp : c'est le rôle du
chantier `ed32cbcc`, pas de celui-ci. TOUS les statuts s'affichent (prévu,
annoncé, envoyé, annulé), triés par heure prévue — à la différence de
`listerMessagesProgrammes()` appelée sans argument par la voix, qui ne veut
que ce qui reste à traiter (d'où `TOUS_LES_STATUTS`, exporté pour cet écran
précisément).

**Modifier remet TOUJOURS le message à « prévu »**, y compris depuis
« annoncé » : `modifierMessage()` (nouvelle fonction générique dans
`messagesProgrammes.ts`, dont `reprogrammerMessage`/`modifierTexte` ne sont
plus que de fins wrappers — même logique, pas dupliquée) efface l'annonce en
même temps. Ce que Jarvis annoncerait a changé sous ses pieds ; une ancienne
annonce ne veut plus rien dire. **Un message déjà « envoyé » ou « annulé » ne
propose ni modifier ni annuler** : ce sont des états définitifs, pas
rattrapables à la main.

Annuler passe par `ConfirmerAction`, comme partout dans l'app, en nommant le
destinataire et l'heure. Réutilise le même mécanisme temps réel que
tasks/notes/dev_items : migration `0052_realtime_messages_programmes.sql`
(REPLICA IDENTITY FULL + publication) — `messages_programmes` existait depuis
la migration 0017 mais n'avait jamais été ajoutée au canal Realtime, personne
n'ayant eu besoin jusqu'ici de la regarder en direct depuis un écran.

Vérifié dans un vrai navigateur, écran de téléphone :
`node scripts/verifier-programmes-web.mjs` (banc `scripts/harness/programmes.tsx`,
qui monte la VRAIE `ProgrammesPage` depuis le 23 sept. — voir plus bas).

### Le destinataire d'un message programmé : vérifié en le dictant (chantier a122a936, 23 sept. 2026)

Ses mots : « améliorer la gestion des contacts lors de la programmation de
messages, en s'assurant que le contact WhatsApp programmé soit visible et
garanti ». MESURÉ le 22 sept. à 10h44 : « Programme un message à envoyer à
Harry locataire bureau sur WhatsApp pour 18h… » a été enregistré avec pour
destinataire **« ce contact »** — le nom n'était pas arrivé, et
`schedule_message` comblait en silence (`nom ?? "ce contact"`) avant de
répondre « C'est noté ». Sa tentative de correction à la voix a ensuite fini
sur « Cannot read properties of undefined (reading 'trim') » (`momentLocal`
sans date). Et à 18h le message n'est jamais parti (app fermée) : il est
resté « Prévu » le lendemain.

`src/lib/destinataireProgramme.ts` (**pur**, `verifier-destinataire-programme.ts`)
porte les deux règles :

1. **On ne comble jamais un destinataire manquant.** Le message est gardé
   (texte et heure coûtent le plus à redicter), `destinataire` vide, et
   Jarvis le DIT. `nomDit` reprend un nom que le modèle aurait rangé dans
   `contact_id`. Un « ce contact » déjà en base se lit comme manquant.
2. **Le répertoire tranche AU MOMENT DE PROGRAMMER.** Trouvé : `contact_nom`
   et `telephone` (migration 0056) sont gardés, Jarvis NOMME le contact exact,
   et c'est ce numéro qui sert à l'heure dite (`MicButton` passe
   `phone_number`) — on ne redevine pas. Homonymes, introuvable, accès refusé :
   dit, avec les noms, et « choisis-le dans l'onglet Programmé ».

L'écran « Programmé » montre à qui il partira (✓ nom + numéro ENTIER, « Contact
à vérifier », ou « Destinataire manquant »), « Pas parti — heure passée » pour
un message resté prévu au-delà de la marge d'annonce (`messageManque`,
`MARGE_ANNONCE_MS`), et le dialogue de modification cherche dans le
répertoire tout seul à l'ouverture : il n'a qu'à toucher le bon contact.

**Trouvé en faisant ce chantier, et corrigé à la source** : `chercherContact`
rapportait les mots communs au nom le PLUS LONG — « Harry » valait 50 pour
« Harry Cohen » et 33 pour « Harry Locataire Bureau », sous le seuil. Le
second disparaissait, et « écris à Harry » partait chez Harry Cohen sans une
question. Désormais les contacts qui contiennent TOUT ce qu'il a dit passent
d'abord : un seul → trouvé ; plusieurs → on demande ; un nom dit en entier
l'emporte. Ça vaut pour les appels et les messages immédiats aussi
(`verifier-contact-repertoire.ts`).

**Le banc de l'écran monte la VRAIE page** (`scripts/harness/programmes.tsx`,
comme celui des documents) avec un faux répertoire injecté par la prop
`lireContacts` de `ProgrammesPage` — il en recopiait le balisage avant.

**Pas couvert, et ce n'est pas un oubli** : modifier un message programmé À
LA VOIX (le modèle ne voit pas la liste, par conception — ed32cbcc) ; et la
langue demandée (« en hébreu ») est dans la consigne du serveur, en ligne
depuis le 23 sept. (chantier 2e40a764).
