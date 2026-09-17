import type { DevLogEntry } from "@/types/database"

/**
 * Ce que Raphaël écrit depuis l'app, par opposition aux sessions Claude Code.
 *
 * Déclaré ICI et pas dans `useDevLog` : ce module est lu par
 * `src/lib/decisions.ts`, qui doit rester chargeable sans React pour sa
 * vérification hors réseau. `useDevLog` le réexporte, les appelants existants
 * n'ont rien à changer.
 */
export const AUTEUR_RAPHAEL = "Raphaël"

/**
 * À qui s'adresse un message du journal de bord.
 *
 * Le journal sert deux conversations différentes — les sessions Claude Code
 * entre elles, et les sessions avec Raphaël — et rien ne les distingue dans
 * le schéma. La convention suivie par toutes les sessions est d'ouvrir un
 * message adressé à une autre session par « Pour la session … ». On s'appuie
 * dessus plutôt que d'ajouter une colonne qu'il faudrait faire adopter par
 * toutes les sessions en parallèle.
 *
 * Cette règle décide de DEUX choses maintenant : le badge « questions en
 * attente » du cockpit, et le fait de faire sonner le téléphone. Elle vit
 * donc ici, une fois — deux copies auraient dérivé, et on se serait retrouvé
 * avec un badge qui compte ce qui ne sonne pas.
 */

function adresseeAUneSession(entry: DevLogEntry): boolean {
  return /^pour la session\b/i.test(entry.body.trim())
}

/**
 * `kind = "action"` porte DEUX sens opposés, et rien dans le schéma ne les
 * sépare : « une action que RAPHAËL doit faire » (ce que pose
 * `scripts/demander.sh`) et « une action qu'une SESSION a faite », que les
 * sessions écrivent en compte rendu (« Fait et archivé. Commit … »).
 *
 * Les compter ensemble faisait dire au cockpit que cinq points attendaient sa
 * décision quand un seul l'attendait — MESURÉ le 7 sept. 2026 sur la totalité
 * de son journal : sur les 4 lignes `action` en attente, 4 étaient des comptes
 * rendus. Et la même règle fait SONNER son téléphone : il aurait été réveillé
 * par le compte rendu d'une session.
 *
 * Le discriminant n'est pas une devinette sur le texte : une demande posée par
 * `demander.sh` renseigne toujours `pourquoi` (colonne de la migration 0022),
 * un compte rendu jamais. Vérifié sur tout l'historique — 4 `action` en base,
 * toutes sans `pourquoi`, toutes des comptes rendus ; aucune vraie demande
 * n'existe sans lui.
 *
 * Les QUESTIONS ne passent pas par ce filtre, et c'est voulu : 9 des 14
 * questions du journal ont été posées à la main, sans `pourquoi`, et ce sont
 * de vraies questions. Une question s'adresse à quelqu'un par nature ; une
 * « action », non.
 */
function compteRenduDeSession(entry: DevLogEntry): boolean {
  if (entry.kind !== "action") return false
  return entry.pourquoi == null || entry.pourquoi.trim() === ""
}

/**
 * Une question MAL FORMÉE : ni `pourquoi`, ni options, ni adressée à une
 * session par la convention « Pour la session … ».
 *
 * Trouvé le 17 sept. 2026 : une session a inséré en SQL brut une note
 * TECHNIQUE, adressée à une autre session, sans passer par
 * `scripts/demander.sh` ni préfixer « Pour la session ». Elle a atterri telle
 * quelle sur la carte « Ce qui attend ta décision » de Raphaël — ses mots :
 * « je ne comprends rien. En fait, il me fait un récap très bizarre ».
 *
 * REMESURÉ ce jour-là sur les 27 questions du journal réel : les 10 sans
 * `pourquoi` sont TOUTES des messages entre sessions (pas une seule question
 * légitime pour Raphaël) — la mesure du 7 sept. (« 9 sur 14 légitimes ») ne
 * tient donc plus. La raison : `scripts/demander.sh` exige `--pourquoi`
 * depuis le 17 sept., donc toute question posée par le chemin canonique en
 * porte un désormais. Une question qui n'en a pas, et qui ne coche aucun
 * autre signal de forme (options, préfixe reconnu), n'est structurellement
 * plus une vraie demande vers lui — elle est écartée plutôt que devinée mot à
 * mot, ce qui éviterait d'avoir à énumérer indéfiniment les façons d'adresser
 * une session (« Session X ici », « Pour les sessions… », déjà vues et
 * ratées par le préfixe strict).
 */
function questionMalFormee(entry: DevLogEntry): boolean {
  return (
    entry.kind === "question" &&
    (entry.pourquoi == null || entry.pourquoi.trim() === "") &&
    entry.options == null &&
    !adresseeAUneSession(entry)
  )
}

/** Une question posée à Raphaël, à laquelle personne n'a encore répondu. */
export function questionPourRaphael(entry: DevLogEntry): boolean {
  return (
    entry.kind === "question" &&
    !entry.answered_at &&
    !adresseeAUneSession(entry) &&
    !questionMalFormee(entry)
  )
}

/**
 * Ce qui l'attend, LUI : une question à trancher ou une action de son côté.
 *
 * C'est ce que l'écran « Ce qui attend ta décision » affiche et ce que « Où
 * j'en suis » compte dans sa colonne « pour toi ». La règle vit ici avec les
 * autres, et pas dans chacun des deux : une question qu'un écran compte et que
 * l'autre ignore est précisément ce qui lui a fait répondre deux fois.
 *
 * Une question qu'une session pose à une AUTRE session n'en fait pas partie —
 * même convention que le badge du journal, « Pour la session … ».
 */
export function enAttenteDeRaphael(entry: DevLogEntry): boolean {
  return (
    (entry.kind === "question" || entry.kind === "action") &&
    !entry.answered_at &&
    !adresseeAUneSession(entry) &&
    !compteRenduDeSession(entry) &&
    !questionMalFormee(entry)
  )
}

/**
 * Ce qui mérite de le déranger : une question pour lui, ou une session
 * bloquée qui attend une décision. Ce qu'il a écrit lui-même n'en fait
 * évidemment pas partie.
 */
export function estPourRaphael(entry: DevLogEntry): boolean {
  if (entry.author === AUTEUR_RAPHAEL) return false
  if (entry.answered_at || adresseeAUneSession(entry)) return false
  // « action » comprise : une clé qu'il doit déposer bloque douze chantiers,
  // et personne d'autre que lui ne peut la déposer. Mais pas un compte rendu
  // de session, qui porte le même `kind` — ça le réveillerait pour rien.
  if (compteRenduDeSession(entry)) return false
  if (questionMalFormee(entry)) return false
  return entry.kind === "question" || entry.kind === "blocage" || entry.kind === "action"
}
