import { registerPlugin } from "@capacitor/core"

export type CommandeMedia = "play_pause" | "lecture" | "pause" | "suivant" | "precedent" | "stop"

export interface ApplicationInstallee {
  nom: string
  paquet: string
}

interface ActionsTelephonePlugin {
  listerApplications(): Promise<{ applications: ApplicationInstallee[] }>
  ouvrirApplication(options: { paquet?: string; recherche?: string }): Promise<void>
  preparerWhatsApp(options: { texte: string; numero?: string }): Promise<void>
  preparerSms(options: { texte: string; numero?: string }): Promise<void>
  composer(options: { numero: string }): Promise<{ direct: boolean }>
  demanderPermissionAppel(): Promise<{ granted: boolean }>
  commanderMedia(options: { commande: CommandeMedia }): Promise<void>
  mettreAlarme(options: { heure: number; minute: number; libelle?: string }): Promise<void>
  mettreMinuteur(options: { secondes: number; libelle?: string }): Promise<void>
  itineraire(options: { destination: string; paquet?: string }): Promise<void>
}

/** Pont vers android/.../ActionsTelephonePlugin.java. N'existe que dans l'app
 * empaquetée : sur le web, il n'y a pas d'applications à ouvrir. */
export const ActionsTelephone = registerPlugin<ActionsTelephonePlugin>("ActionsTelephone")

/** Ignore accents, casse et espaces : "spotify", "Spotify" et "Spotifaï"
 * mal transcrit doivent tomber sur la même app. */
function aplatir(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
}

/**
 * Retrouve l'application dont le nom colle le mieux à ce que Raphaël a dit.
 *
 * La dictée vocale écorche les noms propres — c'est le cas le plus fréquent
 * ici, puisqu'il s'agit presque toujours d'une marque. On accepte donc qu'un
 * nom soit contenu dans l'autre, dans un sens comme dans l'autre, et on
 * préfère la correspondance la plus courte : "Play" ne doit pas rafler
 * "Play Store", "Play Musique" et "Play Jeux" au hasard.
 */
export function trouverApplication(
  applications: ApplicationInstallee[],
  demande: string,
): ApplicationInstallee | null {
  const cible = aplatir(demande)
  if (!cible) return null

  const exact = applications.find((a) => aplatir(a.nom) === cible)
  if (exact) return exact

  const proches = applications
    .filter((a) => {
      const nom = aplatir(a.nom)
      return nom.includes(cible) || cible.includes(nom)
    })
    .sort((a, b) => aplatir(a.nom).length - aplatir(b.nom).length)

  return proches[0] ?? null
}
