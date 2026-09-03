import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import { CORE_IMAGE_CHANGEE } from "@/components/JarvisCore"
import {
  appliquerReglages,
  lireReglagesLocaux,
  REGLAGE_MODIFIE,
  REGLAGES_RESTAURES,
} from "@/lib/reglages"

/**
 * Fait vivre les réglages personnels en base plutôt que sur le seul
 * téléphone : ils survivent à une réinstallation de l'app et suivent
 * Raphaël entre le web et le mobile.
 *
 * Règle de résolution, volontairement simple et prévisible : à la connexion,
 * ce qui est en base gagne (c'est le dernier état connu, d'où qu'il vienne) ;
 * ensuite, toute modification faite ici part aussitôt en base. Sur un
 * appareil fraîchement réinstallé, le local est vide, donc tout revient.
 *
 * Aucun réglage n'est jamais perdu par un échec réseau : le stockage local
 * reste la source qu'on lit à l'affichage, la base n'est qu'une copie
 * durable.
 */
export function useReglagesSync(userId: string | undefined) {
  // Tant que la première lecture n'a pas eu lieu, on ne pousse rien : sinon
  // un appareil neuf écraserait en base les réglages qu'il n'a pas encore
  // reçus.
  const pretAPousser = useRef(false)

  useEffect(() => {
    pretAPousser.current = false
    if (!userId) return
    let annule = false

    async function tirer() {
      const { data, error } = await supabase
        .from("reglages")
        .select("valeurs")
        .eq("user_id", userId)
        .maybeSingle()
      if (annule) return

      if (!error && data?.valeurs && typeof data.valeurs === "object") {
        if (appliquerReglages(data.valeurs as Record<string, unknown>)) {
          window.dispatchEvent(new Event(REGLAGES_RESTAURES))
          // Le réacteur a son propre signal, déjà écouté ailleurs.
          window.dispatchEvent(new Event(CORE_IMAGE_CHANGEE))
        }
      }
      // Même en cas d'échec de lecture on autorise la poussée : ne pas
      // sauvegarder ses réglages serait pire que de risquer d'écraser une
      // copie qu'on n'a pas réussi à lire.
      pretAPousser.current = true
      // Premier envoi : sur un appareil déjà réglé et jamais synchronisé,
      // c'est lui qui crée la copie en base.
      pousser()
    }

    let minuteur: ReturnType<typeof setTimeout> | null = null
    async function pousser() {
      if (!pretAPousser.current || annule) return
      const valeurs = lireReglagesLocaux()
      await supabase
        .from("reglages")
        .upsert(
          { user_id: userId, valeurs, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
    }

    function planifierPoussee() {
      if (minuteur) clearTimeout(minuteur)
      // Un curseur de vitesse de voix émet une dizaine d'événements par
      // seconde : on n'envoie que l'état où il s'arrête.
      minuteur = setTimeout(() => {
        minuteur = null
        void pousser()
      }, 1000)
    }

    window.addEventListener(REGLAGE_MODIFIE, planifierPoussee)
    void tirer()

    return () => {
      annule = true
      if (minuteur) clearTimeout(minuteur)
      window.removeEventListener(REGLAGE_MODIFIE, planifierPoussee)
    }
  }, [userId])
}

/** Relit le stockage local quand les réglages viennent d'être restaurés
 * depuis la base — sans ça, l'état React d'un hook resterait figé sur ce
 * qu'il avait lu au montage, et l'écran mentirait. */
export function useRelireApresRestauration(relire: () => void) {
  const relireRef = useRef(relire)
  // Affectation dans un effet, pas pendant le rendu : lire ou écrire
  // une ref pendant le rendu est un anti-patron React.
  useEffect(() => {
    relireRef.current = relire
  })

  useEffect(() => {
    const run = () => relireRef.current()
    window.addEventListener(REGLAGES_RESTAURES, run)
    return () => window.removeEventListener(REGLAGES_RESTAURES, run)
  }, [])
}
