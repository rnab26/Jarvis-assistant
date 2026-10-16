# Historique — Mises à jour de l'app Android (paquet web, APK)

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

## Ne plus avoir à cliquer « Installer sans analyser » à chaque mise à jour

Chantier `0847b38f`, 7 sept. 2026. Ses mots, le 6 sept. : « j'en ai marre
d'avoir à cliquer sur installer sans analyser à chaque mise à jour. »
Aujourd'hui l'installation passait par un intent `ACTION_VIEW` : Android la
traite comme une installation manuelle venue d'une source inconnue, d'où
Play Protect ET l'écran de confirmation, à chaque fois.

**Le chemin qui l'évite** : `PackageInstaller` en mode SESSION, avec
`setRequireUserAction(SessionParams.USER_ACTION_NOT_REQUIRED)` (API 31+, lu
dans la doc Android, pas supposé). Cette option ne supprime la fenêtre QUE
si l'app est déjà son propre « installer of record » pour ce paquet ET
possède `REQUEST_INSTALL_PACKAGES` (déjà en place). **La toute première
installation par cette voie redemandera donc encore confirmation** — c'est
elle qui fait de Jarvis son propre installer, une fois pour toutes.

- `ApkDownloaderPlugin.lancerInstallation` tente `installerSansFenetre`
  d'abord (SDK 31+ uniquement), et se rabat sur l'ancien intent
  `ACTION_VIEW` sur toute exception ou en dessous de l'API 31 : jamais de
  bouton mort si PackageInstaller refuse pour une raison quelconque.
- `ApkInstallReceiver` (déclaré non exporté dans le manifeste) reçoit le
  résultat du `commit()`. **`STATUS_PENDING_USER_ACTION` doit être traité
  dans TOUS les cas**, y compris avec `USER_ACTION_NOT_REQUIRED` posé : sans
  ce relais, la confirmation de la toute première installation ne
  s'afficherait jamais, et la mise à jour resterait bloquée en silence.
- **Le `PendingIntent` du commit doit être `FLAG_MUTABLE`** : depuis
  Android 12, un `PendingIntent` immuable empêche le système d'y ajouter
  `EXTRA_STATUS` avant de le diffuser, et le commit échoue en silence —
  comportement documenté par Android, pas une hypothèse.
- Condition vérifiée avant d'écrire une ligne de code, comme demandé par la
  note du chantier : le keystore de debug est **fixe et committé**
  (`android/keystore/debug.keystore`), pas régénéré à chaque run de CI —
  sinon la signature changerait à chaque build et rien de tout ça ne
  marcherait, ni l'installation silencieuse ni même une mise à jour
  ordinaire.

`scripts/verifier-telechargement-apk.ts` (déjà dans la CI) tient les
contrôles, essayés à l'envers (retirer `FLAG_MUTABLE` fait rougir le contrôle
correspondant, remis en place immédiatement après).

**Non vérifiable ici** (pas de SDK Android) : le comportement réel du
`commit()` sur un appareil. La CI prouve que ça compile, pas que ça
s'installe sans fenêtre — à confirmer par Raphaël après une installation
manuelle de cette version (qui redemandera encore confirmation UNE fois),
puis la suivante devrait passer sans rien demander.

## Ne JAMAIS proposer une mise à jour quand il n'y en a pas (15 sept. 2026)

Sa capture, où il entoure les deux ensemble : un bouton NOIR « Mettre à jour »
collé au badge « À jour ». Ses mots : « ya confusion car ca propose de mettre
la version a jour alors que cest deja a jour ».

**Vérifié côté GitHub au même instant, pas supposé** : la release
`latest-debug` était `build: 281 / commit: 26e43f5`, exactement ce qu'il
faisait tourner, et `26e43f5` était le dernier commit de la branche. **Il n'y
avait rien à installer.** Il a appuyé — c'est la seule chose raisonnable
devant un bouton plein — et téléchargé 11,1 Mo d'APK sur sa 4G pour rien.

