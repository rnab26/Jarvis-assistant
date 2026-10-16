# Historique — Moteur Gemini, mode Live, honnêteté et pannes

Déplacé tel quel de `CLAUDE.md` le 16 oct. 2026 (économie de jetons : ~90 000 jetons chargés dans chaque session). Rien n'est supprimé : ce sont les dates, causes mesurées, numéros de migration, chantiers et limites. Les règles à appliquer restent résumées dans `CLAUDE.md` ; ce fichier se lit à la demande, quand on touche au sujet.

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

## Une coupure de connexion n'est PAS une réponse du serveur (15 sept. 2026)

Sa capture : « Jarvis : Le serveur vocal a répondu : Failed to send a request
to the Edge Function », après une dictée de 43 secondes.

**Les deux moitiés de cette phrase étaient fausses, et c'est mesuré, pas
supposé.** Journaux Supabase du même instant : `POST | 200 |
.../voice-command` à **10:50:42.027**, alors que l'app avait rendu la main à
**10:50:41.717** après **2985 ms** (`journal_ecoute`). Le serveur n'a jamais
répondu ça — il a répondu 200, 310 ms trop tard pour le téléphone. La phrase
accusait donc quelque chose qu'elle n'avait pas constaté : exactement ce que
`honnetete.ts` interdit au modèle, appliqué cette fois à notre propre code.

**La cause est mécanique.** `FunctionsFetchError` (supabase-js, levé quand le
`fetch` lui-même est rejeté) n'a PAS de `context` : `corpsDeLErreur` rend une
chaîne vide, aucun cas de `traduireErreurServeur` ne reconnaissait le message
anglais, et le dernier recours le relayait tel quel sous « Le serveur vocal a
répondu : … ».

**Fréquence, pour ne pas surestimer le défaut** : 1 échec sur 27 réponses
modèle enregistrées depuis le 8 sept. Ce n'est ni un plafond de quota ni une
panne serveur — c'est sa 4G, et le message le dit maintenant.

Trois points à ne pas défaire :

1. **On ne dit pas « ça n'est pas parti ».** Ce serait faux ce jour-là. Du
   téléphone, on ne PEUT pas savoir si le serveur a reçu et exécuté : la
   phrase dit « je ne sais pas si ta demande est passée ». La moitié de
   `verifier-coupure-reseau.ts` vérifie ce qu'on ne dit PAS.
2. **AUCUN renvoi automatique.** Le serveur avait exécuté : un retry aveugle
   aurait tout fait deux fois — deux chantiers, deux messages, deux alarmes.
   Le bouton « Réessayer sans redicter » renvoie la phrase EXACTE
   (`phraseARejouer`, gardée à part de `lastUserText` qui bouge à chaque
   partiel), et c'est Raphaël qui décide. Un contrôle compte les appels à
   `rejouerLaPhrase()` : deux, la définition et le `onClick`, pas trois.
3. **Le registre fait DEUX lignes**, pas une : « La connexion a coupé avant la
   réponse du serveur vocal » et « Le serveur vocal a refusé de répondre ». Une
   panne de 4G et un moteur qui refuse ne se corrigent pas du même côté ;
   les fondre sur une seule empreinte rendrait le compteur illisible.

### Le micro est enfin MESURÉ (même chantier)

Sa remarque du même jour : « le temps de préparation du micro est toujours
très long, c'est jamais instantané […] je parle dans le vide le temps que ça
s'initialise ». **Rien ne le mesurait** : `journal_ecoute` disait la durée du
tour et le nombre de partiels, jamais QUAND le premier est arrivé.

`commande_fin` porte donc deux nombres de plus, et il faut les deux pour
désigner un coupable : **`ms_ouverture`** (appui → `start()` résolu : notre
chemin plus le démarrage du service Android) et **`ms_premier_mot`**
(ouverture → premier résultat partiel : ce que le service met à entendre).
Petit puis gros = c'est Android ; gros puis petit = c'est nous.

C'est la même méthode que pour la latence Live (`ms_jeton`), et la même
consigne : **ne recode rien avant d'avoir lu ces nombres-là.** Trois causes
supposées y avaient été écartées d'un coup par la mesure.

