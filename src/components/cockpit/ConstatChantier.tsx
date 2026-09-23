import { Camera, Send, ThumbsDown, ThumbsUp, X } from "lucide-react"
import { useRef, useState } from "react"
import { BoutonDictee } from "@/components/cockpit/BoutonDictee"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { Verdict } from "@/lib/constatChantier"
import { ajouterSegmentDicte } from "@/lib/dicteeChamp"
import type { DevItem } from "@/types/database"

/** Ce que le cockpit fait de sa réponse — voir `useDevItems.constaterChantier`. */
export type OnConstater = (
  item: DevItem,
  verdict: Verdict,
  paroles: string,
  photo: File | null,
) => Promise<void>

/**
 * Sa réponse sur un chantier livré : deux boutons, puis UNE étape — ses mots
 * (et une photo s'il veut), et la confirmation. Sa règle : une étape à la
 * fois, pas de contrôle montré avant qu'on en ait besoin.
 *
 * « Ça marche » n'exige rien de plus qu'un appui de confirmation ; « Ça ne
 * marche pas » exige ses mots — sans eux, la session qui reprend ne sait pas
 * quoi chercher, et c'est précisément le « je dois tout réexpliquer » qu'il
 * reproche.
 */
export function ConstatChantier({
  item,
  onConstater,
}: {
  item: DevItem
  onConstater: OnConstater
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [paroles, setParoles] = useState("")
  const [photo, setPhoto] = useState<File | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const champFichier = useRef<HTMLInputElement>(null)

  const pret = verdict === "marche" || (verdict === "ne_marche_pas" && paroles.trim().length > 0)

  async function envoyer() {
    if (!verdict || !pret) return
    setEnvoi(true)
    try {
      await onConstater(item, verdict, paroles, photo)
      // Réussi : la carte change d'elle-même (archivée, ou redevenue libre),
      // ce bloc disparaît avec le marqueur.
    } catch {
      // Toast déjà affiché : ses mots restent dans le champ.
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-2"
      role="group"
      aria-label={`Ton retour sur ${item.title}`}
    >
      <p className="text-xs font-medium">Tu l'as essayé sur ton téléphone ?</p>

      {verdict === null ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setVerdict("marche")}>
            <ThumbsUp className="size-3.5" />
            Ça marche
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVerdict("ne_marche_pas")}>
            <ThumbsDown className="size-3.5" />
            Ça ne marche pas
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Textarea
              rows={2}
              value={paroles}
              autoFocus
              placeholder={
                verdict === "marche"
                  ? "Un mot à ajouter ? (facultatif)"
                  : "Qu'est-ce qui ne va pas ? Ce que tu as fait, ce qui s'est passé."
              }
              aria-label={verdict === "marche" ? "Un mot sur ce qui marche" : "Ce qui ne marche pas"}
              onChange={(e) => setParoles(e.target.value)}
              className="pr-9"
            />
            <BoutonDictee
              cible={item.title}
              onResultat={(segment) => setParoles((actuel) => ajouterSegmentDicte(actuel, segment))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <input
              ref={champFichier}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label={`Joindre une photo à ton retour sur ${item.title}`}
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" size="sm" onClick={() => champFichier.current?.click()}>
              <Camera className="size-3.5" />
              {photo ? "Changer" : "Photo"}
            </Button>
            {photo && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <span className="min-w-0 max-w-24 truncate">{photo.name}</span>
                <button
                  type="button"
                  aria-label="Retirer la photo"
                  onClick={() => {
                    setPhoto(null)
                    if (champFichier.current) champFichier.current.value = ""
                  }}
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={envoi}
              onClick={() => {
                setVerdict(null)
                setParoles("")
                setPhoto(null)
              }}
            >
              Retour
            </Button>
            <Button size="sm" disabled={!pret || envoi} onClick={envoyer}>
              <Send className="size-3.5" />
              {envoi ? "Envoi…" : verdict === "marche" ? "Confirmer" : "Envoyer"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {verdict === "marche"
              ? "Le chantier part dans les archivées, et Jarvis retient que ça marche : aucune session ne doit le casser."
              : "Tes mots sont ajoutés au chantier, qui redevient « libre » : la prochaine session le reprend à partir d'eux."}
          </p>
        </>
      )}
    </div>
  )
}
