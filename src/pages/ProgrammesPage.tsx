import { Ban, CircleCheck, Pencil } from "lucide-react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { MessageProgrammeFormDialog } from "@/components/programmes/MessageProgrammeFormDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { etatDestinataire } from "@/lib/destinataireProgramme"
import { messageManque } from "@/lib/messageAnnonce"
import { libelleStatut, type MessageProgramme, type StatutMessage } from "@/lib/messagesProgrammes"
import type { LectureRepertoire } from "@/lib/repertoire"

/** « demain à 10 h 00 » — l'heure prévue, en clair. */
function formatHeurePrevue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const jour = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
  const heure = date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return `${jour} à ${heure}`
}

function libelleCanal(canal: MessageProgramme["canal"]): string {
  if (canal === "whatsapp") return "WhatsApp"
  if (canal === "sms") return "SMS"
  return "canal pas encore choisi"
}

function couleurStatut(statut: StatutMessage): "secondary" | "default" | "outline" | "destructive" {
  switch (statut) {
    case "prevu":
      return "secondary"
    case "annonce":
      return "default"
    case "envoye":
      return "outline"
    case "annule":
      return "destructive"
  }
}

// Une fois envoyé ou annulé, il n'y a plus rien à changer à la main : ce sont
// des états définitifs, comme "envoye"/"annule" documentés dans
// messagesProgrammes.ts.
function modifiable(statut: StatutMessage): boolean {
  return statut === "prevu" || statut === "annonce"
}

/** À qui il partira — vérifié dans le répertoire, à vérifier, ou manquant
 * (chantier a122a936 : « que le contact programmé soit visible et garanti »).
 * Pour un message parti ou annulé, seul le nom compte encore. */
function Destinataire({ m, actif }: { m: MessageProgramme; actif: boolean }) {
  const d = etatDestinataire(m)
  if (d.etat === "verifie") {
    // Le numéro entier, jamais tronqué : c'est lui la garantie. Il passe à la
    // ligne plutôt que de finir en « +972 50-123-45… ».
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1">
        {actif && <CircleCheck className="size-3.5 shrink-0 text-emerald-600" aria-label="Contact vérifié" />}
        <span>À {d.libelle}</span>
        <span className="whitespace-nowrap">({d.numero})</span>
      </span>
    )
  }
  if (d.etat === "manquant") {
    return actif ? (
      <Badge variant="destructive" className="destinataire-alerte">
        Destinataire manquant
      </Badge>
    ) : (
      <span>Sans destinataire</span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>À {d.libelle}</span>
      {actif && (
        <Badge
          variant="outline"
          className="destinataire-alerte border-amber-500 text-amber-700 dark:text-amber-400"
        >
          Contact à vérifier
        </Badge>
      )}
    </span>
  )
}

export function ProgrammesPage({
  lireContacts,
}: {
  /** Le banc d'essai injecte un faux répertoire ; l'app lit le vrai. */
  lireContacts?: () => Promise<LectureRepertoire>
} = {}) {
  const { programmesState } = useJarvisData()
  const maintenant = new Date()
  const { messages, loading, error, refresh, modifier, annuler } = programmesState

  const triees = [...messages].sort(
    (a, b) => new Date(a.envoyer_a).getTime() - new Date(b.envoyer_a).getTime(),
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Tout ce que Jarvis doit envoyer plus tard — programmé à la voix. Ici tu
        peux le vérifier, corriger l'heure, le texte ou le destinataire, ou
        annuler un envoi.
      </p>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">Chargement...</p>
      ) : error ? (
        <LoadError message={error} onRetry={refresh} />
      ) : triees.length === 0 ? (
        <p id="vide" className="py-8 text-center text-muted-foreground">
          Rien n'est programmé pour l'instant. Dis « envoie un message à … demain
          à 10h » pour en créer un.
        </p>
      ) : (
        <div id="liste" className="flex flex-col gap-2">
          {triees.map((m) => (
            <Card key={m.id}>
              <CardContent className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{formatHeurePrevue(m.envoyer_a)}</p>
                    {messageManque(m, maintenant) ? (
                      // L'heure est passée sans qu'il parte (app fermée à
                      // l'heure dite) : « Prévu » mentirait.
                      <Badge variant="destructive" className="message-manque">
                        Pas parti — heure passée
                      </Badge>
                    ) : (
                      <Badge variant={couleurStatut(m.statut)}>{libelleStatut(m.statut)}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{libelleCanal(m.canal)}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    <Destinataire m={m} actif={modifiable(m.statut)} />
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap">{m.texte}</p>
                </div>
                {modifiable(m.statut) && (
                  <>
                    <MessageProgrammeFormDialog
                      message={m}
                      lireContacts={lireContacts}
                      onSubmit={(champs) => modifier(m.id, champs)}
                      trigger={
                        <Button variant="ghost" size="icon" className="zone-tactile" aria-label="Modifier">
                          <Pencil className="size-4" />
                        </Button>
                      }
                    />
                    <ConfirmerAction
                      titre="Annuler cet envoi programmé ?"
                      description={
                        <>
                          Le message à « {m.contact_nom || m.destinataire || "personne"} » prévu {formatHeurePrevue(m.envoyer_a)} ne
                          partira pas.
                        </>
                      }
                      libelleConfirmation="Annuler l'envoi"
                      destructif
                      onConfirmer={() => annuler(m.id)}
                      trigger={
                        <Button variant="ghost" size="icon" className="zone-tactile" aria-label="Annuler l'envoi">
                          <Ban className="size-4" />
                        </Button>
                      }
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
