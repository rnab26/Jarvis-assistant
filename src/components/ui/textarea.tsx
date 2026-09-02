import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Zone de texte qui grandit toute seule avec le contenu saisi.
 *
 * On ajuste la hauteur en JS plutôt qu'avec `field-sizing-content` : cette
 * propriété CSS n'est pas encore supportée par toutes les WebView Android sur
 * lesquelles tourne l'app Capacitor.
 */
function Textarea({
  className,
  rows = 3,
  onChange,
  value,
  ...props
}: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const resize = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    // La hauteur suit le contenu, mais reste plafonnée par le `max-h` CSS pour
    // que le dialogue ne déborde jamais de l'écran (au-delà, on scrolle).
    const maxHeight = Number.parseFloat(getComputedStyle(el).maxHeight)
    const height = Number.isFinite(maxHeight)
      ? Math.min(el.scrollHeight, maxHeight)
      : el.scrollHeight
    el.style.height = `${height}px`
    el.style.overflowY = el.scrollHeight > height ? "auto" : "hidden"
  }, [])

  // Recalcule aussi quand la valeur change sans frappe (ouverture du dialogue,
  // texte dicté à la voix, réinitialisation du formulaire).
  React.useLayoutEffect(resize, [resize, value])

  return (
    <textarea
      ref={ref}
      rows={rows}
      data-slot="textarea"
      value={value}
      onChange={(e) => {
        resize()
        onChange?.(e)
      }}
      className={cn(
        "max-h-[45vh] w-full min-w-0 resize-none overflow-hidden rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
