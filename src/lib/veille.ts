/**
 * La veille : quand Jarvis a le droit d'écouter sans qu'on lui ait rien
 * demandé, et quoi faire de ce qu'il entend.
 *
 * Pourquoi ce module existe (test en direct du 3 sept.) : le mot-clé était
 * activé, et la boucle qui écoute « Jarvis » tournait dès que l'app était
 * montée — y compris l'app derrière une autre. Android refuse le micro à une
 * app qui n'est pas au premier plan : chaque rafale échouait et repartait
 * 150 ms plus tard. C'est le micro que Raphaël voyait s'allumer et
 * s'éteindre pendant qu'il dictait à un AUTRE assistant. Une écoute non
 * voulue, pas un inconfort.
 *
 * Deuxième défaut du même tonneau : quand une rafale se terminait, la boucle
 * remettait l'état au repos SANS regarder si, entre-temps, un appui sur le
 * cœur avait pris la main. Le tour en cours se voyait écrasé, et une seconde
 * reconnaissance partait par-dessus la première.
 *
 * Volontairement pur : ni horloge, ni micro, ni React. Vérifié par
 * `node --experimental-strip-types scripts/verifier-dialogue.ts`.
 */

// Import relatif avec extension, comme commandeLocale.ts : ce module doit
// tourner sous Node sans bundler (scripts/verifier-dialogue.ts).
import { chercherMotCle } from "./motCle.ts"

export type StatutVoix = "idle" | "wake-listening" | "listening" | "processing" | "speaking" | "error"

/**
 * Entre deux rafales qui n'ont RIEN raté (une vraie écoute qui vient de finir
 * normalement) : Android refuse un redémarrage immédiat du service.
 *
 * VALEUR REVUE le 16 sept. 2026 (chantier 3840996e) : 150 ms, choisi pour le
 * service par défaut d'Android, s'est mesuré INSUFFISANT pour
 * com.google.android.as (Android System Intelligence, en service chez
 * Raphaël depuis le 8 sept.). Sur la version qui venait de corriger le recul
 * des refus consécutifs (delaiApresOccupe), 13 des 43 collisions (30 %)
 * suivaient une rafale qui s'était terminée NORMALEMENT — donc passaient par
 * CE délai, pas par le recul des échecs. Monté à 400 ms : encore net pour une
 * conversation (le silence court, `silenceCourtMs`, tourne autour de 1,5 s),
 * mais laisse près de trois fois plus de temps au service pour relâcher le
 * micro.
 *
 * NON PROUVÉ QUE ÇA SUFFISE : 7 des 43 collisions suivaient une rafale
 * MUETTE, dont le recul est déjà ≥ 1 s (voir `delaiAvantRafaleSuivante`) — un
 * délai bien plus long que celui-ci collisait donc déjà par moments. Si le
 * rapport service+occupé/total ne baisse pas nettement après ce changement,
 * la piste à creuser n'est plus un délai JS mais le temps réel qu'Android met
 * à relâcher com.google.android.as, qui semble variable et parfois > 1 s.
 */
export const RESPIRATION_MS = 400

/** Après un démarrage refusé (service encore occupé) : lui laisser le temps
 * de se libérer, plutôt que de le harceler et de faire clignoter le micro. */
export const RECUL_APRES_ECHEC_MS = 700

/**
 * Après un « terminé » (à la voix ou d'un appui), la veille se tait un
 * moment avant de recommencer à guetter « Jarvis ».
 *
 * Sa demande du 7 sept. 2026 : « quand je dis jarvis terminé, le micro reste
 * activé […] ça me bloque le micro sur plein d'autres choses. » Mesuré dans
 * journal_ecoute le même jour à 09h00 : quatre rafales de veille en douze
 * secondes, juste après une conversation Live close volontairement — le
 * service de reconnaissance par défaut (non-Google, cause déjà établie dans
 * 6b33ee97) échouait en 37-41 ms à chaque fois, redémarrant presque aussitôt.
 * Un « terminé » dit qu'il n'a plus besoin de Jarvis MAINTENANT : le mot-clé
 * n'a donc pas à réclamer le micro dans la seconde qui suit.
 *
 * Ça ne touche QUE le mot-clé. Un appui sur le cœur reste obéi tout de suite,
 * pendant le refroidissement comme en dehors — exactement comme majEnCours.
 */
export const REFROIDISSEMENT_APRES_FIN_MS = 8000

/**
 * La veille n'écoute que si tout est réuni : le réglage est activé, l'app
 * est réellement à l'écran, et rien d'autre ne se sert du micro.
 *
 * « error » compte comme un repos : sans ça, la moindre erreur tuait la
 * veille pour de bon (déjà signalé une fois, ne pas y revenir).
 */
