import { Ban, Pencil } from "lucide-react"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { MessageProgrammeFormDialog } from "@/components/programmes/MessageProgrammeFormDialog"
import { Toaster } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  libelleStatut,
  type MessageProgramme,
  type ModificationMessage,
  type StatutMessage,
} from "@/lib/messagesProgrammes"

/**
 * Banc d'essai de l'écran « Programmé » (chantier 0c0193e3) — les VRAIS
 * composants (MessageProgrammeFormDialog, ConfirmerAction), montés hors de
 * Supabase avec un état local. Reprend la même structure que
 * ProgrammesPage.tsx, sans passer par le contexte : voir
 * scripts/verifier-programmes-web.mjs.
 *
 * LE BALISAGE DE CE FICHIER RECOPIE ProgrammesPage.tsx (le banc ne monte pas
 * la vraie page, faute de contexte Supabase) : toute retouche de l'une va
 * dans l'autre, sinon le banc juge un écran qui n'existe pas.
 */

function message(
  id: string,
  destinataire: string,
  canal: MessageProgramme["canal"],
  texte: string,
  envoyer_a: string,
  statut: StatutMessage,
): MessageProgramme {
  return {
    id,
    canal,
    contact_id: null,
    destinataire,
    texte,
    envoyer_a,
    statut,
    annonce_a: statut === "annonce" ? envoyer_a : null,
    created_at: envoyer_a,
  }
}

const MESSAGES_INITIAUX: MessageProgramme[] = [
  message(
    "m1",
    "Dylan (client de Mélissa)",
    null,
    "On en est où pour le chantier ?",
    "2026-09-19T09:00:00Z",
    "prevu",
  ),
  message(
    "m2",
    "Dan Marciano",
    "whatsapp",
    "Je te rappelle demain matin.",
    "2026-09-19T18:00:00Z",
    "annonce",
  ),
  message("m3", "Mel", "sms", "Bien arrivé.", "2026-09-17T07:30:00Z", "envoye"),
  message(
    "m4",
    "Fournisseur carreaux",
    "whatsapp",
    "Commande annulée finalement.",
    "2026-09-16T12:00:00Z",
    "annule",
  ),
]

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

function modifiable(statut: StatutMessage): boolean {
  return statut === "prevu" || statut === "annonce"
}

function BancDesProgrammes() {
  const [messages, setMessages] = useState<MessageProgramme[]>(MESSAGES_INITIAUX)

  async function modifier(id: string, champs: ModificationMessage) {
    setMessages((liste) =>
      liste.map((m) => (m.id === id ? { ...m, ...champs, statut: "prevu", annonce_a: null } : m)),
    )
  }
  async function annuler(id: string) {
    setMessages((liste) => liste.map((m) => (m.id === id ? { ...m, statut: "annule" } : m)))
  }

  const triees = [...messages].sort(
    (a, b) => new Date(a.envoyer_a).getTime() - new Date(b.envoyer_a).getTime(),
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <Toaster />
      <p className="text-sm text-muted-foreground">
        Tout ce que Jarvis doit envoyer plus tard — programmé à la voix. Ici tu
        peux le vérifier, corriger l'heure, le texte ou le destinataire, ou
        annuler un envoi.
      </p>

      {triees.length === 0 ? (
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
                    <Badge variant={couleurStatut(m.statut)}>{libelleStatut(m.statut)}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    À {m.destinataire} · {libelleCanal(m.canal)}
                  </p>
                  <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap">{m.texte}</p>
                </div>
                {modifiable(m.statut) && (
                  <>
                    <MessageProgrammeFormDialog
                      message={m}
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
                          Le message à « {m.destinataire} » prévu {formatHeurePrevue(m.envoyer_a)} ne
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

createRoot(document.getElementById("root")!).render(<BancDesProgrammes />)
