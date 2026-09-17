/**
 * Quel moteur de langue tourne EN CE MOMENT, pour que Jarvis puisse le dire.
 *
 * Chantier 920ff758, sa demande : pouvoir demander à voix haute quel moteur
 * de langue tourne — MÊME en mode automatique de bascule (réglage « veille
 * automatique du moteur de langue », chantier 66a7a233) — pour identifier le
 * plus performant.
 *
 * L'APP NE PEUT PAS LE SAVOIR ELLE-MÊME, et c'est pour ça que ça vit ici :
 * le modèle principal se règle par le secret GEMINI_MODELE, et ce que la
 * veille automatique a promu vit dans `moteur_choisi` — deux choses que
 * l'app ne voit jamais (même raison que `branchements.ts`).
 *
 * POURQUOI PAS LIRE `moteur_choisi` OU LE SECRET DIRECTEMENT : ce serait dire
 * ce qui DEVRAIT répondre, pas ce qui répond RÉELLEMENT — exactement le
 * problème que `resumerConsommation` (`src/lib/consommationModele.ts`,
 * chantier 5ac4d12c) a déjà résolu pour le cockpit : « la seule autre façon
 * de savoir si l'on tourne sur un secours serait de comparer des noms de
 * modèles, et l'app ne peut pas connaître celui que le secret désigne côté
 * serveur ». On applique donc la MÊME règle, mesurée sur `appels_modele` (ce
 * qui a RÉELLEMENT répondu, pas ce qui était prévu) plutôt que de la
 * réinventer.
 *
 * DEUX COPIES DE LA MÊME RÈGLE, ET C'EST ASSUMÉ : une Edge Function ne peut
 * pas importer `src/` (le script de déploiement ne transporte que
 * `supabase/functions/`, voir `scripts/deployer-fonction.sh`), donc la règle
 * de sélection du « gagnant » vit deux fois — ici et dans
 * `resumerConsommation`. Même stratégie que `destinataire.ts` /
 * `journalDestinataire.ts` pour « à qui s'adresse ce message » :
 * `scripts/verifier-moteur-actif.ts` fait tourner les deux sur les mêmes cas
 * et refuse qu'elles divergent, plutôt que de comparer leur texte.
 *
 * SILENCIEUX QUAND RIEN N'A ENCORE ÉTÉ MESURÉ (une base neuve, un compte de
 * test) : pas de configuration devinée en repli, jamais un nom inventé.
 */

import { signalerPanne } from "./pannes.ts"

/** Ce qu'il faut d'une ligne de `etat_consommation()` pour cette décision. */
export interface LigneMoteur {
  role: string
  modele: string
  fournisseur: string
  reussis: number
  rang: number | null
  dernier_at: string | null
}

/**
 * Le modèle qui a le PLUS RÉPONDU à ses phrases de commande récemment — pas
 * celui qui a le plus été essayé : un modèle mort peut avoir été tenté cent
 * fois sans jamais parler. MÊME RÈGLE que `resumerConsommation`.
 */
export function moteurGagnant(lignes: LigneMoteur[]): LigneMoteur | null {
  const commandes = (lignes ?? []).filter((l) => l.role === "commande" && l.reussis > 0)
  const gagnant = commandes.sort((a, b) => b.reussis - a.reussis)[0]
  return gagnant ?? null
}

/** Le bloc à joindre à la consigne, ou "" quand rien n'a encore été mesuré. */
export function formaterMoteurActif(lignes: LigneMoteur[]): string {
  const gagnant = moteurGagnant(lignes)
  if (!gagnant) return ""

  const surSecours = (gagnant.rang ?? 0) > 0
  const precision = surSecours
    ? " C'est un SECOURS : le modèle principal a dû être indisponible ou à quota lors de ses derniers appels. C'est la veille automatique du moteur (réglage « veille automatique du moteur de langue », qu'il peut te faire geler avec set_setting) qui décide si ça change tout seul."
    : " C'est le modèle PRINCIPAL — pas un secours."

  return `\nLE MOTEUR DE LANGUE QUI T'A RÉELLEMENT FAIT RÉPONDRE CES DERNIERS TEMPS (mesuré sur tes vrais appels, jamais deviné) : ${gagnant.modele}, fournisseur ${gagnant.fournisseur}.${precision} Si on te demande quel moteur ou quel modèle de langue tu utilises en ce moment, ou lequel est le plus performant, réponds avec CE nom précis — tu ne peux connaître ta propre identité que par cette mesure, jamais en la devinant ou en te souvenant d'un nom appris ailleurs.`
}

/** Le client Supabase, réduit à ce qu'on utilise ici. */
interface ClientLecture {
  rpc(nom: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>
}

/**
 * Sur combien de temps regarder pour dire ce qui tourne « en ce moment » :
 * assez large pour couvrir une nuit sans la moindre phrase, assez court pour
 * ne jamais répondre avec un modèle abandonné depuis des semaines.
 */
const FENETRE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Lit sa consommation récente et rend le bloc prêt à joindre à la consigne.
 *
 * Silencieuse comme le reste des rappels : une lecture cassée doit priver
 * Jarvis de ce bloc, pas de sa réponse — mais elle se SIGNALE, même règle que
 * `ceQuiLAttend.ts` et `corrections.ts`.
 */
export async function rappelerMoteurActif(
  supabase: ClientLecture & Parameters<typeof signalerPanne>[0],
): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("etat_consommation", {
      p_depuis: new Date(Date.now() - FENETRE_MS).toISOString(),
    })
    if (error) {
      await signalerPanne(supabase, "Jarvis n'a pas pu relire quel moteur a répondu récemment", error)
      return ""
    }
    if (!Array.isArray(data)) return ""
    return formaterMoteurActif(data as LigneMoteur[])
  } catch (err) {
    await signalerPanne(supabase, "Jarvis n'a pas pu relire quel moteur a répondu récemment", err)
    return ""
  }
}
