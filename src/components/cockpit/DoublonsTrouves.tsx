import { Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { doublonsExistants, type PaireDoublon } from "@/lib/doublonsExistants"
import { proposerAnnulation } from "@/lib/annulation"
import { etatDe, type EtatChantier } from "@/hooks/useDevItems"
import type { DevItem } from "@/types/database"

/**
 * « Ça existe déjà » — pour ce qui est DÉJÀ en base.
 *
 * L'avertissement de la fenêtre d'envoi ne voit que ce qu'on tape. Un chantier
 * dicté à la voix ne passe pas par là : il arrive directement en base. C'est
 * comme ça que deux chantiers strictement identiques cohabitaient le 5 sept.
 * 2026, mot pour mot, sans que personne les voie.
 *
 * La carte reste SILENCIEUSE quand il n'y a rien — pas de « 0 doublon », pas
 * de barre vide : une ligne de plus dans un cockpit qui en a déjà beaucoup, et
 * qui n'apprendrait rien.
 */

interface DoublonsTrouvesProps {
  devItems: DevItem[]
  onArchive: (id: string) => Promise<void>
  onRestore: (etats: EtatChantier[]) => Promise<void>
}

export function DoublonsTrouves({ devItems, onArchive, onRestore }: DoublonsTrouvesProps) {
  const paires = doublonsExistants(devItems)

  if (paires.length === 0) return null

  const dejaLivres = paires.filter((p) => p.dejaLivre).length

  async function archiver(paire: PaireDoublon) {
    const avant = etatDe(paire.recent)
    await onArchive(paire.recent.id)
    proposerAnnulation("Doublon archivé", [avant], onRestore)
  }

  return (
    <CarteRepliable
        // Ouverte d'emblée : un doublon ne se voit pas autrement, et il coûte
        // une session entière quand il passe.
        ouverteParDefaut
        titre={
          <>
            <Copy className="mr-1.5 inline size-4 align-[-2px] text-muted-foreground" />
            Ça existe déjà
          </>
        }
        badge={
          <Badge variant={dejaLivres > 0 ? "destructive" : "default"} className="shrink-0">
            {paires.length} doublon{paires.length > 1 ? "s" : ""}
          </Badge>
        }
      >
        <CardContent className="flex flex-col gap-3">
          {paires.map((paire) => (
            <div
              key={`${paire.recent.id}-${paire.original.id}`}
              className="flex flex-col gap-1.5 rounded-lg border p-2.5"
            >
              <p className="text-sm font-medium">{paire.recent.title}</p>
              <p className="text-xs text-muted-foreground">
                {paire.dejaLivre ? (
                  <>
                    Redit un chantier <strong className="text-foreground">déjà livré</strong> :
                    « {paire.original.title} »
                  </>
                ) : (
                  <>Redit un chantier ouvert : « {paire.original.title} »</>
                )}
              </p>
              <p className="text-xs text-muted-foreground opacity-70">
                Mots communs : {paire.motsCommuns.join(", ")}
              </p>
              <ConfirmerAction
                trigger={
                  <Button size="sm" variant="outline" className="w-fit">
                    Archiver ce doublon
                  </Button>
                }
                titre="Archiver ce doublon ?"
                description={
                  <>
                    « {paire.recent.title} » sera archivé. L'autre reste ouvert. Tu pourras
                    annuler juste après, ou le rouvrir depuis les archivés.
                  </>
                }
                libelleConfirmation="Archiver"
                onConfirmer={() => archiver(paire)}
              />
            </div>
          ))}
          {dejaLivres > 0 && (
            <p className="text-xs text-muted-foreground">
              Un chantier qui redit du déjà livré est le plus coûteux : une session le reprend de
              zéro, refait ce qui existe, et défait parfois ce qui marchait.
            </p>
          )}
        </CardContent>
    </CarteRepliable>
  )
}
