import { useTheme } from "next-themes"
import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireReglage } from "@/lib/reglages"
import { CHOIX_THEME, estChoixTheme, THEME_KEY, type ChoixTheme } from "@/lib/theme"

/**
 * Le thème de l'application.
 *
 * next-themes écrit lui-même dans le stockage local, mais il ne prévient
 * personne : sans le `ecrireReglage` ci-dessous, le choix ne remonterait
 * jamais en base et serait perdu à la prochaine réinstallation — exactement
 * le défaut que le chantier permanent 776235be existe pour empêcher.
 */
export function Theme() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const actuel: ChoixTheme = estChoixTheme(theme) ? theme : "system"

  // La base gagne à la connexion : elle écrit la clé dans le stockage local,
  // mais next-themes garde son propre état en mémoire. Sans cette relecture,
  // l'écran resterait sur le thème de cet appareil après une restauration.
  useRelireApresRestauration(() => {
    try {
      const recu = localStorage.getItem(THEME_KEY)
      // Clé absente = remise à zéro des réglages : on retombe sur « comme le
      // téléphone », sinon l'écran garderait le thème choisi avant.
      const cible: ChoixTheme = estChoixTheme(recu) ? recu : "system"
      if (cible !== theme) setTheme(cible)
    } catch {
      // Stockage illisible : on garde le thème en cours.
    }
  })

  // Au tout premier lancement, rien n'est enregistré : on inscrit le choix
  // par défaut pour qu'il parte en base comme les autres réglages, au lieu
  // d'être « absent » et de repartir de zéro sur chaque appareil.
  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === null) ecrireReglage(THEME_KEY, "system")
    } catch {
      // Sans stockage, le thème vaut pour la session en cours seulement.
    }
  }, [])

  function choisir(valeur: ChoixTheme) {
    setTheme(valeur)
    // next-themes vient d'écrire la même valeur ; on repasse par
    // ecrireReglage pour que la synchro l'apprenne et la pousse en base.
    ecrireReglage(THEME_KEY, valeur)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thème</CardTitle>
        <CardDescription>
          Clair, sombre, ou comme ton téléphone. Le choix suit ton compte : tu le retrouves sur le
          web et après une réinstallation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-1.5">
          {CHOIX_THEME.map(({ valeur, label }) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={actuel === valeur}
              onClick={() => choisir(valeur)}
              className={`flex-1 rounded-md border px-2 py-2 text-xs ${
                actuel === valeur
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {CHOIX_THEME.find((c) => c.valeur === actuel)?.aide}
          {actuel === "system" && resolvedTheme
            ? ` En ce moment : ${resolvedTheme === "dark" ? "sombre" : "clair"}.`
            : ""}
        </p>
      </CardContent>
    </Card>
  )
}
