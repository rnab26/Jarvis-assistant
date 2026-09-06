import { ArrowRightLeft, Check, TriangleAlert } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { chantiersEgares } from "@/lib/tacheOuChantier"
import { chantiersProches } from "@/lib/doublonChantier"
import { alreadyNotified } from "@/lib/notifyError"
import type { DevItem, Task } from "@/types/database"

/**
 * « Je ne vois pas de quelles 7 lignes existantes tu parles. »
 *
 * Ses mots, le 6 sept. 2026 au matin, en réponse au chantier a88682e4. Six de
 * ses tâches étaient des chantiers dictés qui avaient atterri dans la mauvaise
 * liste, chacune portait déjà son signalement sur sa ligne — et il ne les
 * voyait pas. Avec vingt-neuf tâches réparties par catégorie, un signalement
 * posé sur la ligne ne se trouve que si on tombe dessus.
 *
 * D'où cette carte, qui les RASSEMBLE en tête de l'onglet. Elle ne fait rien
 * de neuf : elle rend visible ce que `tacheOuChantier.ts` savait déjà dire, et
 * elle propose la même conversion en un appui.
 *
 * ELLE NE S'AFFICHE PAS QUAND IL N'Y A RIEN. Une carte « aucune tâche égarée »
 * est une ligne de plus à lire dans un écran qu'on veut justement alléger.
 *
 * ET ELLE PROPOSE, ELLE NE DÉCIDE PAS — sa consigne du 6 sept. : « si Jarvis a
 * un doute [...] il faut qu'il donne une supposition à Raphaël ou bien Raphaël
 * lui indique lui-même où la placer. » Chaque ligne dit donc CE QUI l'a fait
 * reconnaître et le titre proposé, pour qu'il juge sans avoir à nous croire.
 * Rien ne bouge tant qu'il n'a pas appuyé, et la tâche est marquée faite,
 * jamais supprimée : c'est sa liste.
 *
 * ET ELLE VÉRIFIE D'ABORD QUE LE CHANTIER N'EXISTE PAS DÉJÀ. Mesuré sur ses
 * vraies données le 6 sept. : sur les six tâches égarées, QUATRE avaient déjà
 * leur chantier dans le cockpit — « savoir combien il reste de crédit »,
 * « Jarvis partagé avec Mélissa », et deux autres. Sans ce garde-fou, chaque
 * appui aurait créé un doublon de quelque chose parfois déjà livré, et fait
 * refaire à une session un travail terminé. Quand un chantier proche existe,
 * le bouton qui mène ne propose donc plus d'en créer un : il propose de
 * ranger la tâche. Créer reste possible — c'est lui qui juge, pas nous.
 */
interface ChantiersEgaresProps {
  tasks: Task[]
  /** Les chantiers du cockpit : sans eux, un appui créerait un doublon de ce
   * qui existe déjà — quatre cas sur six dans ses vraies données. */
  devItems: DevItem[]
  onEnFaireUnChantier: (task: Task, titre: string, notes: string | null) => Promise<void>
  /** Ranger la tâche sans rien créer, quand le chantier existe déjà. */
  onMarquerFaite: (task: Task) => Promise<void>
}

export function ChantiersEgares({
  tasks,
  devItems,
  onEnFaireUnChantier,
  onMarquerFaite,
}: ChantiersEgaresProps) {
  const egares = useMemo(() => chantiersEgares(tasks), [tasks])
  const [enCours, setEnCours] = useState<string | null>(null)

  if (egares.length === 0) return null

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-2">
        <CardTitle className="text-base">
          <ArrowRightLeft className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
          {egares.length} tâche{egares.length > 1 ? "s" : ""} qui {egares.length > 1 ? "sont" : "est"}{" "}
          plutôt {egares.length > 1 ? "des demandes" : "une demande"} à Claude
        </CardTitle>
        <Badge variant="destructive" className="shrink-0">
          {egares.length}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <CardDescription>
          Elles sont dans ta liste de tâches, donc aucune session ne les lit. Voici lesquelles — à
          toi de dire si j'ai raison.
        </CardDescription>

        {egares.map(({ tache, indice }) => {
          const proches = chantiersProches(`${indice.titre} ${tache.notes ?? ""}`, devItems, 2)
          const agir = async (action: () => Promise<void>) => {
            setEnCours(tache.id)
            try {
              await action()
            } catch {
              // Déjà signalé par un toast. Rien n'est annoncé comme fait : la
              // ligne ne disparaît que si la tâche a réellement changé d'état.
              alreadyNotified()
            } finally {
              setEnCours(null)
            }
          }
          const occupe = enCours === tache.id

          return (
            <div key={tache.id} className="flex flex-col gap-1 rounded-lg border border-dashed p-2">
              <p className="text-sm">{tache.title}</p>
              <p className="text-xs text-muted-foreground">
                Ça commence par {indice.indice} — comme chantier, ça s'appellerait «{" "}
                <span className="text-foreground">{indice.titre}</span> ».
              </p>

              {proches.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-destructive">
                    <TriangleAlert className="mr-1 inline size-3 align-[-1px]" />
                    Ça existe peut-être déjà dans le cockpit :
                  </p>
                  {proches.map(({ item }) => (
                    <p key={item.id} className="truncate pl-4 text-xs text-muted-foreground">
                      « {item.title} »{" "}
                      <span className="opacity-70">
                        {item.archived_at
                          ? `— livré le ${new Date(item.archived_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
                          : item.status === "in_progress"
                            ? "— en cours"
                            : "— à faire"}
                      </span>
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {proches.length > 0 ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={occupe}
                      onClick={() => agir(() => onMarquerFaite(tache))}
                    >
                      <Check className="size-3.5" />
                      {occupe ? "En cours…" : "Ranger la tâche"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      disabled={occupe}
                      onClick={() =>
                        agir(() => onEnFaireUnChantier(tache, indice.titre, tache.notes))
                      }
                    >
                      Créer quand même
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={occupe}
                    onClick={() =>
                      agir(() => onEnFaireUnChantier(tache, indice.titre, tache.notes))
                    }
                  >
                    <ArrowRightLeft className="size-3.5" />
                    {occupe ? "En cours…" : "En faire un chantier"}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
