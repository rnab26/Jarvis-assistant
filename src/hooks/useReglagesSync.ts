import { useEffect, useRef } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { supabase } from "@/lib/supabase"
import { CORE_IMAGE_CHANGEE } from "@/components/JarvisCore"
import { lireCoreImage } from "@/lib/coreImage"
import { pousserCoeurVersWidget } from "@/lib/jarvisWidgetPlugin"
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
  // Une modification faite ICI attend encore de partir (le délai d'une
  // seconde ci-dessous) : pendant ce temps, on n'applique pas ce qui arrive
  // de la base, sinon sa copie — plus ancienne que ce qu'il vient de toucher —
  // effacerait son geste avant même qu'il soit envoyé.
  const pousseeEnAttente = useRef(false)
  // Relire la base sans repousser : ce que fait le direct.
  const relireRef = useRef<() => Promise<void>>(async () => {})

  // EN DIRECT (chantier e687f0e2, 23 sept. 2026 : « un réglage doit
  // s'appliquer instantanément »). Avant, la base n'était relue qu'à la
  // connexion : un réglage changé sur le site n'arrivait sur le téléphone
  // qu'au redémarrage suivant. `reglages` est dans la publication depuis la
  // migration 0054. Pas de boucle : un réglage revenu identique ne change
  // rien en local (`appliquerReglages` rend faux), donc rien ne repart.
  useRealtimeRefresh("reglages", userId, () => {
    if (pousseeEnAttente.current) return
    void relireRef.current()
  })

  useEffect(() => {
    pretAPousser.current = false
    if (!userId) return
    let annule = false

    async function tirer(premiereFois = true) {
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
          // Et les widgets, qui ne voient pas localStorage : sans ça, après
          // une réinstallation ils resteraient sur le réacteur par défaut
          // alors que son image est bien revenue de la base.
          void pousserCoeurVersWidget(lireCoreImage())
        }
      }
      if (!premiereFois) return
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
      try {
        await supabase
          .from("reglages")
          .upsert(
            { user_id: userId, valeurs, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
          )
      } finally {
        pousseeEnAttente.current = false
      }
    }

    function planifierPoussee() {
      if (minuteur) clearTimeout(minuteur)
      pousseeEnAttente.current = true
      // Un curseur de vitesse de voix émet une dizaine d'événements par
      // seconde : on n'envoie que l'état où il s'arrête.
      minuteur = setTimeout(() => {
        minuteur = null
        void pousser()
      }, 1000)
    }

    window.addEventListener(REGLAGE_MODIFIE, planifierPoussee)
    relireRef.current = () => tirer(false)
    void tirer()

    return () => {
      annule = true
      relireRef.current = async () => {}
      pousseeEnAttente.current = false
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
