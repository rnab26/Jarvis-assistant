import { registerPlugin } from "@capacitor/core"

/**
 * Un drapeau natif partagé entre les DEUX fenêtres qui peuvent monter
 * MicButton (ProtectedShell et AssistantOverlayPage, chantier 2a5b7802).
 *
 * Chacune est une BridgeActivity distincte, donc un tas JS distinct : le
 * `status` React de l'une (qui bloque déjà sa PROPRE boucle de veille
 * pendant une conversation Live, voir peutEcouterEnVeille) n'existe pas dans
 * l'autre. Mesuré dans journal_ecoute avant ce correctif : la veille
 * classique d'une fenêtre continuait de tourner toutes les ~7-8 s pendant
 * qu'une conversation Live était ouverte dans l'autre — les activations et
 * désactivations intempestives du micro qu'il a signalées.
 *
 * Web (PWA sans ce plugin, ou APK antérieure) : les deux fonctions échouent
 * silencieusement — définirLiveActifNatif() ne fait rien,
 * liveActifQuelquePart() répond `false`, exactement le comportement d'avant
 * ce chantier.
 */

interface EtatLivePlugin {
  definir(options: { actif: boolean }): Promise<void>
  etat(): Promise<{ actif: boolean }>
}

const EtatLive = registerPlugin<EtatLivePlugin>("EtatLive")

export function definirLiveActifNatif(actif: boolean) {
  EtatLive.definir({ actif }).catch(() => {
    // Hors de l'app, ou APK antérieure à ce plugin : rien à faire de plus.
  })
}

/** Vrai si une conversation Live est ouverte dans CETTE fenêtre OU dans
 * l'autre — peu importe laquelle, la boucle de veille doit se taire pour
 * les deux mêmes raisons. */
export async function liveActifQuelquePart(): Promise<boolean> {
  try {
    return (await EtatLive.etat()).actif
  } catch {
    return false
  }
}
