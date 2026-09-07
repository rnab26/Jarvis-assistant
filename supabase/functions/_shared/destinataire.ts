/**
 * À qui s'adresse un message du journal de bord — la copie SERVEUR.
 *
 * L'original est `src/lib/journalDestinataire.ts`, côté app. Cette copie-ci
 * existe parce que le journal est lu à deux endroits que l'app ne traverse
 * pas : `push-notifier` (qui décide de faire sonner son téléphone) et
 * `voice-command` (qui dit à Jarvis ce qui attend une décision de Raphaël).
 *
 * ELLE EST PARTAGÉE, et c'est le point à ne pas défaire : même motif que
 * `environnement.ts`, `corrections.ts` et `honnetete.ts`, qui sont importés
 * par plusieurs fonctions plutôt que recopiés dans chacune. Avant le 7 sept.
 * 2026, `push-notifier` portait sa propre copie ; en ajouter une seconde dans
 * `voice-command` aurait fait trois lectures du même concept, et le jour où
 * elles divergent, le cockpit compte ce qui ne sonne pas.
 *
 * Il reste DEUX copies au total — celle-ci et celle de l'app — parce qu'un
 * module de `src/` ne peut pas être importé par une Edge Function.
 * `scripts/verifier-decisions.ts` refuse qu'elles divergent.
 */

export const AUTEUR_RAPHAEL = "Raphaël"

/** Une entrée du journal, réduite à ce dont la règle a besoin. */
export interface EntreeJournal {
  author: string
  kind: string
  body: string
  answered_at: string | null
  pourquoi?: string | null
}

function adresseeAUneSession(body: string): boolean {
  return /^pour la session\b/i.test(body.trim())
}

/**
 * `kind = "action"` porte DEUX sens opposés, et rien dans le schéma ne les
 * sépare : une action que RAPHAËL doit faire (posée par `scripts/demander.sh`,
 * qui exige `pourquoi`) et le compte rendu d'une action qu'une SESSION a faite
 * (« Fait et archivé. Commit … »), qui n'en a jamais.
 *
 * MESURÉ le 7 sept. 2026 sur ses 215 entrées de journal : les compter ensemble
 * annonçait 5 points en attente de sa décision quand 1 seul l'attendait, et
 * 16 messages capables de faire sonner son téléphone au lieu de 12.
 */
export function compteRenduDeSession(entry: EntreeJournal): boolean {
  if (entry.kind !== "action") return false
  return entry.pourquoi == null || entry.pourquoi.trim() === ""
}

/** Ce qui l'attend, LUI : une question à trancher ou une action de son côté. */
export function enAttenteDeRaphael(entry: EntreeJournal): boolean {
  return (
    (entry.kind === "question" || entry.kind === "action") &&
    !entry.answered_at &&
    !adresseeAUneSession(entry.body) &&
    !compteRenduDeSession(entry)
  )
}

/** Ce qui mérite de le déranger. Ce qu'il a écrit lui-même n'en fait pas partie. */
export function estPourRaphael(entry: EntreeJournal): boolean {
  if (entry.author === AUTEUR_RAPHAEL) return false
  if (entry.answered_at || adresseeAUneSession(entry.body)) return false
  if (compteRenduDeSession(entry)) return false
  return entry.kind === "question" || entry.kind === "blocage" || entry.kind === "action"
}
