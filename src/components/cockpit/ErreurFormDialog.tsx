import { useEffect, useState, type FormEvent, type ReactNode } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CATEGORIES } from "@/components/cockpit/erreurLibelles"
import type { ErreurCategorie, JarvisErreur } from "@/types/database"

/**
 * Signaler une erreur à la main, ou retoucher une erreur déjà enregistrée.
 *
 * Les erreurs les plus utiles sont justement celles que rien ne peut détecter
 * tout seul : Jarvis qui comprend autre chose, qui répond à côté, qui range au
 * mauvais endroit. Aucune exception n'est levée dans ces cas-là — seul Raphaël
 * peut les voir. S'il n'a pas un endroit pour les mettre au moment où ça
 * arrive, elles sont perdues.
 */
interface ErreurFormDialogProps {
  erreur?: JarvisErreur
  trigger: ReactNode
  onSubmit: (valeurs: {
    categorie: ErreurCategorie
    titre: string
    detail: string | null
    contexte: string | null
    correction: string | null
  }) => Promise<void>
}

export function ErreurFormDialog({ erreur, trigger, onSubmit }: ErreurFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [categorie, setCategorie] = useState<ErreurCategorie>(erreur?.categorie ?? "comprehension")
  const [titre, setTitre] = useState(erreur?.titre ?? "")
  const [detail, setDetail] = useState(erreur?.detail ?? "")
  const [contexte, setContexte] = useState(erreur?.contexte ?? "")
  const [correction, setCorrection] = useState(erreur?.correction ?? "")
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    if (open) {
      setCategorie(erreur?.categorie ?? "comprehension")
      setTitre(erreur?.titre ?? "")
      setDetail(erreur?.detail ?? "")
      setContexte(erreur?.contexte ?? "")
      setCorrection(erreur?.correction ?? "")
    }
  }, [open, erreur])

  async function soumettre(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    try {
      await onSubmit({
        categorie,
        titre,
        detail: detail.trim() || null,
        contexte: contexte.trim() || null,
        correction: correction.trim() || null,
      })
      setOpen(false)
    } catch {
      // Toast déjà affiché : on garde la fenêtre et la saisie.
    } finally {
      setEnvoi(false)
    }
  }

  const aide = CATEGORIES.find((c) => c.valeur === categorie)?.aide

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={soumettre}>
          <DialogHeader>
            <DialogTitle>{erreur ? "Modifier l'erreur" : "Signaler une erreur"}</DialogTitle>
            <DialogDescription>
              {erreur
                ? "Reclasse-la, précise ce qui s'est passé, écris la correction."
                : "Ce que Jarvis a raté, tant que tu l'as en tête."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="erreur-titre">Ce qui s'est passé</Label>
              <Input
                id="erreur-titre"
                required
                value={titre}
                placeholder="Il a créé une tâche au lieu d'un chantier"
                onChange={(e) => setTitre(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="erreur-categorie">Type d'erreur</Label>
              <Select
                value={categorie}
                onValueChange={(v) => setCategorie(v as ErreurCategorie)}
              >
                <SelectTrigger id="erreur-categorie" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.valeur} value={c.valeur}>
                      {c.libelle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="erreur-contexte">Ce que tu faisais</Label>
              <Input
                id="erreur-contexte"
                value={contexte}
                placeholder="J'ai dit « ajoute un chantier pour le micro »"
                onChange={(e) => setContexte(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="erreur-detail">Détail (facultatif)</Label>
              <Textarea
                id="erreur-detail"
                value={detail}
                rows={2}
                placeholder="Sa réponse exacte, le message d'erreur…"
                onChange={(e) => setDetail(e.target.value)}
              />
            </div>

            {/* La correction est la moitié utile du registre : sans elle, on a
                une liste de plaintes ; avec elle, on a de quoi corriger. */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="erreur-correction">Ce qu'il aurait fallu faire</Label>
              <Textarea
                id="erreur-correction"
                value={correction}
                rows={2}
                placeholder="« ajoute un chantier » doit toujours créer un chantier, jamais une tâche"
                onChange={(e) => setCorrection(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={envoi || !titre.trim()}>
              {erreur ? "Enregistrer" : "Enregistrer l'erreur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
