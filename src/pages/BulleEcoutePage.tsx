import { useEffect } from "react"
import { JarvisDataProvider } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { BulleEcoute } from "@/lib/bulleEcoutePlugin"
import { OverlayMicContent } from "@/pages/AssistantOverlayPage"

/**
 * Ce qu'un appui sur la bulle flottante ouvre depuis le 15 sept. 2026
 * (chantier 468734ad) : le micro, SANS FENÊTRE VISIBLE. Sa décision, mot
 * pour mot : « Moi l'utilisateur j'appuie pour activer jarvis ».
 *
 * MÊME BRANCHEMENT que la fenêtre de l'appui long (OverlayMicContent,
 * partagé depuis AssistantOverlayPage.tsx) : mêmes données, même MicButton,
 * mêmes actions. Ce qui change : `cache` masque tout affichage (`sr-only` —
 * personne ne doit rien voir apparaître), et `onIdle` referme par
 * BulleEcoute.fermer() plutôt que AssistOverlay.fermer(), puisque c'est une
 * fenêtre différente (voir demarrageOverlay.ts).
 *
 * PAS DE SESSION : rien à écouter, rien à montrer — la fenêtre se referme
 * d'elle-même au lieu de rester ouverte pour rien devant Raphaël, qui n'est
 * jamais en train de la regarder.
 */
function SansSession() {
  useEffect(() => {
    BulleEcoute.fermer().catch(() => {})
  }, [])
  return null
}

export function BulleEcoutePage() {
  const { session, loading } = useAuth()

  if (loading) return null

  if (!session) return <SansSession />

  return (
    <JarvisDataProvider>
      <OverlayMicContent
        cache
        onIdle={() => {
          BulleEcoute.fermer().catch(() => {})
        }}
      />
    </JarvisDataProvider>
  )
}
