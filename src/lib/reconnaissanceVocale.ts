import { SpeechRecognition as NativeSpeechRecognition } from "@capacitor-community/speech-recognition"
import { ecrireReglage } from "@/lib/reglages"
import type { ApplicationInstallee } from "@/lib/actionsTelephone"

/**
 * Quel moteur de reconnaissance vocale Android utiliser — choisi depuis
 * Paramètres, jamais deviné à chaque appel.
 *
 * Sa demande, 7 sept. 2026, verbatim : « Écrire le code nécessaire pour que
 * ce soit branchable et sélectionnable depuis l'app Jarvis même à tout
 * moment [...] en le demandant à Jarvis. » Avant ce chantier, le plugin natif
 * choisissait tout seul (Google si présent, sinon le service par défaut
 * d'Android) sans qu'on puisse voir ni changer ce choix ailleurs que dans le
 * code — exactement l'inverse de la règle du projet : « une préférence qu'un
 * seul chemin permet de poser se règle aussi depuis Paramètres ».
 *
 * `null` (ou absent) = automatique, le comportement d'avant. Une valeur
 * choisie est le composant Android aplati (`ComponentName.flattenToShortString`,
 * "paquet/classe") — jamais le nom affiché, qui n'identifie rien de façon
 * fiable côté natif.
 */

export const CLE_SERVICE_RECONNAISSANCE = "jarvis_service_reconnaissance"

export function serviceReconnaissanceSouhaite(): string | null {
  try {
    return localStorage.getItem(CLE_SERVICE_RECONNAISSANCE)
  } catch {
    return null
  }
}

export function choisirServiceReconnaissance(paquet: string | null) {
  ecrireReglage(CLE_SERVICE_RECONNAISSANCE, paquet)
}

// Ajoutée par notre patch (patches/@capacitor-community+speech-recognition),
// absente des types du paquet d'origine — même famille que `serviceUtilise`
// dans useSpeechRecognition.ts.
const plugin = NativeSpeechRecognition as unknown as {
  listerServicesReconnaissance?: () => Promise<{ applications: ApplicationInstallee[] }>
}

/** Les moteurs de reconnaissance vocale installés sur ce téléphone — pour
 * les proposer depuis Paramètres. `null` hors de l'app native, ou sur une
 * APK antérieure à ce chantier (méthode absente du plugin installé). */
export async function listerServicesReconnaissance(): Promise<ApplicationInstallee[] | null> {
  try {
    const r = await plugin.listerServicesReconnaissance?.()
    return r?.applications ?? null
  } catch {
    return null
  }
}