**La cause, lue dans le code** : la mise à jour rapide n'est possible que
lorsqu'une version ATTEND (`useMajWeb` ne calcule `verdict` que si
`status === "update-available"`). Dès qu'on est à jour, la condition
retombait donc sur la branche « APK » et affichait son bouton en action
PRINCIPALE. Le badge disait vrai, le bouton disait le contraire, à deux
centimètres l'un de l'autre.

`src/lib/boutonMaj.ts` est **pur** et porte la seule décision qui compte :
`principal` n'est vrai **que** quand une version attend vraiment. À jour, le
bouton devient discret et s'appelle « Réinstaller l'application » — il dit ce
qu'il FAIT, au lieu de promettre une nouveauté qui n'existe pas —, avec une
phrase qui explique pourquoi il est encore là. Pendant la vérification et
quand GitHub est injoignable : **aucune action proposée**, on ne devine pas
une réinstallation de 11 Mo.

**Le banc de l'écran mesure ce cas** (`verifier-reglages-web.mjs`, « à jour :
aucun bouton ne propose de mettre à jour »), essayé à l'envers : remettre
l'ancien comportement le fait rougir avec le libellé trouvé. Attention, le
banc fabriquait un état impossible en vrai (`verdict.possible` alors que
`status` vaut `up-to-date`) — la décision reste juste dans les deux cas, et
c'est le but d'un module pur.

### Un téléchargement FIGÉ n'est pas un téléchargement lent (même jour)

Capture précédente du même jour : « 1% · 0.1 / 11.1 Mo », bouton grisé, plus
rien ne bouge. **Le garde-fou du 6 sept. ne pouvait PAS se déclencher** : il
testait `recus <= 0`, et 0,1 Mo était déjà arrivé. Une fois le premier octet
passé, plus aucune sortie de secours avant les **dix minutes** de
`TIMEOUT_MS` — c'est-à-dire exactement la panne muette qu'on croyait avoir
corrigée, d'un cran plus loin.

Ce qui compte n'est donc pas le NIVEAU du compteur, c'est qu'il **BOUGE** :
`DELAI_SANS_PROGRES_MS` (20 s sans un octet de plus, quel que soit le niveau)
bascule sur le téléchargement direct. **La PAUSE d'Android est exclue de ce
garde-fou**, et c'est voulu : Android l'annonce avec sa raison, l'écran le
dit, et reprendre par-dessus doublerait le téléchargement au lieu de le
sauver.

**Et un téléchargement s'ARRÊTE** (`annuler()`, drapeau `volatile` relu dans
la boucle de suivi ET dans le repli, qui tourne sur son propre fil ; remis à
faux à chaque départ, sinon un arrêt demandé la fois d'avant tuerait le
suivant avant qu'il commence). Sans ça, la seule sortie était d'attendre dix
minutes ou de tuer l'application.

Faute de SDK Android ici, `verifier-bouton-maj.ts` LIT le code — et vise la
CONDITION et l'APPEL, jamais la présence du mot. Essayé à l'envers : remettre
`recus <= 0`, retirer l'exclusion de la pause ou l'annulation du repli fait
rougir trois contrôles.

**Ça touche `android/` : il lui faut une vraie APK pour en profiter.** Le
reste (le bouton, les versions dépliées, « Arrêter ») est du `src/` et arrive
par la mise à jour rapide.

### Et les trois versions se voient sans déplier quand elles divergent

« Y'a plus de voyant rouge pour savoir si on n'est pas à jour. » Le bloc
« Versions » ne s'ouvrait que si `status === "update-available"` ; il s'ouvre
maintenant aussi dès que l'APK installée n'a pas le même numéro que la
dernière publiée. Ce n'est pas forcément un problème — une mise à jour rapide
suffit tant que le natif n'a pas changé — mais c'est la seule façon de
répondre à « pourquoi il me redemande une mise à jour alors que je viens d'en
faire une » sans avoir à deviner.

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
