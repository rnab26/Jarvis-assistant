import {
  Check,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Wrench,
} from "lucide-react"
import { useMemo, useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { LoadError } from "@/components/LoadError"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import { Textarea } from "@/components/ui/textarea"
import { ErreurFormDialog } from "@/components/cockpit/ErreurFormDialog"
import {
  CATEGORIES,
  LIBELLE_CATEGORIE,
  LIBELLE_STATUT,
  quand,
} from "@/components/cockpit/erreurLibelles"
import type { useJarvisErreurs } from "@/hooks/useJarvisErreurs"
import { alreadyNotified } from "@/lib/notifyError"
import { suggererSection } from "@/lib/suggestionTheme"
import type {
  DevItem,
  DevItemInput,
  DevSection,
  ErreurCategorie,
  ErreurStatut,
  JarvisErreur,
} from "@/types/database"

/**
 * La section du cockpit qui n'est pas faite de chantiers : ce que Jarvis rate.
 *
 * Chantier f2f6667f, ses mots : « toutes les erreurs système ou d'utilisation
 * ou de compréhension, d'action — bref toutes les erreurs que Jarvis fait — en
 * les qualifiant selon des thèmes d'erreurs afin de ne perdre aucune erreur et
 * de les corriger, avec la possibilité de créer un chantier en y ajoutant des
 * notes de correction ».
 *
 * Trois choses arrivent ici sans que personne ait à y penser : les écritures
 * qui échouent (toutes passent par `withErrorToast`), les échecs du serveur
 * vocal et du mode Live, et les rafales de micro qui se terminent sans rien
 * avoir entendu. Le reste — les erreurs de compréhension, celles qui ne lèvent
 * aucune exception — se signale à la main, et c'est pour ça que le bouton est
 * en haut de la carte plutôt qu'au fond d'un menu.
 */
interface ErreursJarvisProps {
  erreursState: ReturnType<typeof useJarvisErreurs>
  devItems: DevItem[]
  sections: DevSection[]
  onCreerChantier: (input: DevItemInput) => Promise<DevItem | undefined>
}

/** Ce qu'on montre par défaut : ce qui n'est ni réglé ni écarté. */
const OUVERTES: ErreurStatut[] = ["nouveau", "en_cours"]

export function ErreursJarvis({
  erreursState,
  devItems,
  sections,
  onCreerChantier,
}: ErreursJarvisProps) {
  const { erreurs, loading, error, refresh } = erreursState
  const [voirReglees, setVoirReglees] = useState(false)
  const [categorie, setCategorie] = useState<ErreurCategorie | null>(null)

  const ouvertes = useMemo(() => erreurs.filter((e) => OUVERTES.includes(e.statut)), [erreurs])
  const affichees = useMemo(
    () =>
      erreurs
        .filter((e) => (voirReglees ? true : OUVERTES.includes(e.statut)))
        .filter((e) => (categorie ? e.categorie === categorie : true)),
    [erreurs, voirReglees, categorie],
  )

  // Le résumé par type : c'est ce qu'il appelle « qualifier selon des thèmes
  // d'erreurs ». Les familles vides ne s'affichent pas — une liste de sept
  // compteurs à zéro n'apprend rien.
  const parCategorie = CATEGORIES.map((c) => ({
    ...c,
    nb: (voirReglees ? erreurs : ouvertes).filter((e) => e.categorie === c.valeur).length,
  })).filter((c) => c.nb > 0)

  const boutonAjout = (
    <ErreurFormDialog
      onSubmit={erreursState.ajouterErreur}
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" />
          Signaler
        </Button>
      }
    />
  )

  return (
    <CarteRepliable
      titre={
        <>
          Erreurs de Jarvis{" "}
          <span className="font-normal text-muted-foreground">
            — {ouvertes.length} ouverte{ouvertes.length > 1 ? "s" : ""}
          </span>
        </>
      }
      badge={
        ouvertes.some((e) => e.reapparue_at) ? (
          <Badge variant="destructive" className="shrink-0">
            revenue
          </Badge>
        ) : undefined
      }
    >
      <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {boutonAjout}
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={voirReglees}
              onClick={() => setVoirReglees(!voirReglees)}
            >
              {voirReglees ? "Masquer les réglées" : "Voir les réglées"}
            </Button>
          </div>

          {parCategorie.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                aria-pressed={categorie === null}
                onClick={() => setCategorie(null)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  categorie === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                Tout <span className="opacity-70">{affichees.length}</span>
              </button>
              {parCategorie.map((c) => (
                <button
                  key={c.valeur}
                  type="button"
                  aria-pressed={categorie === c.valeur}
                  onClick={() => setCategorie(categorie === c.valeur ? null : c.valeur)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    categorie === c.valeur
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {c.libelle} <span className="opacity-70">{c.nb}</span>
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <LoadError message={error} onRetry={refresh} />
          ) : affichees.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4">
              <p className="text-center text-sm text-muted-foreground">
                {erreurs.length === 0
                  ? "Aucune erreur enregistrée. Les échecs techniques arrivent ici tout seuls ; le reste, signale-le au moment où ça arrive."
                  : "Rien d'ouvert de ce côté. Les erreurs réglées sont masquées."}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {affichees.map((erreur) => (
                <LigneErreur
                  key={erreur.id}
                  erreur={erreur}
                  devItems={devItems}
                  sections={sections}
                  erreursState={erreursState}
                  onCreerChantier={onCreerChantier}
                />
              ))}
            </div>
          )}
      </CardContent>
    </CarteRepliable>
  )
}

interface LigneErreurProps {
  erreur: JarvisErreur
  devItems: DevItem[]
  sections: DevSection[]
  erreursState: ReturnType<typeof useJarvisErreurs>
  onCreerChantier: (input: DevItemInput) => Promise<DevItem | undefined>
}

function LigneErreur({
  erreur,
  devItems,
  sections,
  erreursState,
  onCreerChantier,
}: LigneErreurProps) {
  const [deplie, setDeplie] = useState(false)
  const [correction, setCorrection] = useState(erreur.correction ?? "")
  const [enregistre, setEnregistre] = useState(false)
  const chantier = devItems.find((i) => i.id === erreur.dev_item_id)

  async function creerChantier() {
    const notes = [
      `Erreur ${LIBELLE_CATEGORIE[erreur.categorie].toLowerCase()} relevée dans le cockpit.`,
      erreur.contexte ? `Ce qui se passait : ${erreur.contexte}` : null,
      erreur.detail ? `Détail : ${erreur.detail}` : null,
      correction.trim() ? `Correction attendue : ${correction.trim()}` : null,
      `Vue ${erreur.occurrences} fois, la dernière ${quand(erreur.last_seen)}.`,
    ]
      .filter(Boolean)
      .join("\n")

    // La section est suggérée à partir de l'erreur elle-même : un chantier
    // créé sans section retombe dans « À classer », et c'est exactement la
    // pile qu'on essaie de vider.
    const suggestion = suggererSection(
      `${erreur.titre} ${erreur.contexte ?? ""} ${erreur.detail ?? ""}`,
      devItems,
      sections,
    )

    const cree = await onCreerChantier({
      title: erreur.titre.slice(0, 120),
      notes,
      status: "todo",
      priority: erreur.occurrences > 3 ? "high" : "normal",
      theme: suggestion?.nom ?? null,
    })
    if (cree) {
      await erreursState.modifierErreur(erreur.id, {
        dev_item_id: cree.id,
        statut: "en_cours",
        correction: correction.trim() || erreur.correction,
      })
    }
  }

  async function enregistrerCorrection() {
    setEnregistre(true)
    try {
      await erreursState.modifierErreur(erreur.id, { correction: correction.trim() || null })
    } catch {
      // Toast déjà affiché.
    } finally {
      setEnregistre(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 py-2">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={deplie}
          onClick={() => setDeplie(!deplie)}
        >
          <div className="flex items-center gap-1.5">
            <span className={`min-w-0 flex-1 text-sm ${deplie ? "" : "truncate"}`}>
              {erreur.titre}
            </span>
            <Badge variant="outline" className="shrink-0 px-1.5 text-xs font-normal">
              {LIBELLE_CATEGORIE[erreur.categorie]}
            </Badge>
            {erreur.occurrences > 1 && (
              <Badge variant="secondary" className="shrink-0 px-1.5 text-xs font-normal">
                ×{erreur.occurrences}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {LIBELLE_STATUT[erreur.statut]} · vue {quand(erreur.last_seen)}
            {erreur.reapparue_at && " · revenue après correction"}
          </p>
        </button>

        <ErreurFormDialog
          erreur={erreur}
          onSubmit={(v) => erreursState.modifierErreur(erreur.id, v)}
          trigger={
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Modifier">
              <Pencil className="size-3.5" />
            </Button>
          }
        />
        <ConfirmerAction
          titre="Supprimer cette erreur ?"
          description={
            <>
              « {erreur.titre} » disparaîtra du registre. Pour la garder sans l'avoir sous
              les yeux, marque-la plutôt « ignorée ».
            </>
          }
          libelleConfirmation="Supprimer"
          onConfirmer={() => erreursState.supprimerErreur(erreur.id)}
          trigger={
            <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Supprimer">
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
      </div>

      {deplie && (
        <div className="flex flex-col gap-2 pb-1">
          {erreur.contexte && (
            <p className="text-xs whitespace-pre-line text-muted-foreground">
              <span className="font-medium">Ce qui se passait :</span> {erreur.contexte}
            </p>
          )}
          {erreur.detail && (
            <p className="text-xs whitespace-pre-line text-muted-foreground">
              <span className="font-medium">Détail :</span> {erreur.detail}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Vue {erreur.occurrences} fois — d'abord {quand(erreur.first_seen)}, la dernière{" "}
            {quand(erreur.last_seen)}. Source : {erreur.source}.
          </p>

          <div className="flex flex-col gap-1.5">
            <Textarea
              value={correction}
              rows={2}
              placeholder="Ce qu'il aurait fallu faire — c'est cette note qui sert à corriger"
              aria-label="Note de correction"
              onChange={(e) => setCorrection(e.target.value)}
            />
            {correction !== (erreur.correction ?? "") && (
              <Button
                size="sm"
                className="self-end"
                disabled={enregistre}
                onClick={enregistrerCorrection}
              >
                <Check className="size-3.5" />
                Enregistrer la correction
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {chantier ? (
              <Badge variant="outline" className="max-w-full truncate">
                <Wrench className="size-3" /> Chantier : {chantier.title}
              </Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => creerChantier().catch(alreadyNotified)}>
                <Wrench className="size-3.5" />
                Créer un chantier
              </Button>
            )}

            {erreur.statut !== "corrige" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => erreursState.changerStatut(erreur.id, "corrige").catch(alreadyNotified)}
              >
                <Check className="size-3.5" />
                Corrigée
              </Button>
            )}
            {erreur.statut !== "ignore" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => erreursState.changerStatut(erreur.id, "ignore").catch(alreadyNotified)}
              >
                <EyeOff className="size-3.5" />
                Ignorer
              </Button>
            )}
            {erreur.statut !== "nouveau" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => erreursState.changerStatut(erreur.id, "nouveau").catch(alreadyNotified)}
              >
                <RotateCcw className="size-3.5" />
                Rouvrir
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
