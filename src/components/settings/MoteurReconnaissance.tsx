import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ApplicationInstallee } from "@/lib/actionsTelephone"
import { REGLAGES_RESTAURES } from "@/lib/reglages"
import {
  choisirServiceReconnaissance,
  listerServicesReconnaissance,
  serviceReconnaissanceSouhaite,
} from "@/lib/reconnaissanceVocale"

/**
 * Quel moteur de reconnaissance vocale Android transcrit ce que Raphaël dit
 * — le mot-clé « Jarvis » comme les commandes qui suivent.
 *
 * Sa demande, 7 sept. 2026, verbatim : « Écrire le code nécessaire pour que
 * ce soit branchable et sélectionnable depuis l'app Jarvis même à tout
 * moment ». Avant, l'app choisissait toute seule (Google si présent, sinon
 * le service par défaut d'Android) sans qu'on puisse le voir ni en changer
 * ailleurs que dans le code. Sur son téléphone à ce jour, mesuré dans
 * journal_ecoute, le service de Google n'est pas installé : c'est le
 * service par défaut qui tourne, moins stable (voir les chantiers
 * ba140853 / 6b33ee97) — cette carte lui permet d'essayer un autre moteur
 * s'il en installe un, sans attendre une nouvelle session Claude Code.
 */
export function MoteurReconnaissance() {
  const [souhaite, setSouhaite] = useState<string | null>(null)
  const [services, setServices] = useState<ApplicationInstallee[] | null>(null)

  function relire() {
    setSouhaite(serviceReconnaissanceSouhaite())
  }

  useEffect(() => {
    relire()
    listerServicesReconnaissance().then(setServices)
    window.addEventListener(REGLAGES_RESTAURES, relire)
    return () => window.removeEventListener(REGLAGES_RESTAURES, relire)
  }, [])

  function choisir(paquet: string | null) {
    choisirServiceReconnaissance(paquet)
    relire()
  }

  const choisiEncoreInstalle = souhaite !== null && services?.some((s) => s.paquet === souhaite)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moteur de reconnaissance vocale</CardTitle>
        <CardDescription>
          Ce qui transcrit ta voix — le mot-clé « Jarvis » comme tes commandes. « Automatique »
          choisit Google s'il est installé, sinon le service par défaut du téléphone.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {services === null ? (
          <p className="text-xs text-muted-foreground">
            Ce choix ne s'affiche que dans l'application installée sur le téléphone.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={souhaite === null}
                onClick={() => choisir(null)}
                className={`rounded-md border px-2 py-1.5 text-xs ${
                  souhaite === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Automatique
              </button>
              {services.map((service) => (
                <button
                  key={service.paquet}
                  type="button"
                  aria-pressed={souhaite === service.paquet}
                  onClick={() => choisir(service.paquet)}
                  className={`rounded-md border px-2 py-1.5 text-xs ${
                    souhaite === service.paquet
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {service.nom}
                </button>
              ))}
            </div>
            {services.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Un seul moteur trouvé sur ce téléphone : rien à choisir de plus qu'« Automatique ».
              </p>
            )}
            {souhaite !== null && !choisiEncoreInstalle && (
              <p className="text-xs text-destructive">
                Le moteur choisi n'est plus trouvé sur ce téléphone (désinstallé depuis ?). Jarvis
                est retombé sur « Automatique » en attendant que tu en choisisses un autre.
              </p>
            )}
            {souhaite !== null && (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => choisir(null)}>
                Revenir à « Automatique »
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
