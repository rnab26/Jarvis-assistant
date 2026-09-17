/**
 * Dicter dans un champ de texte : un bouton micro, un résultat, rien de
 * plus. Distinct de `src/hooks/useSpeechRecognition.ts` (le moteur
 * d'écoute de Jarvis — veille, mot-clé, tours de dialogue, session
 * Capacitor native) : ici on parle directement à l'API navigateur
 * `SpeechRecognition`, en one-shot, pour compléter un `Textarea`.
 */

type ConstructeurDictee = new () => SpeechRecognition

/** `null` sur un navigateur/WebView qui ne connaît pas l'API — c'est ce cas
 * qui doit produire un message clair plutôt qu'un bouton qui ne fait rien. */
export function constructeurDictee(): ConstructeurDictee | null {
  const w = window as unknown as {
    SpeechRecognition?: ConstructeurDictee
    webkitSpeechRecognition?: ConstructeurDictee
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Ajoute ce qui vient d'être dicté à ce qu'il y avait déjà dans le champ,
 * sans double espace ni espace en tête sur un champ vide. */
export function ajouterSegmentDicte(actuel: string, segment: string): string {
  const propre = segment.trim()
  if (!propre) return actuel
  const base = actuel.replace(/\s+$/, "")
  return base ? `${base} ${propre}` : propre
}

/** Les codes d'erreur de l'API navigateur, en phrases qu'il comprend —
 * même famille que `friendlyErrorMessage` de `useSpeechRecognition.ts`,
 * mais pour un champ de texte plutôt qu'une commande. */
export function messageErreurDictee(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Micro refusé : autorise l'accès au micro dans les réglages du navigateur."
    case "no-speech":
      return "Je n'ai rien entendu, réessaie."
    case "audio-capture":
      return "Aucun micro détecté sur cet appareil."
    case "network":
      return "Problème réseau pendant l'écoute, réessaie."
    case "aborted":
      return ""
    default:
      return `Erreur de dictée : ${code}`
  }
}
