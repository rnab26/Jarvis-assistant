import { ChevronDown, ChevronRight, Compass, Unlock } from "lucide-react"
import { useMemo, useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { lireFenetreBilan } from "@/lib/cockpitPrefs"
import { ago, courtAuteur } from "@/lib/journalBord"
import { ouJenSuis, type ChantierPris, type EtatSection } from "@/lib/ouJenSuis"
import { cleTheme } from "@/lib/themeChantier"
import type { DevItem, DevLogEntry, DevSection } from "@/types/database"

/**
 * « Où j'en suis ? », en tête du cockpit — quatre nombres par section.
 *
 * Le raisonnement complet est dans `src/lib/ouJenSuis.ts`, qui fait tout le
 * calcul : ici il n'y a que l'affichage. Trois choix méritent d'être écrits.
 *
 * 1. LES SECTIONS SONT TRIÉES PAR CE QU'ELLES RÉCLAMENT, pas dans l'ordre du
 *    cockpit. La question est « où mettre le nez » : la réponse doit être en
 *    haut. Celles où il ne reste que des chantiers endormis sont réunies sur
 *    une seule ligne, dépliable — les lister toutes ferait revenir le mur
 *    qu'on essaie de supprimer.
 *
 * 2. CE BLOC A UN BUDGET DE HAUTEUR, et il est mesuré. Avant lui, le résumé
 *    par section commençait à 482 points du haut sur un écran de téléphone
 *    (390 × 844) un jour ordinaire. Il ne doit pas descendre plus bas : c'est
 *    vérifié par `scripts/verifier-cockpit-web.mjs`, à la vraie taille du
 *    cockpit (83 chantiers, 9 sections). D'où les cinq sections en tête et le
 *    « voir les autres », d'où aussi la fenêtre d'envoi devenue repliable et
 *    la carte « Qui travaille en ce moment » absorbée ici : la place a été
 *    prise à ce qui faisait doublon, pas ajoutée en bas de la pile.
 *
 * 3. RIEN NE NOTIFIE, RIEN NE CLIGNOTE. Il n'a pas demandé qu'on l'alerte, il
 *    a demandé de comprendre en ouvrant.
 */

/**
 * Combien de sections en tête avant « voir les autres ».
 *
 * Quatre, parce que c'est ce qui tient dans le budget de hauteur ci-dessus
 * SANS rendre les lignes trop fines pour le pouce — les deux se disputent la
 * même place, et une ligne qu'on rate à l'appui est pire qu'une ligne cachée
 * derrière un bouton. Le motif est celui du registre des erreurs, juste en
 * dessous : une liste bornée, et un bouton pour la dérouler en entier.
 */
const SECTIONS_EN_TETE = 4

/** Ce que la colonne dit, et la couleur qui va avec. */
const COLONNES = [
  { cle: "bouge", libelle: "bouge", classe: "text-primary" },
  { cle: "livre", libelle: "livré", classe: "text-foreground" },
  { cle: "toi", libelle: "pour toi", classe: "text-destructive" },
  { cle: "dort", libelle: "dort", classe: "text-muted-foreground" },
] as const

interface OuJenSuisProps {
  devItems: DevItem[]
  sections: DevSection[]
  messages: DevLogEntry[]
  /** Le chargement des chantiers : sans ça, « rien ne bouge » s'afficherait
   * pendant qu'on charge, et se lirait comme une réponse. */
  loading?: boolean
  error?: string | null
  /** Libère une réservation qu'une session arrêtée n'a pas rendue. */
  onLiberer: (id: string) => Promise<void>
  /** Filtre le tableau des chantiers sur une section. */
  onVoirSection: (nom: string) => void
}

export function OuJenSuis({
  devItems,
  sections,
  messages,
  loading = false,
  error = null,
  onLiberer,
  onVoirSection,
}: OuJenSuisProps) {
  const [fenetre, setFenetre] = useState(lireFenetreBilan)
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set())
  const [toutesLesSections, setToutesLesSections] = useState(false)
  const [reposOuvert, setReposOuvert] = useState(false)

  // Le réglage peut venir de la base à la connexion : sans cette relecture,
  // l'écran garderait la fenêtre de CET appareil.
  useRelireApresRestauration(() => setFenetre(lireFenetreBilan()))

  const bilan = useMemo(
    () => ouJenSuis(devItems, sections, messages, fenetre),
    [devItems, sections, messages, fenetre],
  )

  if (loading) {
    return (
      <Card>
        <CardContent className="py-3">
          <p className="text-sm text-muted-foreground">Où j'en suis — lecture en cours…</p>
        </CardContent>
      </Card>
    )
  }
  // Le tableau, plus bas, porte déjà le message d'erreur et le bouton
  // « Réessayer » : deux fois le même incident à l'écran n'aide personne.
  if (error || bilan.vide) return null

  const basculer = (nom: string) =>
    setOuvertes((set) => {
      const suivant = new Set(set)
      const cle = cleTheme(nom)
      if (suivant.has(cle)) suivant.delete(cle)
      else suivant.add(cle)
      return suivant
    })

  const affichees = toutesLesSections
    ? bilan.sections
    : bilan.sections.slice(0, SECTIONS_EN_TETE)
  const cachees = bilan.sections.length - affichees.length
  const dortAuRepos = bilan.auRepos.reduce((n, e) => n + e.dort.length, 0)

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-2.5">
        <div className="flex items-center gap-1.5">
          <Compass className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm font-medium">Où j'en suis</p>
          {bilan.totaux.attend > 0 ? (
            <Badge variant="destructive" className="shrink-0">
              {bilan.totaux.attend} pour toi
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0">
              {bilan.totaux.bouge} en cours
            </Badge>
          )}
        </div>

        {/* Quatre colonnes, jamais cinq : une de plus et on relit un tableau
            au lieu de lire une réponse. */}
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,2.5rem)] items-center gap-x-1 text-[10px] text-muted-foreground">
          <span />
          {COLONNES.map((c) => (
            <span key={c.cle} className="text-center">
              {c.libelle}
            </span>
          ))}
        </div>

        {affichees.map((etat) => (
          <LigneSection
            key={etat.nom}
            etat={etat}
            ouverte={ouvertes.has(cleTheme(etat.nom))}
            onBasculer={() => basculer(etat.nom)}
            onLiberer={onLiberer}
            onVoirSection={onVoirSection}
          />
        ))}

        {cachees > 0 && (
          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline"
            onClick={() => setToutesLesSections(true)}
          >
            Voir les {cachees} autre{cachees > 1 ? "s" : ""} section{cachees > 1 ? "s" : ""}
          </button>
        )}

        {/* Ce qui dort n'appelle aucune action : une ligne suffit, et on
            l'ouvre si on cherche du travail. */}
        {bilan.auRepos.length > 0 && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              aria-expanded={reposOuvert}
              className="flex items-center gap-1 text-left text-xs text-muted-foreground"
              onClick={() => setReposOuvert(!reposOuvert)}
            >
              {reposOuvert ? (
                <ChevronDown className="size-3 shrink-0" />
              ) : (
                <ChevronRight className="size-3 shrink-0" />
              )}
              {bilan.auRepos.length} section{bilan.auRepos.length > 1 ? "s" : ""} au repos —{" "}
              {dortAuRepos} chantier{dortAuRepos > 1 ? "s" : ""} qui dorment
            </button>
            {reposOuvert &&
              bilan.auRepos.map((etat) => (
                <button
                  key={etat.nom}
                  type="button"
                  className="truncate pl-4 text-left text-xs text-muted-foreground"
                  onClick={() => onVoirSection(etat.nom)}
                >
                  {etat.nom} · {etat.dort.length}
                </button>
              ))}
          </div>
        )}

        {/* Une réservation morte ne compte dans aucune des quatre colonnes :
            le chantier n'avance pas (personne n'est dessus) et ne dort pas
            (il affiche encore « Prise par … », donc aucune session ne le
            prendra). Sans cette ligne, il n'existerait qu'en pastille ⚠ sur
            une ligne repliée — c'est-à-dire nulle part. */}
        {bilan.totaux.abandonnees > 0 && (
          <p className="text-xs text-destructive">
            ⚠ {bilan.totaux.abandonnees} chantier{bilan.totaux.abandonnees > 1 ? "s" : ""} porte
            {bilan.totaux.abandonnees > 1 ? "nt" : ""} encore le nom d'une session arrêtée. Ouvre
            la section pour {bilan.totaux.abandonnees > 1 ? "les" : "le"} libérer.
          </p>
        )}

        {/* Un point qui ne porte sur aucun chantier n'apparaît sur aucune
            ligne : sans ce rappel, il attendrait indéfiniment. On y répond
            dans « Ce qui attend ta décision », juste en dessous. */}
        {bilan.questionsGenerales.length > 0 && (
          <p className="text-xs text-destructive">
            {bilan.questionsGenerales.length} point
            {bilan.questionsGenerales.length > 1 ? "s" : ""} sans chantier — à traiter dans « Ce
            qui attend ta décision », juste en dessous.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function LigneSection({
  etat,
  ouverte,
  onBasculer,
  onLiberer,
  onVoirSection,
}: {
  etat: EtatSection
  ouverte: boolean
  onBasculer: () => void
  onLiberer: (id: string) => Promise<void>
  onVoirSection: (nom: string) => void
}) {
  const valeurs = [etat.bouge.length, etat.livres.length, etat.attend.length, etat.dort.length]

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={ouverte}
        aria-label={`Où en est ${etat.nom}`}
        onClick={onBasculer}
        className="grid grid-cols-[minmax(0,1fr)_repeat(4,2.5rem)] items-center gap-x-1 py-1 text-left"
      >
        <span className="flex min-w-0 items-center gap-1">
          {ouverte ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs">{etat.nom}</span>
          {etat.abandonnees.length > 0 && (
            <span className="shrink-0 text-[10px] text-destructive">⚠</span>
          )}
        </span>
        {valeurs.map((n, i) => (
          <span
            key={COLONNES[i].cle}
            className={`text-center text-xs tabular-nums ${
              n > 0 ? COLONNES[i].classe : "text-muted-foreground/40"
            }`}
          >
            {n > 0 ? n : "—"}
          </span>
        ))}
      </button>

      {ouverte && (
        <div className="flex flex-col gap-1 border-l pb-1.5 pl-3 text-xs">
          {etat.bouge.map(({ item, session, expireA }) => (
            <p key={item.id} className="truncate text-muted-foreground">
              <span className="text-primary">●</span> {item.title}{" "}
              <span className="opacity-70">— {session}, encore {restant(expireA)}</span>
            </p>
          ))}

          {etat.attend.map(({ item, raison, question }) => (
            <p key={item.id} className="text-muted-foreground">
              <span className="text-destructive">◆</span> {item.title}
              <span className="opacity-70">
                {" — "}
                {raison === "decision"
                  ? "attend une décision de toi"
                  : `question de ${question ? courtAuteur(question.author) : "session"}, ${question ? ago(question.created_at) : ""}`}
              </span>
            </p>
          ))}

          {etat.livres.map((item) => (
            <p key={item.id} className="truncate text-muted-foreground">
              ✓ {item.title}
            </p>
          ))}

          {etat.dort.length > 0 && (
            <p className="text-muted-foreground/70">
              {etat.dort.length} qui dorment : {etat.dort.slice(0, 2).map((i) => i.title).join(" · ")}
              {etat.dort.length > 2 && " …"}
            </p>
          )}

          {etat.abandonnees.map((pris) => (
            <ReservationAbandonnee key={pris.item.id} pris={pris} onLiberer={onLiberer} />
          ))}

          {etat.section?.description && (
            <p className="text-muted-foreground/70">{etat.section.description}</p>
          )}

          <button
            type="button"
            className="self-start underline"
            onClick={() => onVoirSection(etat.nom)}
          >
            Voir « {etat.nom} » dans le tableau
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Une réservation qu'une session arrêtée n'a pas rendue.
 *
 * C'est le piège que la carte « Qui travaille en ce moment » avait été
 * écrite pour attraper, et il est intact : le chantier affiche « Prise par
 * … » jusqu'à la date d'expiration, on le croit pris en charge, personne
 * n'est dessus. Ce bloc-ci reprend son rôle, à l'endroit où on lit
 * justement « ce qui bouge » — plutôt que dans une carte séparée qui disait
 * la même chose deux cartes plus bas.
 */
function ReservationAbandonnee({
  pris,
  onLiberer,
}: {
  pris: ChantierPris
  onLiberer: (id: string) => Promise<void>
}) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="min-w-0 flex-1 truncate text-destructive">
        ⚠ {pris.item.title}{" "}
        <span className="opacity-70">
          — {pris.session} s'est arrêtée sans le libérer, {ago(pris.expireA)}
        </span>
      </p>
      <ConfirmerAction
        destructif={false}
        libelleConfirmation="Libérer"
        titre="Libérer ce chantier ?"
        description={
          <>
            « {pris.item.title} » redeviendra libre : la prochaine session pourra le prendre. Le
            chantier lui-même n'est pas modifié.
          </>
        }
        onConfirmer={() => onLiberer(pris.item.id)}
        trigger={
          <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-xs">
            <Unlock className="size-3" />
            Libérer
          </Button>
        }
      />
    </div>
  )
}

/** Ce qu'il reste de réservation, en clair. */
function restant(expire: string): string {
  const minutes = Math.round((new Date(expire).getTime() - Date.now()) / 60000)
  if (minutes < 1) return "moins d'une minute"
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
}
