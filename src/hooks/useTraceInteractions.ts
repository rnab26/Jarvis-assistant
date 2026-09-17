import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { libelleElement, noterAppui, noterEcranActuel } from "@/lib/contexteInteraction"

/**
 * Les éléments dont un appui veut dire quelque chose : des boutons, des
 * liens, les contrôles de formulaire (interrupteurs, cases, champs). Un clic
 * ailleurs (le fond d'une carte, un titre) ne raconte rien de précis et ne
 * doit pas écraser le dernier vrai appui connu.
 */
const SELECTEUR_INTERACTIF =
  "button, a[href], [role='button'], [role='switch'], [role='menuitem'], [role='tab'], [role='checkbox'], input, select, textarea"

/**
 * Alimente `contexteInteraction.ts` avec l'écran affiché et le dernier
 * élément touché. Montée UNE FOIS, à l'intérieur du routeur — voir App.tsx —
 * pour que `useLocation()` fonctionne aussi bien dans l'app normale que dans
 * la fenêtre d'assistance.
 *
 * Chantier 6d94ab6a, 17 sept. 2026 : Raphaël veut comprendre après coup
 * comment Jarvis se comporte, à la voix ET au clic. `journalEcoute.ts` et
 * `erreurs.ts` lisent l'état que ce hook écrit ; il ne fait que ça, écrire —
 * toute la décision (ce qui reste pertinent, comment le formuler) est dans
 * le module pur, vérifiable sans navigateur.
 */
export function useTraceInteractions(): void {
  const location = useLocation()

  useEffect(() => {
    noterEcranActuel(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    const ecouteur = (event: MouseEvent) => {
      const cible = event.target
      if (!(cible instanceof Element)) return
      const element = cible.closest(SELECTEUR_INTERACTIF)
      if (!element) return
      noterAppui(libelleElement(element.getAttribute("aria-label"), element.textContent))
    }
    // Capture, pas bulle : un composant qui arrête la propagation (un menu,
    // une boîte de dialogue) ne doit pas empêcher de savoir sur quoi on a
    // cliqué — c'est justement le genre d'interaction qu'on veut voir.
    document.addEventListener("click", ecouteur, { capture: true })
    return () => document.removeEventListener("click", ecouteur, { capture: true })
  }, [])
}
