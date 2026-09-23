import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { JarvisDataContext } from "@/contexts/JarvisDataContext"
import type { ContactTelephone } from "@/lib/actionsTelephone"
import type { MessageProgramme, ModificationMessage, StatutMessage } from "@/lib/messagesProgrammes"
import type { LectureRepertoire } from "@/lib/repertoire"
import { ProgrammesPage } from "@/pages/ProgrammesPage"

/**
 * Banc d'essai de l'écran « Programmé » (chantiers 0c0193e3 et a122a936).
 *
 * Il monte la VRAIE `ProgrammesPage`, avec un `programmesState` fabriqué
 * passé par `JarvisDataContext` — même principe que le banc des documents.
 * Avant le 23 sept. il en RECOPIAIT le balisage : toute retouche de la page
 * devait être refaite ici à la main, et le banc aurait jugé un écran qui
 * n'existe plus le jour où quelqu'un l'aurait oublié.
 *
 * Le répertoire du téléphone est un faux, injecté par la prop `lireContacts`
 * de la page (le vrai n'existe que sur l'appareil). `?repertoire=refuse` le
 * fait refuser ; `?etat=chargement|erreur|vide` montre les trois états.
 */

const MINUTE = 60_000
const HEURE = 60 * MINUTE
const JOUR = 24 * HEURE
const maintenant = Date.now()
const dans = (ms: number) => new Date(maintenant + ms).toISOString()

function message(
  id: string,
  destinataire: string,
  canal: MessageProgramme["canal"],
  texte: string,
  envoyer_a: string,
  statut: StatutMessage,
  verifie?: { contact_nom: string; telephone: string },
): MessageProgramme {
  return {
    id,
    canal,
    contact_id: null,
    destinataire,
    contact_nom: verifie?.contact_nom ?? null,
    telephone: verifie?.telephone ?? null,
    texte,
    envoyer_a,
    statut,
    annonce_a: statut === "annonce" ? envoyer_a : null,
    created_at: envoyer_a,
  }
}

const MESSAGES_INITIAUX: MessageProgramme[] = [
  message("m1", "Dylan (client de Mélissa)", null, "On en est où pour le chantier ?", dans(JOUR), "prevu"),
  message("m2", "Dan Marciano", "whatsapp", "Je te rappelle demain matin.", dans(JOUR + 9 * HEURE), "annonce", {
    contact_nom: "Dan Marciano",
    telephone: "+972 50-123-4567",
  }),
  message("m3", "Mel", "sms", "Bien arrivé.", dans(-6 * JOUR), "envoye"),
  message("m4", "Fournisseur carreaux", "whatsapp", "Commande annulée finalement.", dans(-7 * JOUR), "annule"),
  // Le cas réel du 22 sept. : un nom qui répond deux fois dans le répertoire…
  message("m5", "Harry", "whatsapp", "Salut Harry, tu ne m'as toujours pas répondu.", dans(2 * HEURE), "prevu"),
  // …et un message enregistré « ce contact », dont l'heure est passée.
  message("m6", "ce contact", "whatsapp", "Réponds-moi dès que possible.", dans(-JOUR), "prevu"),
]

const REPERTOIRE: ContactTelephone[] = [
  { nom: "Harry Locataire Bureau", numero: "+972 54-111-2233", etiquette: "mobile" },
  { nom: "Harry Cohen", numero: "+972 52-999-8877", etiquette: "mobile" },
  { nom: "Dylan Cohen", numero: "+972 53-444-5566", etiquette: "mobile" },
  { nom: "Dan Marciano", numero: "+972 50-123-4567", etiquette: "mobile" },
  { nom: "Mickaël Bensoussan", numero: "+972 58-777-6655", etiquette: "mobile" },
]

const params = new URLSearchParams(location.search)

async function fauxRepertoire(): Promise<LectureRepertoire> {
  await new Promise((r) => setTimeout(r, 50))
  if (params.get("repertoire") === "refuse") return { etat: "refuse" }
  return { etat: "ok", contacts: REPERTOIRE }
}

function BancDesProgrammes() {
  const etat = params.get("etat")
  const [messages, setMessages] = useState<MessageProgramme[]>(etat === "vide" ? [] : MESSAGES_INITIAUX)

  async function modifier(id: string, champs: ModificationMessage) {
    setMessages((liste) =>
      liste.map((m) => (m.id === id ? { ...m, ...champs, statut: "prevu", annonce_a: null } : m)),
    )
  }
  async function annuler(id: string) {
    setMessages((liste) => liste.map((m) => (m.id === id ? { ...m, statut: "annule" } : m)))
  }

  const programmesState = {
    messages,
    loading: etat === "chargement",
    error: etat === "erreur" ? "La connexion a été coupée." : null,
    refresh: async () => {},
    modifier,
    annuler,
  }

  return (
    <JarvisDataContext.Provider
      value={{ programmesState } as unknown as React.ContextType<typeof JarvisDataContext>}
    >
      <div className="p-4">
        <Toaster />
        <ProgrammesPage lireContacts={fauxRepertoire} />
      </div>
    </JarvisDataContext.Provider>
  )
}

createRoot(document.getElementById("root")!).render(<BancDesProgrammes />)