export function peutEcouterEnVeille(p: {
  actif: boolean
  visible: boolean
  statut: StatutVoix
  /**
   * Une mise à jour est en train de s'installer.
   *
   * Sa demande du 6 sept. 2026, capture à l'appui : la fenêtre d'installation
   * d'Android s'ouvrait PAR-DESSUS un « Conversation en cours — parle,
   * coupe-moi si tu veux ». Ses mots : « stopper Jarvis de s'activer
   * directement UNIQUEMENT s'il y a des mises à jour auto qui se lancent dès
   * le lancement de l'app. »
   *
   * « Uniquement » : on suspend la VEILLE, c'est-à-dire ce que Jarvis
   * déclenche tout seul. Un appui volontaire sur le cœur pendant une mise à
   * jour reste obéi — il ne passe pas par ici.
   *
   * Optionnel, et faux par défaut : les appelants qui ne savent rien des
   * mises à jour (le banc d'essai, la fenêtre de l'appui long) gardent
   * exactement le comportement d'avant.
   */
  majEnCours?: boolean
  /**
   * Une conversation Live tourne dans L'AUTRE fenêtre (ProtectedShell et
   * AssistantOverlayPage sont deux BridgeActivity distinctes, donc deux tas
   * JS distincts — `statut` ne voit que la conversation de SA PROPRE
   * fenêtre). Mesuré dans journal_ecoute (chantier 2a5b7802) : sans cette
   * garde, la veille de la fenêtre qui ne parle pas continue de réclamer le
   * micro toutes les ~7-8 s pendant toute la durée d'une conversation Live
   * ouverte ailleurs — les activations/désactivations intempestives
   * signalées.
   *
   * Optionnel, faux par défaut : un appelant qui ne sait pas lire le
   * drapeau natif (le banc d'essai) garde le comportement d'avant.
   */
  liveAilleurs?: boolean
}): boolean {
  if (!p.actif || !p.visible) return false
  if (p.majEnCours) return false
  if (p.liveAilleurs) return false
  return p.statut === "idle" || p.statut === "error"
}

/**
 * Vrai tant que le refroidissement après un « terminé » n'est pas écoulé.
 *
 * `maintenant` et `jusqua` sont deux horodatages en millisecondes (Date.now()
 * côté appelant) : ce module reste pur, il ne lit jamais l'horloge lui-même.
 * `jusqua` à 0 (aucun « terminé » encore vu) n'est jamais dans le futur.
 */
export function enRefroidissement(maintenant: number, jusqua: number): boolean {
  return maintenant < jusqua
}

export type SuiteRafale =
  /** Quelqu'un a pris la main pendant la rafale : ne toucher à rien. */
  | "laisser"
  /** « Jarvis, ajoute une tâche » : la demande est déjà là, on la traite. */
  | "conversation"
  /** « Jarvis » seul : on ouvre le micro et on le dit. */
  | "oui"
  /** Rien, ou une phrase qui ne nous était pas adressée : on reste au repos. */
  | "repos"

/**
 * Ce qu'il faut faire d'une rafale terminée.
 *
 * @param priseAvant  numéro de prise au lancement de la rafale
 * @param priseApres  numéro de prise maintenant — s'il a changé, un appui sur
 *                    le cœur (ou une autre rafale) a pris la main entre-temps
 */
export function apresRafale(p: {
  priseAvant: number
  priseApres: number
  transcript: string | null
}): { suite: SuiteRafale; demande: string } {
  if (p.priseAvant !== p.priseApres) return { suite: "laisser", demande: "" }
  if (!p.transcript) return { suite: "repos", demande: "" }
  const { trouve, reste } = chercherMotCle(p.transcript)
  if (!trouve) return { suite: "repos", demande: "" }
  return reste.length > 3 ? { suite: "conversation", demande: reste } : { suite: "oui", demande: "" }
}

/** Ce qu'on affiche pendant une rafale : rien tant que « Jarvis » n'a pas
 * été dit — une phrase qui ne nous est pas adressée n'a pas à s'afficher. */
export function texteAAfficherEnVeille(partiel: string): string | null {
  const { trouve, reste } = chercherMotCle(partiel)
  return trouve ? reste : null
}

