import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ContactTelephone } from "@/lib/actionsTelephone"
import { chercherContact } from "@/lib/chercherContact"
import type { ModificationMessage, MessageProgramme } from "@/lib/messagesProgrammes"
import { destinataireManquant } from "@/lib/destinataireProgramme"
import { lireRepertoire, type LectureRepertoire } from "@/lib/repertoire"

// Radix <SelectItem> refuse une valeur vide : "aucun" tient lieu de canal
// non choisi (`canal: null`), converti au moment de soumettre.
const CANAL_AUCUN = "aucun"

/** `2026-09-18T22:00` — pour un <input type="datetime-local">, en HEURE
 * LOCALE : `new Date(iso)` puis relire ses champs locaux, jamais un découpage
 * de la chaîne ISO (qui est en UTC et afficherait une heure fausse). */
function versDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** L'inverse : un `datetime-local` sans fuseau est interprété par `Date` en
 * heure LOCALE, exactement ce qu'on veut renvoyer en ISO/UTC pour la base. */
function depuisDatetimeLocal(valeur: string): string | null {
  const d = new Date(valeur)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface MessageProgrammeFormDialogProps {
  message: MessageProgramme
  onSubmit: (champs: ModificationMessage) => Promise<void>
  trigger: React.ReactNode
  /** Le répertoire du téléphone — injectable pour le banc d'essai, qui n'a
   * pas de téléphone. Par défaut, le vrai (`lireRepertoire`). */
  lireContacts?: () => Promise<LectureRepertoire>
}

/** Le contact choisi dans le répertoire : nom exact et numéro. */
type ContactChoisi = { nom: string; numero: string } | null

/** Ce que la recherche dans le répertoire a donné, pour l'afficher. */
type Recherche =
  | { etat: "repos" }
  | { etat: "en_cours" }
  | { etat: "candidats"; contacts: ContactTelephone[] }
  | { etat: "aucun" }
  | { etat: "refuse" }
  | { etat: "indisponible" }

/** Modifier À LA MAIN un envoi programmé — heure, contenu, destinataire,
 * canal (chantier 0c0193e3). Toujours une MODIFICATION d'un message
 * existant : la création se fait à la voix (schedule_message), cet écran ne
 * crée rien de son côté — ce n'est pas la même demande. */
export function MessageProgrammeFormDialog({
  message,
  onSubmit,
  trigger,
  lireContacts = lireRepertoire,
}: MessageProgrammeFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [destinataire, setDestinataire] = useState(nomAffiche(message))
  const [choisi, setChoisi] = useState<ContactChoisi>(contactDe(message))
  const [recherche, setRecherche] = useState<Recherche>({ etat: "repos" })
  const [canal, setCanal] = useState<string>(message.canal ?? CANAL_AUCUN)
  const [texte, setTexte] = useState(message.texte)
  const [envoyerA, setEnvoyerA] = useState(versDatetimeLocal(message.envoyer_a))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setDestinataire(nomAffiche(message))
      setChoisi(contactDe(message))
      setRecherche({ etat: "repos" })
      setCanal(message.canal ?? CANAL_AUCUN)
      setTexte(message.texte)
      setEnvoyerA(versDatetimeLocal(message.envoyer_a))
      // Un contact pas encore vérifié : on cherche tout de suite, pour qu'il
      // n'ait qu'à toucher le bon plutôt qu'à penser à appuyer sur « Chercher ».
      if (!message.telephone && nomAffiche(message)) void chercher(nomAffiche(message))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, message])

  async function chercher(nom: string) {
    if (!nom.trim()) return
    setRecherche({ etat: "en_cours" })
    const lecture = await lireContacts()
    if (lecture.etat !== "ok") {
      setRecherche({ etat: lecture.etat })
      return
    }
    // La MÊME règle que partout ailleurs (chercherContact) : deux homonymes
    // s'affichent tous les deux, et c'est lui qui touche le bon.
    const trouvaille = chercherContact(nom, lecture.contacts)
    if (trouvaille.etat === "trouve") setRecherche({ etat: "candidats", contacts: [trouvaille.contact] })
    else if (trouvaille.etat === "ambigu") setRecherche({ etat: "candidats", contacts: trouvaille.candidats })
    else setRecherche({ etat: "aucun" })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const nouvelleDate = depuisDatetimeLocal(envoyerA)
    if (!nouvelleDate) return
    setSubmitting(true)
    try {
      await onSubmit({
        destinataire,
        contact_nom: choisi?.nom ?? null,
        telephone: choisi?.numero ?? null,
        canal: canal === CANAL_AUCUN ? null : (canal as "whatsapp" | "sms"),
        texte,
        envoyer_a: nouvelleDate,
      })
      setOpen(false)
    } catch {
      // Déjà signalé par un toast : on garde la fenêtre ouverte pour ne pas
      // faire perdre sa saisie.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Modifier l'envoi programmé</DialogTitle>
            <DialogDescription>
              Une modification remet ce message à « Prévu » : ce que Jarvis
              annoncerait a changé.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-destinataire">Destinataire</Label>
              <div className="flex gap-2">
                <Input
                  id="msgprog-destinataire"
                  required
                  value={destinataire}
                  placeholder="Nom tel que dans ton répertoire"
                  onChange={(e) => {
                    setDestinataire(e.target.value)
                    // Un autre nom : le contact vérifié ne correspond plus.
                    setChoisi(null)
                    setRecherche({ etat: "repos" })
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={!destinataire.trim() || recherche.etat === "en_cours"}
                  onClick={() => void chercher(destinataire)}
                >
                  Chercher
                </Button>
              </div>
              {choisi ? (
                <p id="msgprog-verifie" className="text-sm text-emerald-700 dark:text-emerald-400">
                  ✓ Partira à {choisi.nom} · {choisi.numero}{" "}
                  <button type="button" className="underline" onClick={() => setChoisi(null)}>
                    changer
                  </button>
                </p>
              ) : (
                <ResultatRecherche
                  recherche={recherche}
                  onChoisir={(c) => {
                    setChoisi({ nom: c.nom, numero: c.numero })
                    setRecherche({ etat: "repos" })
                  }}
                />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-canal">Canal</Label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger id="msgprog-canal" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CANAL_AUCUN}>Pas encore choisi</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-envoyer-a">Heure prévue</Label>
              <Input
                id="msgprog-envoyer-a"
                type="datetime-local"
                required
                value={envoyerA}
                onChange={(e) => setEnvoyerA(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="msgprog-texte">Message</Label>
              <Textarea
                id="msgprog-texte"
                required
                value={texte}
                className="min-h-32"
                onChange={(e) => setTexte(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** « ce contact » (ce qu'écrivait l'app avant a122a936) n'est pas un nom : le
 * champ s'ouvre vide, pour qu'il y écrive le vrai. */
function nomAffiche(m: MessageProgramme): string {
  return destinataireManquant(m.destinataire) ? "" : m.destinataire
}

function contactDe(m: MessageProgramme): ContactChoisi {
  return m.telephone ? { nom: m.contact_nom || m.destinataire, numero: m.telephone } : null
}

/** Sous le champ : les contacts à toucher, ou pourquoi il n'y en a pas. */
function ResultatRecherche({
  recherche,
  onChoisir,
}: {
  recherche: Recherche
  onChoisir: (c: ContactTelephone) => void
}) {
  switch (recherche.etat) {
    case "repos":
      return (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Contact pas encore vérifié : cherche-le dans ton répertoire.
        </p>
      )
    case "en_cours":
      return <p className="text-sm text-muted-foreground">Je cherche dans ton répertoire…</p>
    case "candidats":
      return (
        <div id="msgprog-candidats" className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {recherche.contacts.length > 1 ? "Plusieurs contacts — touche le bon :" : "Touche-le pour le confirmer :"}
          </p>
          {recherche.contacts.map((c) => (
            <Button
              key={`${c.nom}-${c.numero}`}
              type="button"
              variant="outline"
              className="h-auto justify-start py-2 text-left"
              onClick={() => onChoisir(c)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.nom}</span>
                <span className="block text-xs text-muted-foreground">{c.numero}</span>
              </span>
            </Button>
          ))}
        </div>
      )
    case "aucun":
      return (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Personne à ce nom dans ton répertoire : écris-le comme il y est enregistré.
        </p>
      )
    case "refuse":
      return (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Jarvis n'a pas accès à tes contacts : autorise-les dans Paramètres › Autorisations du téléphone.
        </p>
      )
    case "indisponible":
      return (
        <p className="text-sm text-muted-foreground">
          Le répertoire se lit depuis l'application sur ton téléphone.
        </p>
      )
  }
}
