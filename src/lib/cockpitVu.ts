// Relatif avec extension : ce module est vérifié par
// `node --experimental-strip-types scripts/verifier-depuis-derniere-visite.ts`,
// qui ne connaît pas l'alias « @/ » de Vite.

/**
 * Le repère « déjà vu » du cockpit : la dernière fois que Raphaël a appuyé sur
 * « Vu ».
 *
 * LE DÉFAUT CORRIGÉ (chantier ae0f3a7b, 6 sept. 2026) : ce repère vivait dans
 * le seul localStorage, avec pour raison écrite « la retrouver sur un autre
 * appareil n'aurait aucun sens ». Cette raison était fausse pour lui — il
 * utilise l'app ET le site, souvent dans la même matinée. Il appuyait sur
 * « Vu » sur le téléphone, et le site lui réannonçait les quatorze mêmes
 * chantiers livrés ; ou l'inverse.
 *
 * DEUX MOITIÉS, ET IL FAUT LES DEUX. La base porte le repère, par compte. Le
 * localStorage reste le chemin RAPIDE : le cockpit s'affiche avant que le
 * réseau ait répondu, et un bandeau qui apparaîtrait puis disparaîtrait une
 * seconde plus tard serait pire que pas de bandeau du tout.
 *
 * Pur : aucune décision de ce fichier ne dépend de React, de Supabase ni du
 * réseau. C'est ici que vit ce qui peut se tromper en silence.
 */

export const CLE_COCKPIT_VU = "jarvis_cockpit_vu"

function horodatage(valeur: string | null | undefined): number | null {
  if (!valeur) return null
  const t = Date.parse(valeur)
  return Number.isFinite(t) ? t : null
}

/**
 * Le repère à retenir entre celui de cet écran et celui de la base.
 *
 * LE PLUS RÉCENT GAGNE, et jamais l'inverse. Reculer, c'est réannoncer six
 * semaines de travail à quelqu'un qui vient justement de tout regarder — le
 * défaut qu'on corrige, en pire.
 *
 * `null` des deux côtés veut dire « première ouverture » : le bandeau ne dit
 * rien plutôt que de présenter tout le cockpit comme nouveau. Une lecture de
 * la base qui ÉCHOUE rend `null` elle aussi, et c'est exactement pour ça
 * qu'elle ne doit pas être passée ici comme un repère : voir `repereApresLecture`.
 */
export function reperePlusRecent(
  local: string | null | undefined,
  distant: string | null | undefined,
): string | null {
  const a = horodatage(local)
  const b = horodatage(distant)
  if (a === null) return b === null ? null : (distant ?? null)
  if (b === null) return local ?? null
  return b > a ? (distant ?? null) : (local ?? null)
}

/**
 * Ce qu'on retient une fois la base interrogée — succès ou échec.
 *
 * UNE PANNE DE LECTURE NE DOIT PAS SE LIRE COMME « TU N'AS JAMAIS RIEN VU ».
 * C'est le piège de tout ce projet : une absence et un échec rendent la même
 * valeur, et le bandeau réannoncerait tout. En échec, on garde ce que l'écran
 * savait déjà.
 */
export function repereApresLecture(
  local: string | null | undefined,
  reponse: { ok: true; vuLe: string | null } | { ok: false },
): string | null {
  if (!reponse.ok) return local ?? null
  return reperePlusRecent(local, reponse.vuLe)
}

export function lireRepereLocal(): string | null {
  try {
    return localStorage.getItem(CLE_COCKPIT_VU)
  } catch {
    // Navigateur qui refuse le stockage : on n'annonce rien, on ne casse rien.
    return null
  }
}

export function ecrireRepereLocal(iso: string) {
  try {
    localStorage.setItem(CLE_COCKPIT_VU, iso)
  } catch {
    // Rien à faire ici : la base garde le repère, c'est elle qui compte.
  }
}