```sql
select at, detail->>'ms_ouverture' as ouverture, detail->>'ms_premier_mot' as premier_mot,
       detail->>'partiels' as partiels, detail->>'sessions' as sessions, detail->>'duree_ms' as duree
from journal_ecoute where evenement = 'commande_fin' order by at desc limit 20;
```

`null` et pas `0` quand ça n'a pas eu lieu : zéro se lirait comme
« instantané », c'est-à-dire le contraire de ce qui s'est passé. Et c'est la
PREMIÈRE ouverture qui est mesurée — la boucle relance une session à chaque
silence, la dernière dirait le temps d'une relance.

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

## Le moteur : Gemini, offre gratuite — et pourquoi

Décision de Raphaël du 3 sept. 2026, à ne pas rouvrir : Jarvis tournait sur
Claude via l'API Anthropic, facturée au jeton, et il l'a découvert en voyant
sa clé à sec. Il a choisi l'offre gratuite de l'API Gemini, en connaissance
du compromis (Google se réserve d'utiliser les contenus de l'offre gratuite
pour améliorer ses produits, relecture humaine comprise). Les options
écartées : Haiku 4.5 (moitié prix, privé), rester sur Sonnet 5.

### Changer de moteur est un SECRET à poser, plus une réécriture (6 sept. 2026)

Chantier `2c54c62f`. Sa crainte, le 3 sept. : « il va bien falloir qu'on trouve
une solution stable », après avoir tout reperdu une fois. **Le constat, lui,
est rassurant et il faut le lui redire plutôt que le reconstruire : rien de ce
qui fait Jarvis ne vit dans le modèle.** La consigne, le schéma d'outil, la
mémoire, ses réglages, ses corrections sont dans notre code et dans la base ;
rien n'est entraîné ni affiné. Changer de moteur ne peut rien lui faire perdre.

`supabase/functions/_shared/modele.ts` porte l'interface commune et le SEUL
endroit qui décide quel moteur répond. `gemini.ts` et `anthropic.ts` sont deux
implémentations derrière elle. `index.ts` et `memoire.ts` appellent
`appelerModele()` et demandent un **RÔLE** (`commande` / `memoire`), jamais un
nom de modèle.

Trois secrets, et plus une ligne de code à toucher :

| Secret | Ce qu'il fait |
| --- | --- |
| `FOURNISSEUR` | `gemini` (défaut) ou `anthropic` |
| `GEMINI_MODELE`, `GEMINI_MODELE_MEMOIRE` | le modèle de chaque rôle |
| `GEMINI_SECOURS`, `GEMINI_SECOURS_MEMOIRE` | ses secours, séparés par des virgules |

**`GEMINI_SECOURS` est la sortie du chantier `0edec0c4`** : les secours étaient
écrits en dur, donc en changer demandait un redéploiement — c'est-à-dire
attendre, pendant que Jarvis se tait. Ils se posent maintenant à chaud.

Quatre choses à ne pas défaire :

1. **Rien ne bascule TOUT SEUL vers un moteur payant.** `Fournisseur.gratuit`
   existe pour ça : Raphaël a quitté l'API Anthropic en découvrant sa clé à
   sec, sans avoir jamais choisi de payer. Une clé Anthropic présente ne suffit
   pas — il faut qu'il pose `FOURNISSEUR=anthropic` lui-même. Ni un secours, ni
   la promotion automatique du chantier `66a7a233` ne doivent franchir ça.
2. **Un seul fournisseur est chargé par appel**, celui qui sert. Charger les
   deux ferait dépendre Jarvis d'un moteur qu'il n'utilise pas : un import
   cassé côté Anthropic tuerait la commande vocale alors que Gemini répondait.
3. **La commande et la mémoire ne partagent JAMAIS un modèle.** C'est le rôle
   qui porte cette séparation. Un troisième appelant qui demanderait
   « commande » pour autre chose referait l'erreur du 3 sept.
4. **Les phrases d'erreur ne nomment aucun fournisseur** (« le moteur », jamais
   « Gemini ») : sinon une bascule obligerait à republier l'app pour rester
   vraie, et elle mentirait entre les deux. Elles sont alignées **mot pour
   mot** avec `src/lib/erreurServeurVocal.ts` — `scripts/verifier-moteur.ts`
   refuse qu'elles divergent, à une exception près qu'il nomme lui-même.

