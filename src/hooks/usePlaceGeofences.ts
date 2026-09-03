import { Capacitor } from "@capacitor/core"
import { useEffect } from "react"
import { Geofence } from "@/lib/geofencePlugin"
import type { PlaceReminder } from "@/types/database"

const isNative = Capacitor.isNativePlatform()

/**
 * Tient les géofences natives à jour avec les rappels de lieu géolocalisés
 * (lat/lng renseignés) — dès que la liste change ou que l'option est
 * activée/désactivée dans Paramètres. Pas de ré-enregistrement au
 * redémarrage du téléphone (limite connue des géofences Android) : cette
 * synchronisation à l'ouverture de l'app comble l'essentiel du manque.
 */
export function usePlaceGeofences(placeReminders: PlaceReminder[], geofenceEnabled: boolean) {
  useEffect(() => {
    if (!isNative) return

    if (!geofenceEnabled) {
      Geofence.removeAll().catch(() => {})
      return
    }

    const geolocalises = placeReminders
      .filter((p) => p.lat !== null && p.lng !== null)
      .map((p) => ({ id: p.id, place: p.place, reminder: p.reminder, lat: p.lat!, lng: p.lng! }))

    Geofence.syncGeofences({ reminders: geolocalises }).catch(() => {
      // Permission pas encore accordée, ou refusée : on réessaiera au
      // prochain changement de liste plutôt que de bloquer l'app.
    })
  }, [placeReminders, geofenceEnabled])
}
