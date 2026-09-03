import { registerPlugin } from "@capacitor/core"

interface GeofenceReminderEntry {
  id: string
  place: string
  reminder: string
  lat: number
  lng: number
}

interface GeofencePlugin {
  requestLocationPermissions(): Promise<{ granted: boolean; backgroundGranted: boolean }>
  hasBackgroundPermission(): Promise<{ granted: boolean }>
  openLocationSettings(): Promise<void>
  syncGeofences(options: { reminders: GeofenceReminderEntry[] }): Promise<void>
  removeAll(): Promise<void>
}

/** Pont vers le plugin natif Android (android/.../GeofencePlugin.java).
 * N'existe que dans l'app empaquetée. */
export const Geofence = registerPlugin<GeofencePlugin>("Geofence")