**Le mode Live reste Gemini, quel que soit `FOURNISSEUR`** : `live-jeton` mint
un jeton pour l'API Gemini Live, qui est un produit Google sans équivalent
ailleurs dans notre pile. Ce n'est pas un oubli.

`scripts/verifier-moteur.ts` (dans la CI, sans réseau) ne lit pas le code : il
remplace `Deno` et `fetch` par des doublures et fait tourner le VRAI
répartiteur. Un contrôle qui chercherait des mots dans un fichier resterait
vert le jour où la bascule cesse de marcher.

### « Combien il me reste, et à combien de temps de discussion » (6 sept. 2026)

Chantier `5ac4d12c`, dicté le 5 sept. : « savoir combien il me reste de crédit
et à combien de temps de discussion ça équivaut, et le noter constamment ».

**Il n'y a pas de solde, et il ne faut pas en inventer un.** Jarvis tourne sur
l'offre GRATUITE : ce qui existe, ce sont des plafonds en requêtes par minute
et par jour, comptés par modèle et par projet — et ils ne sont publiés nulle
part. Ils ne se lisent que dans le corps d'un 429, donc une fois dépassés. Un
pourcentage inventé serait pire que pas de chiffre : il se lit comme une
mesure, et il s'est déjà retrouvé sans Jarvis deux fois alors que tout avait
l'air normal.

Trois pièces, et la frontière compte :

- Migration `0025_appels_modele.sql` — la table `appels_modele`,
  `noter_appel_modele()` et `etat_consommation()`. **Avant ça il n'y avait
  rien à afficher** : la consommation n'existait que dans les journaux de la
  fonction, qui ne se lisent pas depuis son téléphone, ne se totalisent pas et
  s'effacent.
- `_shared/modele.ts` écrit une ligne par modèle ESSAYÉ, pas seulement par
  celui qui répond — sinon un secours sollicité tous les jours reste invisible.
  Sans `await`, erreurs avalées : une comptabilité ne doit jamais faire échouer
  la commande qu'elle compte.
- `src/lib/consommationModele.ts` — **pur**, vérifié par
  `scripts/verifier-consommation.ts`. C'est lui qui décide quoi dire.

Quatre choses à ne pas défaire :

1. **Les appels de vérification (`essai`) ne comptent pas comme ses phrases.**
   Une passe de `verifier-commande-vocale.mjs` en afficherait quarante qu'il
   n'a jamais dites, et le chiffre ne voudrait plus rien dire le jour où il
   compte dessus. La mémoire non plus : chaque phrase déclenche DEUX appels.
2. **Le RANG du modèle (0 = principal) est écrit par le SERVEUR.** Le principal
   se règle par le secret `GEMINI_MODELE`, que l'app ne peut pas lire :
   comparer des noms de modèles côté app donnerait une page fausse en silence
   le jour du changement — c'est-à-dire le jour où il faut savoir qu'on tourne
   sur un secours.
3. **On annonce un PLANCHER prouvé, jamais un plafond supposé.**
   `PLAFONDS_MESURES` ne contient que ce qu'on a vu, avec sa date ; un modèle
   absent le dit (« jamais mesuré »). Et `verifier-moteur.ts` refuse qu'un
   modèle entre en service sans avoir été mesuré.
4. **Un refus par MINUTE n'alerte pas.** C'est le fonctionnement normal quand
   il enchaîne vite, ça se lève en soixante secondes, et un bandeau qui
   s'allume tous les jours n'est plus lu — c'est la panne qu'on ne verra pas.
   Seuls le quota du JOUR, le passage sur un secours et une latence au-delà de
   8 s le dérangent.

L'écran est `src/components/settings/Consommation.tsx` (Paramètres › Le
cockpit).

### « Quel moteur tournes-tu, en ce moment ? » (17 sept. 2026)

Chantier `920ff758`. Sa demande : pouvoir demander à voix haute quel moteur de
langue tourne — MÊME en mode automatique de bascule (la veille ci-dessous) —
pour identifier le plus performant.

**L'app ne peut pas le savoir elle-même**, exactement pour la raison écrite
juste au-dessus : le modèle principal se règle par le secret `GEMINI_MODELE`,
et ce que la veille automatique a promu vit dans `moteur_choisi` — deux choses
que l'app ne voit jamais.

