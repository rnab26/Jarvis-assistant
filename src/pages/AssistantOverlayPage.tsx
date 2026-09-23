import { MicButton } from "@/components/voice/MicButton"
import { JarvisDataProvider, useJarvisData } from "@/contexts/JarvisDataContext"
import { resumerConsommation } from "@/lib/consommationModele"
import { useAuth } from "@/hooks/useAuth"
import { AssistOverlay } from "@/lib/assistOverlayPlugin"
import { geocodePlace } from "@/lib/geocodePlace"
import { messagesProgrammesApi } from "@/lib/messagesProgrammes"

/**
 * Ce que voit l'appui long : pas le tableau de bord, juste le micro, dans la
 * fenêtre en surcouche ouverte par AssistOverlayActivity. Mêmes données et
 * mêmes actions que l'app normale (même JarvisDataProvider), sans sa
 * barre latérale ni ses pages.
 *
 * PARTAGÉ avec BulleEcoutePage (src/pages/BulleEcoutePage.tsx) depuis le
 * 15 sept. 2026 : même câblage de données, même MicButton, seule la
 * présentation change (`cache`) et ce qui referme la fenêtre (`onIdle`).
 * Deux copies de ce branchement auraient fini par diverger, comme
 * `cleTheme`/`cle_section` le rappelle ailleurs dans ce projet.
 */
export function OverlayMicContent({ onIdle, cache = false }: { onIdle: () => void; cache?: boolean }) {
  const {
    tasksState,
    devItemsState,
    documentsState,
    contactsState,
    placeRemindersState,
    pronunciationsState,
    notesState,
    entrainementState,
    geofenceState,
    wakeWordState,
    dialogueState,
    voiceState,
    widgetState,
    devSectionsState,
    consommationState,
  } = useJarvisData()

  return (
    <div
      className={
        cache
          ? "sr-only"
          : "flex ecran-plein flex-col items-center justify-center gap-2 rounded-t-3xl bg-background/95 px-6 pb-10 pt-8"
      }
    >
      <MicButton
        tasksApi={tasksState}
        devItemsApi={devItemsState}
        devSectionsApi={devSectionsState}
        documentsApi={documentsState}
        contactsApi={contactsState}
        placeRemindersApi={{
          ...placeRemindersState,
          geocodePlace: geofenceState.enabled ? geocodePlace : null,
        }}
        messagesProgrammesApi={messagesProgrammesApi}
        pronunciationsApi={pronunciationsState}
        notesApi={notesState}
        voiceSettingApi={{ muted: voiceState.muted, setMuted: voiceState.setMuted }}
        widgetApi={{ config: widgetState.config, setConfig: widgetState.setConfig }}
        wakeWordEnabled={wakeWordState.enabled}
        seuilAbandonVeille={wakeWordState.seuilAbandon}
        consommation={
          consommationState.lignes === null ? null : resumerConsommation(consommationState.lignes)
        }
        setWakeWordEnabled={wakeWordState.setEnabled}
        setGeofenceEnabled={geofenceState.setEnabled}
        entrainementApi={{
          sequences: entrainementState.sequences,
          addSequence: entrainementState.addSequence,
          rejouer: entrainementState.rejouer,
        }}
        voiceIndex={voiceState.voiceIndex}
        confirmerResultatVoix={voiceState.confirmerResultat}
        suiteMs={dialogueState.suiteMs}
        onIdle={onIdle}
        sansOnglets
      />
    </div>
  )
}

/** Le message d'accueil, partagé lui aussi — seule la fenêtre invisible de
 * la bulle (BulleEcoutePage) ne l'affiche jamais : personne n'est devant
 * elle pour le lire, et rien n'y attend un appui. */
export function PasDeSession({ cache = false }: { cache?: boolean }) {
  if (cache) return null
  return (
    <div className="flex ecran-plein items-center justify-center rounded-t-3xl bg-background/95 px-6 py-8 text-center text-sm text-muted-foreground">
      Connecte-toi dans Jarvis pour utiliser cette fenêtre.
    </div>
  )
}

export function AssistantOverlayPage() {
  const { session, loading } = useAuth()

  if (loading) return null

  if (!session) return <PasDeSession />

  return (
    <JarvisDataProvider>
      <OverlayMicContent
        onIdle={() => {
          AssistOverlay.fermer().catch(() => {})
        }}
      />
    </JarvisDataProvider>
  )
}
