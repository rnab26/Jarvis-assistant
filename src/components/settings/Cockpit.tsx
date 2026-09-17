import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireFenetreBilan, lireFenetreBilan } from "@/lib/cockpitPrefs"
import { ecrireModeSimplifie, lireModeSimplifie } from "@/lib/cockpitSimplifie"
import { FENETRES, type FenetreBilan } from "@/lib/ouJenSuis"

/**
 * Le réglage de « Où j'en suis », en tête du cockpit.
 *
 * La seule valeur arbitraire de ce bloc est celle-ci : à partir de quand un
 * chantier archivé compte comme « livré ». Elle est sortie du code parce
 * qu'elle a un vrai défaut selon l'heure — « aujourd'hui » veut dire « depuis
 * minuit », et à une heure du matin le travail de la soirée tombe d'un coup à
 * zéro, au moment précis où Raphaël vient voir ce qui s'est passé.
 */
export function Cockpit() {
  const [fenetre, setFenetre] = useState<FenetreBilan>(lireFenetreBilan)
  const [simplifie, setSimplifie] = useState(lireModeSimplifie)

  useRelireApresRestauration(() => {
    setFenetre(lireFenetreBilan())
    setSimplifie(lireModeSimplifie())
  })

  function choisir(valeur: FenetreBilan) {
    setFenetre(valeur)
    ecrireFenetreBilan(valeur)
  }

  function basculerSimplifie(actif: boolean) {
    setSimplifie(actif)
    ecrireModeSimplifie(actif)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Ce qui compte comme « livré »</CardTitle>
          <CardDescription>
            En tête du cockpit, « Où j'en suis » donne par section ce qui bouge, ce qui a été
            livré, ce qui t'attend et ce qui dort. Ce réglage ne change que la colonne « livré ».
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {FENETRES.map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={fenetre === valeur}
                onClick={() => choisir(valeur)}
                className={`flex-1 rounded-md border px-2 py-2 text-xs ${
                  fenetre === valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {FENETRES.find((f) => f.valeur === fenetre)?.aide}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mode simplifié</CardTitle>
          <CardDescription>
            Ne montre plus que « Ce qui attend ta décision », une question à la fois — le reste du
            cockpit (chantiers, journal, « Depuis ton dernier passage »…) reste accessible d'un
            appui, rien n'est supprimé. Le même bouton est en tête du cockpit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Interrupteur
            titre="Une question à la fois"
            description="Questions, réponses, et on passe à la suivante."
            actif={simplifie}
            onChange={basculerSimplifie}
          />
        </CardContent>
      </Card>
    </>
  )
}
