import { Capacitor } from "@capacitor/core"
import type { SystemeVoixApi } from "@/lib/voiceActions"
import type { Consommation } from "@/lib/consommationModele"
import type { useMajWeb } from "@/hooks/useMajWeb"
import type { useUpdateCheck } from "@/hooks/useUpdateCheck"

/**
 * Ce que le micro doit savoir de l'app pour « mets-toi à jour » et « il me
 * reste du crédit ? » — construit au même endroit pour les deux fenêtres qui
 * montent un micro (l'app et l'appui long), sinon l'une finirait par dire
 * autre chose que l'autre.
 */
export function systemeVoix(
  update: ReturnType<typeof useUpdateCheck>,
  majWeb: ReturnType<typeof useMajWeb>,
  consommation: Consommation | null,
): SystemeVoixApi {
  return {
    maj: {
      natif: Capacitor.isNativePlatform(),
      status: update.status,
      buildPublie: update.published?.buildNumber ?? null,
      rapidePossible: majWeb.verdict?.possible === true,
      raison: majWeb.verdict && !majWeb.verdict.possible ? majWeb.verdict.raison : null,
    },
    appliquerMaj: majWeb.appliquer,
    consommation,
  }
}
