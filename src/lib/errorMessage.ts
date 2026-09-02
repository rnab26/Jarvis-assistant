/**
 * Message lisible à afficher pour une erreur de chargement (erreur Supabase,
 * erreur réseau, ou n'importe quoi d'autre remonté par un `catch`).
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === "string" && message) return message
  }
  return "Erreur inconnue"
}
