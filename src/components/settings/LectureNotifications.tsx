import { useCallback, useEffect, useState } from "react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CLE_LECTURE_NOTIFICATIONS,
  lectureVoulue,
} from "@/lib/notificationsLues"
import {
  etatLectureNotifications,
  historiqueLectureNotifications,
  ouvrirReglagesLectureNotifications,
  type EtatLectureNotifications,
  type TraceLectureNotifications,
} from "@/lib/notificationsAndroid"
import { ecrireReglage } from "@/lib/reglages"

/**
 * « Lire tes notifications » (chantier b1b6172d).
 *
 * Réponse de Raphaël, 5 sept. 2026 : « Oui, mais il ne s'en sert que si je le
 * demande. » Il a lu et accepté que l'autorisation Android est TOTALE et
 * PERMANENTE — c'est le CODE qui se retient. Cette carte porte les trois
 * points non négociables de sa réponse :
 * 1. l'interrupteur maître, qui coupe l'accès d'un geste MÊME si Android
 *    autorise toujours Jarvis (l'inverse serait un bouton qui ment) ;
 * 2. le rappel visible que l'autorisation Android reste accordée tant qu'il
 *    ne la retire pas lui-même, avec le bouton qui y emmène ;
 * 3. l'historique des lectures — quelle app, quand — jamais leur contenu.
 */
function libelleResultat(resultat: string, compte: number | null): string {
  switch (resultat) {
    case "lu":
      return compte === 1 ? "1 notification lue" : `${compte ?? 0} notifications lues`
    case "aucune":
      return "rien à lire"
    case "service_inactif":
      return "accès non activé sur le téléphone"
    case "app_introuvable":
      return "application introuvable"
    case "coupe":
      return "lecture coupée dans Paramètres"
    default:
      return resultat
  }
}

export function LectureNotifications() {
  const [etat, setEtat] = useState<EtatLectureNotifications | null>(null)
  const [chargement, setChargement] = useState(true)
  const [voulue, setVoulue] = useState(() =>
    (() => {
      try {
        return lectureVoulue(localStorage.getItem(CLE_LECTURE_NOTIFICATIONS))
      } catch {
        return lectureVoulue(null)
      }
    })(),
  )
  const [historique, setHistorique] = useState<TraceLectureNotifications[]>([])

  const relire = useCallback(async () => {
    setEtat(await etatLectureNotifications())
    setHistorique(await historiqueLectureNotifications())
    setChargement(false)
  }, [])

  useEffect(() => {
    void relire()
    // L'accès se donne dans un écran d'Android, donc hors de l'app : sans
    // cette relecture au retour, la carte dirait encore « pas activé » juste
    // après qu'il vient de l'accorder.
    const auRetour = () => {
      if (document.visibilityState === "visible") void relire()
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => document.removeEventListener("visibilitychange", auRetour)
  }, [relire])

  function basculer(actif: boolean) {
    setVoulue(actif)
    ecrireReglage(CLE_LECTURE_NOTIFICATIONS, actif ? "1" : "0")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lire tes notifications</CardTitle>
        <CardDescription>
          Pour que Jarvis puisse te dire ce qu'il y a dans un mail ou un message affiché à
          l'écran, si tu le lui demandes. Il ne lit rien tout seul, et rien du contenu n'est
          jamais enregistré.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Interrupteur
          titre="Jarvis peut lire mes notifications si je le demande"
          actif={voulue}
          onChange={basculer}
        />

        {chargement ? (
          <p className="text-xs text-muted-foreground">Je regarde où ça en est…</p>
        ) : etat?.actif ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Autorisation accordée sur ton téléphone. {!voulue && "L'interrupteur ci-dessus la coupe côté Jarvis, sans y toucher."}
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {etat?.declare
                ? "Autorisé dans Android, mais le service n'est pas encore relié. Rouvre l'app, ou désactive puis réactive l'accès dans les réglages."
                : "Pas encore activé. C'est un accès spécial d'Android : aucun bouton de Jarvis ne peut te l'accorder, il faut le faire une fois dans les réglages du téléphone."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ouvrirReglagesLectureNotifications()}
            >
              Ouvrir les réglages d'accès aux notifications
            </Button>
          </div>
        )}

        {etat?.actif && (
          <p className="text-xs text-muted-foreground">
            À savoir : cette autorisation reste accordée jusqu'à ce que tu la retires toi-même
            dans les réglages du téléphone — l'interrupteur ci-dessus ne la retire pas, il coupe
            seulement l'usage que Jarvis en fait.
          </p>
        )}

        {historique.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <p className="text-xs font-medium">Dernières lectures</p>
            <ul className="space-y-1">
              {historique.map((ligne, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {new Date(ligne.at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" — "}
                  {ligne.demandee ? `« ${ligne.demandee} » : ` : ""}
                  {libelleResultat(ligne.resultat, ligne.compte)}
                  {ligne.applications && ligne.applications.length > 0
                    ? ` (${ligne.applications.join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