/**
 * L'app vient de perdre le premier plan PENDANT que le mot-clé écoutait
 * activement (le micro était réellement ouvert) : c'est le signal qu'une
 * autre application vient de prendre le premier plan ET le micro en même
 * temps — le cas décrit par Raphaël (chantier 7a6e75c4, 18 sept. 2026),
 * « j'ouvre WhatsApp et je lance une note vocale ».
 *
 * La veille s'arrête déjà d'elle-même dans ce cas : dès que l'app perd le
 * premier plan, l'effet qui la porte est démonté et rend le micro tout de
 * suite, sans attendre la fin de la rafale (voir MicButton). Ce que cette
 * fonction décide EN PLUS, c'est qu'au retour elle ne doit pas reprendre
 * TOUTE SEULE — sa demande du 9 sept. 2026 pour REFUS_AVANT_ABANDON
 * s'applique à l'identique ici, mot pour mot : « il vaut mieux que le
 * micro s'arrête et qu'on réactive jarvis manuellement pour reprendre une
 * session plutôt que ça s'active de façon intempestive ». Une réactivation
 * manuelle (le cœur) remet `veilleAbandonnee` à faux, exactement comme
 * pour REFUS_AVANT_ABANDON — même mécanisme, complémentaire : celui-ci
 * coupe tout de suite sur un signal net (le micro était ouvert), l'autre
 * reste le filet pour les cas où l'app garde le premier plan (l'écran
 * partagé, une fenêtre d'assistance ouverte par-dessus une autre
 * application) et où rien ne dit qu'un conflit est en cours avant d'avoir
 * essayé — et échoué — plusieurs fois.
 *
 * Perdre le premier plan alors que la veille était simplement AU REPOS
 * (entre deux rafales, aucun micro ouvert) n'est PAS un conflit : rien
 * n'a été interrompu, il n'y a rien à couper. Elle continue de reprendre
 * toute seule dans ce cas, comme avant — sans quoi le moindre coup d'œil à
 * une notification obligerait à retoucher le cœur en revenant, ce qui
 * n'est jamais arrivé et ce qui irait à l'encontre de ce que ce chantier
 * doit réduire : les manipulations.
 *
 * LIMITE CONNUE, à ne pas présenter comme couverte : cette détection ne
 * voit QUE la perte du premier plan de CETTE fenêtre. Elle ne peut rien
 * pour un conflit qui survient alors que Jarvis reste visible — écran
 * partagé (Android multi-fenêtres), ou la fenêtre de l'appui long /
 * la bulle ouverte PAR-DESSUS une autre application encore au premier
 * plan en dessous. Deviner qui tient le micro dans ces cas-là n'est pas
 * possible depuis ici (Android ne l'expose pas) ; REFUS_AVANT_ABANDON
 * reste la seule protection pour eux, non mesurée comme suffisante pour
 * autant.
 */
export function focusPerduPendantEcoute(statut: StatutVoix, documentCache: boolean): boolean {
  return statut === "wake-listening" && documentCache
}

/** Plafond du recul entre deux rafales muettes. Au-delà, « Jarvis » dit
 * dans le trou serait raté trop souvent. */
export const RECUL_MAX_MS = 8000

/**
 * Plafond du recul entre deux essais qui se heurtent à un service occupé
 * (voir `delaiApresOccupe`) — distinct de `RECUL_MAX_MS`, qui plafonne le
 * silence : ici on attend qu'Android relâche une ressource, pas qu'un mot
 * arrive.
 */
export const RECUL_OCCUPE_MAX_MS = 4000

/**
 * Recul après des démarrages refusés CONSÉCUTIFS (codes Android 8/11 : le
 * service n'a pas encore lâché le micro du tour précédent) — séparé du recul
 * exponentiel du silence (`delaiAvantRafaleSuivante`), dont le rôle est de
 * laisser respirer un silence réel, pas d'attendre la libération d'une
 * ressource.
 *
 * MESURÉ le 16 sept. 2026, sur son téléphone réel, APK avec le correctif
 * stop() (a21c452) et le moteur com.google.android.as en service : le recul
 * fixe `RECUL_APRES_ECHEC_MS` (700 ms) échoue EN CHAÎNE — 7 à 8 refus à la
 * suite avant qu'un essai réussisse, à des intervalles réels de 746-770 ms
 * (donc le réglage était bien appliqué). Android/com.google.android.as met
 * visiblement plus longtemps que 700 ms à relâcher le micro par moments : un
 * recul FIXE le martèle pendant qu'il n'est pas encore libre. Palier montant
 * à la place, à partir du même point de départ (pas de régression sur un
 * refus isolé, le cas le plus fréquent).
 *
 * NON VÉRIFIÉ : le plafond de 4 s est un choix raisonnable, pas une mesure —
 * combien de temps Android met RÉELLEMENT à relâcher n'est pas observable
 * d'ici. À confirmer sur son téléphone : le rapport codes 8+11 / total sur
 * `evenement='rafale_fin'` devrait baisser nettement.
 */
