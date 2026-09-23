/**
 * Ce qui vient d'être dit dans la conversation, joint à la consigne de
 * `voice-command` (la mémoire de travail, `src/lib/memoireDeTravail.ts` côté
 * app — l'en-tête y dit ce qui a été mesuré).
 *
 * Pas de version Live, et ce n'est pas un oubli : une session Live garde
 * elle-même tout ce qui s'est dit depuis son ouverture (et depuis le
 * 23 sept., même à travers ses reconnexions — la poignée de reprise).
 *
 * Le corps vient de l'app, donc d'un appelant : tout est revalidé ici, borné,
 * et un champ mal formé est ignoré plutôt que d'empêcher la phrase de partir.
 * Vide, le bloc ne rend RIEN — même règle que `ceQuiLAttend.ts`.
 */

const TOURS_MAX = 6
const LONGUEUR_MAX = 300

function texte(v: unknown, max = LONGUEUR_MAX): string | null {
  if (typeof v !== "string") return null
  const plat = v.replace(/\s+/g, " ").trim()
  if (!plat) return null
  return plat.length > max ? `${plat.slice(0, max)}…` : plat
}

function depuis(secondes: number): string {
  if (secondes < 60) return "à l'instant"
  const minutes = Math.round(secondes / 60)
  return `il y a ${minutes} min`
}

export function blocDerniersTours(brut: unknown): string {
  if (!Array.isArray(brut) || brut.length === 0) return ""
  const lignes: string[] = []
  for (const t of brut.slice(-TOURS_MAX)) {
    if (!t || typeof t !== "object") continue
    const tour = t as Record<string, unknown>
    const dit = texte(tour.dit)
    if (!dit) continue
    const secondes = typeof tour.il_y_a_s === "number" && tour.il_y_a_s >= 0 ? tour.il_y_a_s : 0
    const fait = Array.isArray(tour.fait)
      ? tour.fait.map((f) => texte(f, 200)).filter((f): f is string => Boolean(f)).slice(0, 5)
      : []
    const repondu = texte(tour.repondu)
    lignes.push(
      `- ${depuis(secondes)} — il a dit : « ${dit} »` +
        (fait.length ? ` — fait : ${fait.join(" ; ")}` : "") +
        (repondu ? ` — tu as répondu : « ${repondu} »` : ""),
    )
  }
  if (lignes.length === 0) return ""
  return `

CE QUI VIENT D'ÊTRE DIT DANS CETTE CONVERSATION (du plus ancien au plus récent) :
${lignes.join("\n")}
COMMENT T'EN SERVIR : sa phrase de maintenant peut renvoyer à ces échanges sans les répéter — « le premier », « celle-là », « annule ça », « mets-la plutôt dans Perso », « pourquoi tu ne l'as pas fait ? », « les deux chantiers créés à l'instant », « avec le contact trouvé ». Comprends-la alors AVEC eux, comme quelqu'un qui a suivi la conversation : la tâche, le chantier ou le message dont il parle est celui de ces échanges, retrouve son identifiant dans les listes fournies plus haut. Quand il te reproche de ne pas avoir fait quelque chose (« pourquoi tu ne l'as pas fait ? », « tu n'as pas… ») et que l'échange ci-dessus montre que ça n'a pas été compris ou a échoué, FAIS-LE MAINTENANT avec ce qu'il avait dit, sans lui redemander la permission, et dis en une phrase ce qui s'était passé. Trois limites : (1) ne REFAIS JAMAIS une action déjà faite ci-dessus, sauf s'il la redemande explicitement ; (2) une phrase qui se suffit à elle-même est une NOUVELLE demande — ne la rattache pas de force à ce qui précède ; (3) si tu ne sais pas à quel échange elle renvoie, demande-le (clarify) en nommant les candidats.`
}
