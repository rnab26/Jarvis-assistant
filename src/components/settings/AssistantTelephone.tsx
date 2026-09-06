import { Capacitor } from "@capacitor/core"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ReglagesSysteme, type EtatAssistant } from "@/lib/reglagesSystemePlugin"

/**
 * Faire de Jarvis l'assistant du téléphone — celui que Samsung ouvre sur un
 * appui long de la touche latérale, à la place de Perplexity.
 *
 * Demande de Raphaël, 5 sept. 2026, captures à l'appui : « voici le vrai
 * paramétrage à faire pour activer Jarvis dans le téléphone, ce n'est pas
 * encore disponible ». Son chemin réel : Paramètres › Fonctions avancées ›
 * Touche latérale › Appuyer longuement › Application d'assistant numérique
 * par défaut › Autres applications.
 *
 * CE QUI QUALIFIE UNE APP, vérifié dans le code d'AOSP et pas deviné
 * (PermissionController, AssistantRoleBehavior) : DEUX branches, une activité
 * exportée répondant à ACTION_ASSIST, ou un vrai VoiceInteractionService.
 *
 * ET LA LISTE DE SAMSUNG NE REGARDE QUE LA SECONDE. Constaté par Raphaël le
 * 6 sept. 2026, captures à l'appui : Jarvis remplissait la première depuis le
 * 4 sept. et n'apparaissait toujours pas dans « Autres applications ». C'est
 * donc `service` — le VoiceInteractionService déclaré par l'APK RÉELLEMENT
 * installée — que cette carte regarde pour dire si la version installée
 * suffit. Se fier à `candidat` seul lui dirait « Jarvis peut être choisi »
 * devant une liste où il n'est pas, ce qui est le pire des messages.
 *
 * Elle interroge le système sur notre propre paquet, sur l'appareil, plutôt
 * que de supposer d'après le dépôt : depuis la mise à jour rapide, une
 * interface récente tourne souvent dans une coquille Android plus ancienne,
 * et c'est la coquille qui porte le manifeste.
 *
 * ET ON NE PEUT PAS OUVRIR LA BONNE PAGE DIRECTEMENT : l'action qui y mène
 * (MANAGE_DEFAULT_APP + EXTRA_ROLE_NAME) est protégée par une permission de
 * signature, et le rôle assistant est `requestable="false"` dans roles.xml,
 * donc la fenêtre en un geste de RoleManager est fermée elle aussi. Le
 * bouton ouvre l'écran public le plus proche, et le chemin reste écrit
 * dessous pour les derniers pas.
 */

/**
 * Ce que la carte a besoin de savoir faire. Injectable — comme la carte des
 * notifications reçoit son `api` — pour que les trois états (pas candidat,
 * candidat, actif) se parcourent sur un écran de téléphone dans le banc
 * `scripts/verifier-reglages-web.mjs`. Sans ce joint, seul l'état d'erreur
 * serait vérifiable hors d'Android, et c'est justement celui qui compte le
 * moins.
 */
export interface PontAssistant {
  natif: boolean
  lire: () => Promise<EtatAssistant>
  ouvrir: () => Promise<{ ecran: string }>
}

const PONT_REEL: PontAssistant = {
  natif: Capacitor.isNativePlatform(),
  lire: () => ReglagesSysteme.etatAssistant(),
  ouvrir: () => ReglagesSysteme.ouvrirReglagesAssistant(),
}

const CHEMIN = [
  "Paramètres › Fonctions avancées › Touche latérale",
  "Appuyer longuement › Assistant numérique",
  "« Application d'assistant numérique par défaut »",
  "Autres applications › Jarvis",
]

type Etat =
  | { pret: false }
  | { pret: true; web: true }
  | { pret: true; web: false; assistant: EtatAssistant | null }

export function AssistantTelephone({ pont = PONT_REEL }: { pont?: PontAssistant }) {
  const [etat, setEtat] = useState<Etat>({ pret: false })
  const [occupe, setOccupe] = useState(false)

  const relire = useCallback(async () => {
    if (!pont.natif) {
      setEtat({ pret: true, web: true })
      return
    }
    try {
      const assistant = await pont.lire()
      setEtat({ pret: true, web: false, assistant })
    } catch {
      // Méthode absente du plugin : l'APK installée est antérieure à cette
      // interface (c'est possible depuis la mise à jour rapide, qui ne
      // remplace que le web). `null` dit « je n'ai pas pu demander », et
      // l'écran affiche alors exactement le même conseil qu'un « pas
      // candidat » : installer l'APK.
      setEtat({ pret: true, web: false, assistant: null })
    }
  }, [pont])

  useEffect(() => {
    void relire()
  }, [relire])

  async function ouvrir() {
    setOccupe(true)
    try {
      const { ecran } = await pont.ouvrir()
      if (ecran !== "assistant") {
        toast.info("L'écran exact n'existe pas sur ce téléphone", {
          description: "Suis le chemin affiché sous le bouton pour les derniers pas.",
        })
      }
    } catch {
      toast.error("Impossible d'ouvrir les réglages depuis ici", {
        description: "Installe la dernière APK pour que le bouton fonctionne.",
      })
    } finally {
      setOccupe(false)
    }
  }

  async function reverifier() {
    setOccupe(true)
    try {
      await relire()
      toast.success("État revérifié.")
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">L'appui long sur la touche latérale</CardTitle>
        <CardDescription>
          Faire de Jarvis l'assistant du téléphone, à la place de celui d'origine.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!etat.pret && <p className="text-sm text-muted-foreground">Vérification…</p>}

        {etat.pret && etat.web && (
          <p className="text-sm text-muted-foreground">
            Ce réglage n'existe que dans l'application installée sur le téléphone. Depuis le
            navigateur, il n'y a pas de touche latérale à régler.
          </p>
        )}

        {etat.pret && !etat.web && (
          <>
            {(etat.assistant === null ||
              !etat.assistant.candidat ||
              etat.assistant.service !== true) && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">
                  La version installée ne sait pas encore se déclarer comme assistant.
                </p>
                <p className="mt-1 text-muted-foreground">
                  C'est pour ça que Jarvis n'apparaît pas dans la liste d'Android. Samsung n'y
                  montre que les applications qui déclarent un vrai service d'assistance, et
                  celle qui est installée ne le fait pas. Installe la dernière APK depuis la
                  carte « Mettre à jour l'application » : la mise à jour rapide ne suffit pas,
                  elle ne remplace que l'interface, pas la coquille Android qui porte cette
                  déclaration.
                </p>
              </div>
            )}

            {etat.assistant?.service === true && etat.assistant.role === "actif" && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                <p className="font-medium">Jarvis est l'assistant du téléphone.</p>
                <p className="mt-1 text-muted-foreground">
                  Un appui long sur la touche latérale l'ouvre, sans déverrouiller ni chercher
                  l'application.
                </p>
              </div>
            )}

            {etat.assistant?.service === true && etat.assistant.role !== "actif" && (
              <p className="text-sm text-muted-foreground">
                {etat.assistant.role === "inactif"
                  ? "Jarvis peut être choisi comme assistant, mais ce n'est pas lui pour l'instant."
                  : "Jarvis peut être choisi comme assistant. Ce téléphone ne dit pas lequel est actif."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={ouvrir} disabled={occupe}>
                Ouvrir le réglage Android
              </Button>
              <Button variant="outline" onClick={reverifier} disabled={occupe}>
                Revérifier
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              <p className="mb-1">Le chemin, une fois dans les réglages :</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                {CHEMIN.map((pas) => (
                  <li key={pas}>{pas}</li>
                ))}
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