**Et lire `moteur_choisi` ou le secret directement aurait été la mauvaise
réponse** : ça dit ce qui DEVRAIT répondre, pas ce qui répond RÉELLEMENT — le
problème que `resumerConsommation` a déjà résolu pour le cockpit deux sections
plus haut. `supabase/functions/_shared/moteurActif.ts` applique donc la MÊME
règle (« le modèle qui a le plus répondu à ses phrases de commande, pas celui
qui a le plus été essayé »), mesurée sur `appels_modele`, et rend un bloc de
contexte — pas une nouvelle action — que voice-command joint à chaque phrase,
comme `branchements.ts`.

**Deux copies de la même règle, assumées** : une Edge Function ne peut pas
importer `src/`, donc la sélection du « gagnant » vit à la fois dans
`resumerConsommation` (cockpit) et dans `moteurActif.ts` (voix). Même stratégie
que `destinataire.ts` / `journalDestinataire.ts` : `scripts/verifier-moteur-actif.ts`
fait tourner les deux sur les mêmes cas et refuse qu'elles divergent.

**Silencieux quand rien n'a encore été mesuré** (une base neuve, un compte de
test) : pas de repli sur une configuration devinée, jamais un nom inventé —
c'est le seul cas où Jarvis ne pourra pas répondre à cette question.

**« Expliquer toutes les fonctionnalités développées »**, la seconde moitié de
sa demande, n'avait rien à coder : `_shared/environnement.ts` (déjà importée
par voice-command ET live-jeton) fait déjà ça — « Réponds avec ça […] ou ce que
tu sais faire » — et décrit jusqu'à la carte « Le moteur de langue » de
Paramètres › Le cockpit.

### La veille des modèles : passer tout seul au meilleur (6 sept. 2026)

Chantier `66a7a233`. Ses mots du 5 sept. : « s'il y a des mises à jour qui sont
faites pour quelque chose de plus évolué, évidemment qu'il faut que nous aussi
on fasse les mises à jour automatiques en interne sans que forcément je puisse
le demander à chaque fois manuellement. » Et sa limite du même soir : « il ne
faut pas changer les voix tout seul » — **ceci ne concerne QUE le modèle de
langue**, jamais la reconnaissance vocale ni la voix de synthèse.

- Migration `0026_veille_modeles.sql` — `moteur_choisi` (ce qui tourne, avec de
  quoi revenir en arrière), `essais_modele` (ce que chaque essai réel a donné,
  par jour), `veilles_modele` (les passes, y compris celles qui ne font rien).
- `_shared/veilleModele.ts` — **la décision, pure**, vérifiée par
  `scripts/verifier-veille-modele.ts`.
- `_shared/controlesModele.ts` — six phrases dont la bonne réponse ne se
  discute pas. C'est un ÉCHANTILLON, pas la vraie consigne de 26 000
  caractères : la recopier ferait une seconde source de vérité.
- `supabase/functions/moteur-veille/` — la passe. **Déployée.**
- Paramètres › Le cockpit › Le moteur de langue (`jarvis_moteur_auto`).

**Ce que ce mécanisme REFUSE compte plus que ce qu'il accepte**, et rien de
tout ça ne doit être assoupli sans refaire la mesure :

1. **Deux jours DIFFÉRENTS de réussite.** Une seule bonne nuit ne prouve rien :
   les trois modèles morts le 4 sept. répondaient parfaitement la veille.
2. **Répondre n'est pas obéir** : un modèle qui n'appelle pas l'outil, ou qui
   rate un seul contrôle, est écarté.
3. **Plafond journalier ≥ 200 et plafond/minute ≥ 10.** Un modèle à 20 par
   jour a tué la mémoire en silence ; un modèle à 5 par minute
   (`gemini-3-flash-preview`, mesuré) ne tient pas une rafale.
4. **Jamais un modèle de la mémoire**, ni un moteur PAYANT, ni par-dessus un
   secret posé à la main.
5. **Sept jours de repos** entre deux promotions.
6. **On ne promeut pas tant qu'on ne sait pas observer le résultat** : sous
   20 appels réels vus sur sept jours, le retour arrière automatique serait
   aveugle. C'est une précondition qui se garde toute seule — elle reste vraie
   tant que `voice-command` n'écrit pas dans `appels_modele`.
7. **Le retour arrière passe AVANT la promotion**, et zéro appel ne veut pas
   dire que tout va bien : ça veut dire qu'on ne sait rien.