export function delaiApresOccupe(echecsConsecutifs: number): number {
  if (echecsConsecutifs <= 1) return RECUL_APRES_ECHEC_MS
  return Math.min(RECUL_OCCUPE_MAX_MS, RECUL_APRES_ECHEC_MS * 2 ** (echecsConsecutifs - 1))
}

/**
 * Nombre de démarrages refusés CONSÉCUTIFS après lequel la veille renonce
 * d'elle-même, au lieu de réclamer le micro toutes les quatre secondes sans
 * fin.
 *
 * SA DÉCISION, écrite le 9 sept. 2026 dans le journal de bord et restée sans
 * suite jusqu'ici, mot pour mot : « Dans ce cas il vaut mieux que le micro
 * s'arrête et qu'on réactive jarvis manuellement pour reprendre une session
 * plutôt que ça s'active de façon intempestive ». Chaque essai refusé est une
 * ouverture de micro, et sur Samsung chaque ouverture joue sa tonalité : une
 * chaîne qui ne se rétablit pas est exactement le bruit dont il se plaint
 * depuis le 7 sept.
 *
 * POURQUOI 20, MESURÉ SUR SON JOURNAL ET PAS CHOISI À L'ŒIL (48 h au
 * 17 sept. 2026, `rafale_fin` en mode veille, chaînes de refus consécutifs) :
 *
 *     longueur  1 : 76 chaînes      longueur 11 :  1
 *     longueur  5 : 23              longueur 13 :  7
 *     longueur  7 :  6              longueur 18 :  1
 *     longueur  9 :  3              longueur 26 :  1
 *                                   longueur 229 : 1   <- en cours, 2 h 22
 *
 * Tout ce qui se rétablit tout seul tient sous 26. Un seuil à 8 aurait coupé
 * quinze chaînes qui repartaient d'elles-mêmes ; à 20, seules les deux
 * dernières sont touchées — dont celle du 17 sept. à 14 h 27, 229 refus
 * d'affilée sur 2 h 22 SANS UNE SEULE écoute réelle, c'est-à-dire un mot-clé
 * mort pendant qu'à l'écran une pastille clignotait « Dis "Jarvis" quand tu
 * veux ».
 *
 * L'ASYMÉTRIE JUSTIFIE DE RENONCER TÔT PLUTÔT QUE TARD, et c'est elle qu'il
 * faut garder en tête si on touche au seuil : renoncer à tort coûte UN appui
 * sur le cœur, et ça se voit puisqu'on l'écrit à l'écran ; renoncer trop tard
 * coûte une tonalité toutes les quatre secondes pour toujours, et un écran
 * qui ment.
 */
export const REFUS_AVANT_ABANDON = 20

/**
 * La veille doit-elle renoncer ?
 *
 * `seuil` à 0 (ou négatif) veut dire « ne jamais renoncer » — c'est le
 * réglage Paramètres › Voix et écoute › Mot-clé de réveil, et c'est aussi ce
 * que rendent les appelants qui ne savent rien de ce réglage (le banc
 * d'essai), pour garder exactement le comportement d'avant.
 */
export function renonceApresRefus(echecsConsecutifs: number, seuil: number): boolean {
  if (seuil <= 0) return false
  return echecsConsecutifs >= seuil
}

/**
 * Délai avant la rafale suivante.
 *
 * Le service Android meurt après quelques secondes de silence, et chaque
 * redémarrage joue une tonalité sur Samsung. Tant que personne ne parle, on
 * espace donc les rafales — 1 s, 2 s, 4 s, 8 s — au lieu de biper toutes
 * les cinq secondes. Dès qu'un mot est entendu, on repart serré.
 *
 * @param rafalesMuettes  nombre de rafales consécutives sans un seul mot
 */
export function delaiAvantRafaleSuivante(echecDemarrage: boolean, rafalesMuettes = 0): number {
  if (echecDemarrage) return RECUL_APRES_ECHEC_MS
  if (rafalesMuettes <= 0) return RESPIRATION_MS
  return Math.min(RECUL_MAX_MS, 1000 * 2 ** (rafalesMuettes - 1))
}

/**
 * Le « Oui ? » de Jarvis est dit PENDANT que le micro s'ouvre (voir
 * MicButton) : sur un appareil rapide, le moteur peut l'entendre et le coller
 * au début de la demande. On le retire — mais seulement lui, en tête, et
 * seulement s'il reste quelque chose derrière : un « oui » qui répond à une
 * question n'est pas un écho.
 */
export function sansAccuse(transcript: string): string {
  const m = transcript.match(/^\s*(?:oui|ouais)\s*[?!.,]*\s+(\S.*)$/i)
  return m ? m[1] : transcript
}
