import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Star } from "lucide-react"
import { ActionsTelephone, type ApplicationInstallee } from "@/lib/actionsTelephone"
import { appPreferee, CLES_APP } from "@/lib/actionsTelephoneVocales"
import {
  EXEMPLE_FAVORITE,
  etatConnecteurs,
  exemplePour,
  filtrerApps,
} from "@/lib/appsIA"
import { ecrireReglage } from "@/lib/reglages"

/**
 * « Tes applications d'IA » : celles qui sont sur son téléphone, et celle qui
 * répond quand il dit « cherche… » sans en nommer aucune.
 *
 * Sa demande du 5 sept. : « dans les paramètres on branche toutes nos
 * applications d'IA disponibles sur notre téléphone et on valide une
 * application favorite pour les recherches web ». Et « en vrai on peut même
 * le faire pour toutes les applis » — d'où le choix libre en bas.
 *
 * IL N'Y A RIEN À BRANCHER, et c'est dit ici plutôt que caché : Jarvis passe
 * la question à l'application par un intent Android, elle répond avec SON
 * abonnement, sur SON téléphone. Aucune clé, aucun compte, rien de facturé —
 * c'est sa demande, « je ne veux pas payer, je veux profiter des applications
 * que je paye déjà ».
 *
 * Une seule clé enregistrée, `jarvis_app_ia`, celle qui existait déjà. Cette
 * carte remplace la ligne « Question à une IA » de « Tes applications par
 * défaut », qui savait l'afficher et l'oublier, rien de plus.
 */
export function ConnecteursIA() {
  const [apps, setApps] = useState<ApplicationInstallee[] | null | "chargement">("chargement")
  const [favorite, setFavorite] = useState<string | null>(() => appPreferee("ia"))
  const [recherche, setRecherche] = useState("")
  const [toutMontrer, setToutMontrer] = useState(false)

  const relire = useCallback(async () => {
    try {
      const r = await ActionsTelephone.listerApplications()
      setApps(r.applications ?? [])
    } catch {
      // Hors de l'app empaquetée : il n'y a pas d'applications à lister. Ce
      // n'est pas une panne, et ça ne se dit pas comme une panne.
      setApps(null)
    }
    setFavorite(appPreferee("ia"))
  }, [])

  useEffect(() => {
    void relire()
  }, [relire])

  function choisir(nom: string) {
    ecrireReglage(CLES_APP.ia, nom)
    setFavorite(nom)
  }

  function oublier() {
    ecrireReglage(CLES_APP.ia, null)
    setFavorite(null)
  }

  const etat = etatConnecteurs(apps === "chargement" ? [] : apps)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tes applications d'IA</CardTitle>
        <CardDescription>
          Celle que tu choisis ici répond quand tu dis « cherche… » sans nommer personne. Tu peux
          toujours en viser une autre à la voix, en la nommant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {apps === "chargement" ? (
          <p className="text-xs text-muted-foreground">Je regarde ce que tu as sur ton téléphone…</p>
        ) : etat.etat === "hors_app" ? (
          <p className="text-xs text-muted-foreground">
            La liste ne s'affiche que dans l'application installée sur le téléphone.
          </p>
        ) : (
          <>
            {etat.etat === "aucune" ? (
              <p className="text-xs text-muted-foreground">
                Je ne reconnais aucune application d'IA parmi les {etat.autres} installées. Tu peux
                quand même en choisir une ci-dessous : Jarvis lui passera la question comme aux
                autres.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {etat.ia.map((app) => (
                  <button
                    key={app.paquet}
                    type="button"
                    aria-pressed={favorite === app.nom}
                    onClick={() => choisir(app.nom)}
                    className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${
                      favorite === app.nom
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {favorite === app.nom && <Star className="h-3 w-3 fill-current" />}
                    {app.nom}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-lg border p-3">
              {favorite ? (
                <>
                  <p className="text-xs">
                    <span className="font-medium">{favorite}</span> répond quand tu ne nommes
                    personne. Dis {EXEMPLE_FAVORITE}.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pour en viser une autre sans changer ce réglage : {exemplePour("ChatGPT")}.
                  </p>
                  <Button variant="ghost" size="sm" className="mt-1 h-7 px-2" onClick={oublier}>
                    Oublier ce choix
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aucune favorite : Jarvis te demandera laquelle la prochaine fois que tu diras
                  « cherche… » sans en nommer une.
                </p>
              )}
            </div>

            {etat.etat === "trouvees" && !toutMontrer && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setToutMontrer(true)}
                className="h-8 text-xs"
              >
                Choisir une autre application
              </Button>
            )}

            {(toutMontrer || etat.etat === "aucune") && (
              <div className="space-y-2">
                <Input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Chercher une application"
                  className="h-8 text-xs"
                />
                <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                  {filtrerApps(
                    etat.etat === "trouvees" ? etat.autres : (apps as ApplicationInstallee[]),
                    recherche,
                  )
                    .slice(0, 60)
                    .map((app) => (
                      <button
                        key={app.paquet}
                        type="button"
                        aria-pressed={favorite === app.nom}
                        onClick={() => choisir(app.nom)}
                        className={`rounded-md border px-2 py-1.5 text-xs ${
                          favorite === app.nom
                            ? "border-primary bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {app.nom}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Il n'y a rien à brancher et rien à payer : Jarvis passe la question à l'application, elle
          répond avec ton abonnement, sur ton téléphone. Il ne se connecte pas à ton compte. Pour
          récupérer la réponse dans Jarvis, appuie longuement dessus et fais « Partager » vers
          Jarvis — il la range avec ta question.
        </p>
      </CardContent>
    </Card>
  )
}