**Pas de pg_cron ni de pg_net, et c'est une décision** : les installer donnerait
à sa base la capacité d'appeler l'extérieur, ce qui est un choix de sécurité
qui lui appartient. La passe est donc réveillée **paresseusement** après une
phrase, comme `purger_echanges` — au plus une fois par fenêtre de six heures et
par instance, sans `await`, jamais depuis un appel de vérification, jamais
après un échec du moteur. `moteur-veille` est écrite pour pouvoir être appelée
pour rien : c'est elle qui répond « trop tôt ».

Pour la voir travailler sans attendre :

```bash
curl -sS -X POST https://bexiyvmdbxcwxasgslxp.supabase.co/functions/v1/moteur-veille \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" -d '{}'
scripts/sql.sh "select verdict, detail, demarre_at from veilles_modele order by demarre_at desc limit 5"
```

### Le code des Edge Functions est enfin typechecké (6 sept. 2026)

Jusque-là, **rien** ne vérifiait `supabase/functions/**` : ni la CI (`npx tsc
-b` ne couvre que `src` et `scripts/harness`), ni les sessions (pas de Deno
installé dans l'environnement). Une faute de frappe dans `voice-command` ne se
voyait donc qu'après déploiement — chez Raphaël, sous la forme d'un Jarvis
muet.

```bash
npx tsc -p supabase/functions/tsconfig.json
```

`supabase/functions/deno.d.ts` donne à `tsc` le minimum qui lui manque : le
global `Deno`, et les spécificateurs `jsr:` / `npm:`. Les bibliothèques
externes y sont volontairement typées large — on ne vérifie pas le SDK de
Google, on vérifie que nos fichiers se tiennent entre eux. **Lance-le avant de
pousser quoi que ce soit sous `supabase/functions/`.**

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

Les cinq seaux en place, chacun essayé pour de vrai avant d'être écrit
(`_shared/gemini.ts` porte le détail des mesures) : commande — principal
`gemini-3.1-flash-lite`, secours `gemini-3.1-flash-lite-preview` puis
`gemini-3-flash-preview` ; mémoire — principal `gemini-3.5-flash-lite`,
secours `gemini-3.7-flash`. La mémoire ne touche JAMAIS aux modèles de la
commande : c'est ce qui a rendu Jarvis muet le 3 sept.

**Les secours de la commande ont changé le 6 sept.** (chantier `0edec0c4`), et
la raison est double : `gemini-3.5-flash` et `gemini-3.6-flash` étaient
plafonnés à 20 requêtes par jour chacun — le filet valait 40 phrases — et
surtout, remesurés ce jour-là, ils répondaient en **13,8 s et 22,2 s** alors
que **l'app abandonne à 25 s**. Un secours à 22 s ne sauve rien. Les
remplaçants répondent en 1 à 2 s, et `gemini-3.1-flash-lite-preview` a encaissé
41 appels dans la journée sans plafond journalier.

**Le piège qu'il faut refaire à chaque fois qu'on change un secours** : deux
modèles peuvent partager un compteur sans que leur nom le dise. On le prouve
en saturant la MINUTE de l'un puis en appelant l'autre dans la foulée — s'il
répond, les seaux sont distincts. Fait le 6 sept. pour
`gemini-3.1-flash-lite-preview` face au principal (932 ms juste après quatre
refus « PerMinute »). Sans ça, un « preview » du même numéro aurait très bien
pu ne servir à rien.

**Deux plafonds différents se cachent derrière le même 429 :**
`GenerateRequestsPerMinutePerProjectPerModel` se lève tout seul en une minute,
`…PerDay…` laisse Jarvis muet jusqu'au lendemain. Lis toujours le `quotaId`.
Et la limite/minute varie énormément d'un modèle à l'autre : 15 pour
`gemini-3.1-flash-lite-preview`, **5** pour `gemini-3-flash-preview` — un
modèle à 5/minute ne tient pas une rafale, il ne peut être que dernier
recours.

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

Et dans `_shared/modele.ts` (il vivait dans `gemini.ts` avant le 6 sept.),
`STATUTS_CHANGER_DE_MODELE` vaut **404, 429, 503, 529** — quatre façons de dire
« ce modèle-là ne répond pas », toutes réglées en passant au suivant, jamais en
insistant. Le 503 y a été ajouté le 4 sept. : on rejouait trois fois le modèle
saturé puis on abandonnait sans jamais essayer les secours, qui eux
répondaient. Le 529 est le « overloaded » d'Anthropic.

Le **0** de `STATUTS_A_REESSAYER` n'est pas un statut HTTP : c'est notre code
pour une coupure réseau, passagère par nature. L'oublier ferait abandonner
Jarvis au premier hoquet de connexion, sans que rien ne le dise — un contrôle
de `verifier-moteur.ts` garde ce cas.

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
- **« Terminé » tait le mot-clé quelques secondes, plutôt que de laisser la
  veille réclamer le micro aussitôt.** Sa demande du 7 sept. 2026, verbatim :
  « quand je dis jarvis terminé, le micro reste activé […] ça me bloque le
  micro sur plein d'autres choses. » Mesuré dans `journal_ecoute` le jour
  même : quatre rafales de veille en douze secondes juste après un
  `live_fin` volontaire, le service de reconnaissance par défaut (non-Google,
  cause déjà établie plus bas) échouant en 37-41 ms à chaque fois et
  redémarrant presque aussitôt — c'est ce qu'il voyait comme « le micro reste
  allumé ». `src/lib/veille.ts` (`REFROIDISSEMENT_APRES_FIN_MS`,
  `enRefroidissement`) fait taire la boucle de veille pendant 8 s après une
  fermeture volontaire (`onEtat("fermee", …, parRaphael)` dans
  `sessionLive.ts`, vrai pour la voix ET l'appui). **Un appui sur le cœur
  reste obéi tout de suite, refroidissement ou pas** — seul le mot-clé se
  tait, exactement comme `majEnCours`. Non vérifiable ici en conditions
  réelles (pas d'appareil) ; `verifier-dialogue.ts` couvre la fonction pure.

**Piège du build local** : sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`,
`src/lib/supabase.ts` lève au chargement et le bundler jette TOUTE l'app comme
code mort — le bundle fait 258 ko et ne contient rien. Pour un vrai build
local : `VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=x npx vite build`.
La CI a les vraies valeurs. Et le typecheck qui compte est celui de la CI,
`npx tsc -b` (les projets référencés, dont `tsconfig.app.json`) — un
`npx tsc --noEmit` à la racine ne vérifie PAS l'app et dit « OK » à tort
(constaté le 4 sept. : CI rouge sur une erreur qu'il n'avait pas vue).

## Le modèle Live parle à l'INFINITIF, le téléphone attendait l'impératif (23 sept. 2026)

Mesuré sur ses 160 vraies commandes Live : le modèle reformule avant de
passer la phrase à l'outil, presque toujours à l'infinitif (« Ouvrir
WhatsApp », « supprimer la tâche … », « appeler Mel ma femme »). Toutes les
règles de `commandeLocale.ts` attendaient l'impératif : ces phrases partaient
au serveur, soit plusieurs secondes de plus en Live (le modèle Live réfléchit
~1,5 s, puis l'outil, puis il reparle), et une panne quand Google sature.
`imperatifDeTete` ne touche que le PREMIER mot, et seulement s'il est dans sa
liste.

**La mesure a surtout montré des résultats locaux FAUX, anciens**, qui lui
imposaient des retouches : un LIEU nommé (« Ajouter au cockpit dev : … »,
« créer la tâche X dans la section Prélèvements », « Noter dans le journal de
bord ») devenait une tâche titrée « Journal de bord… » ou « Dans les tâches
administratives », la catégorie perdue — il part maintenant au serveur ;
« créer un nouveau chantier » devenait une tâche ; « appelle X sur WhatsApp »
cherchait un contact nommé « X sur WhatsApp » (→ `call_channel`) ;
« reprends le contexte… » relançait la musique. **Mesure de référence**, à
refaire avant de toucher une règle : sur les 409 dictées, comparer
`interpreterLocalement` avant/après ET relire chaque résultat qui change — un
compte de phrases « comprises » ne dit rien de ce qui est compris de travers.

**Et côté serveur, les six lectures du contexte partent ensemble**
(`voice-command/index.ts`, `Promise.all`) : elles s'additionnaient à chaque
phrase alors qu'aucune ne dépend d'une autre.
