import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PanelsTopLeft, Sparkles } from "lucide-react"
import { BarreActualiser } from "@/components/BarreActualiser"
import { Button } from "@/components/ui/button"
import { EnAttenteDenvoi } from "@/components/tasks/EnAttenteDenvoi"
import { LoadError } from "@/components/LoadError"
import { CeQuiAttendTaDecision } from "@/components/cockpit/CeQuiAttendTaDecision"
import { ChantiersEgares } from "@/components/cockpit/ChantiersEgares"
import { CockpitBoard, themesDe } from "@/components/cockpit/CockpitBoard"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { DepuisTonDernierPassage } from "@/components/cockpit/DepuisTonDernierPassage"
import { DoublonsTrouves } from "@/components/cockpit/DoublonsTrouves"
import { NouveauChantier } from "@/components/cockpit/NouveauChantier"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import { OuJenSuis } from "@/components/cockpit/OuJenSuis"
import { ThemesNonDeclares } from "@/components/cockpit/ThemesNonDeclares"
import { useActualisation } from "@/hooks/useActualisation"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useDevLog } from "@/hooks/useDevLog"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { ecrireModeSimplifie, lireModeSimplifie } from "@/lib/cockpitSimplifie"
import { FILTRE_VIDE, type FiltreCockpit } from "@/lib/sections"
import { cleTheme } from "@/lib/themeChantier"
import type { DevItem, Task } from "@/types/database"

/**
 * Le cockpit, de haut en bas : où on en est, ce qu'on envoie, ce qu'on se dit
 * entre sessions, ce que Jarvis rate, ce qui est en cours.
 *
 * « OÙ J'EN SUIS » EST EN PREMIER, et c'est le point du chantier 18a0aff1.
 * Ses mots du 5 sept. : « je ne sais plus où mettre le nez ». Tout le reste
 * de cette page sert à AGIR ; ce bloc-là sert à comprendre, et c'est ce qu'on
 * fait en ouvrant. La carte « Qui travaille en ce moment » a disparu : elle
 * disait la même chose en moins bien (qui travaille, oui — mais pas sur
 * quelle section, ni ce qui l'attend lui, ni ce qui vient d'être livré), et
 * garder les deux aurait repoussé le tableau des chantiers hors du premier
 * écran.
 *
 * Le journal est collé à la fenêtre d'envoi — les deux servent à PILOTER les
 * sessions, pas à consulter la liste des chantiers — plutôt que séparé d'elle
 * par tout le tableau (Raphaël, 3 sept. : « cette fenêtre est complètement
 * perdue, autant la rapprocher de la fenêtre qui crée les chantiers »).
 *
 * Le registre des erreurs est au-dessus du tableau et replié : c'est une liste
 * qu'on vient consulter ou alimenter, pas celle qu'on lit tous les jours.
 *
 * Un bouton « + Chantier » séparé, qui ouvrait un formulaire à cinq champs, a
 * été retiré à l'origine : il faisait la même chose que la fenêtre de
 * création, en plus laborieux. Le formulaire complet reste accessible là où
 * il sert vraiment — le crayon d'une carte, pour retoucher un chantier
 * existant.
 *
 * « Envoyer à Claude Code » (la fenêtre de création elle-même) s'appelle
 * maintenant « Nouveau chantier » (chantier d0ac66f1, 7 sept. 2026) : Raphaël
 * l'a signalée introuvable, et le nom lui-même le dérangeait. Ce n'était pas
 * caché — c'est la même carte, au même endroit, toujours repliée par défaut
 * pour le budget de hauteur — juste mal nommée pour qu'on la reconnaisse.
 */
export function CockpitPage() {
  const { devItemsState, devSectionsState, erreursState, tasksState } = useJarvisData()
  const { session } = useAuth()
  const devLog = useDevLog(session?.user.id)
  // Le filtre du tableau vit ici, pas dans le tableau : « Où j'en suis » doit
  // pouvoir l'imposer quand Raphaël appuie sur une section.
  const [filtre, setFiltre] = useState<FiltreCockpit>(FILTRE_VIDE)
  const tableauRef = useRef<HTMLDivElement>(null)
  const journalRef = useRef<HTMLDivElement>(null)

  // Lien direct depuis une notification ou un message (`?chantier=<id>` ou
  // `?entree=<id>` dans l'URL, chantiers 04d2fa9e/332d87fd/f613211c) : le
  // même modèle que `?section=<cible>` sur Paramètres (chantier aac9a0dd) —
  // une cible déjà résolue (un id, pas un texte à deviner), retenue en état
  // pour que `DevItemCard`/`CeQuiAttendTaDecision` puissent s'ouvrir,
  // défiler jusqu'à elle et se mettre en évidence sans relire l'URL à
  // chaque rendu. `chantier` amène sur LE chantier, déjà déplié ; `entree`
  // sur une entrée précise de « Ce qui attend ta décision » quand elle n'est
  // rattachée à aucun chantier.
  const [searchParams, setSearchParams] = useSearchParams()
  const [chantierCible, setChantierCible] = useState<string | null>(null)
  const [entreeCible, setEntreeCible] = useState<string | null>(null)
  useEffect(() => {
    const chantier = searchParams.get("chantier")
    const entree = searchParams.get("entree")
    if (!chantier && !entree) return
    if (chantier) setChantierCible(chantier)
    if (entree) setEntreeCible(entree)
    // Retiré dans tous les cas : le laisser referait pointer vers la même
    // cible à chaque rendu, y compris après qu'il a navigué ailleurs dans le
    // cockpit.
    setSearchParams(
      (p) => {
        p.delete("chantier")
        p.delete("entree")
        return p
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  // Mode simplifié (Paramètres › Le cockpit, ou ce bouton) : Raphaël, 17 sept.
  // 2026 — « pourquoi j'ai plein d'informations […] faut que ce soit plus
  // clair, plus simple, plus synthétisé, questions, réponses et on next. »
  // Un filtre d'affichage réversible, jamais une suppression : le reste du
  // cockpit reste entier en base, juste masqué tant qu'on n'a pas rebasculé.
  const [simplifie, setSimplifie] = useState(lireModeSimplifie)
  useRelireApresRestauration(() => setSimplifie(lireModeSimplifie()))
  function basculerSimplifie() {
    setSimplifie((actif) => {
      const suivant = !actif
      ecrireModeSimplifie(suivant)
      return suivant
    })
  }
  const {
    devItems,
    loading,
    error,
    refresh,
    addDevItem,
    updateDevItem,
    deleteDevItem,
    archiveDevItem,
    unarchiveDevItem,
    updateManyDevItems,
    archiveManyDevItems,
    deleteManyDevItems,
    restoreDevItems,
    fusionnerDevItems,
    annulerFusionDevItems,
    libererReservation,
    fileEnAttente,
    fileIllisible,
    derniereMaj,
    canalDirect,
  } = devItemsState

  // Une seule barre pour tout le cockpit, mais DEUX canaux : les chantiers
  // ET le journal (chantier 221a3ba6). Une coupure sur l'un des deux suffit
  // à le dire, et « Actualiser » recharge les deux d'un coup — sinon il
  // faudrait deux boutons pour un seul geste.
  const rafraichirTout = useCallback(async () => {
    await Promise.all([refresh(), devLog.refresh()])
  }, [refresh, devLog.refresh])
  const { statut, enCours, actualiser } = useActualisation(rafraichirTout, [
    canalDirect,
    devLog.canalDirect,
  ])
  const derniereMajCombinee = [derniereMaj, devLog.derniereMaj]
    .filter((t): t is number => t !== null)
    .reduce((min, t) => (min === null || t < min ? t : min), null as number | null)

  // Les puces de la fenêtre d'envoi listent les sections déclarées ET les
  // thèmes déjà portés par un chantier : une section créée à l'avance et
  // encore vide doit pouvoir recevoir le premier chantier, sinon elle ne sert
  // à rien tant qu'on n'y a rien mis.
  const themes = [
    ...devSectionsState.sections.map((s) => s.nom),
    ...themesDe(devItems).filter(
      (t) => !devSectionsState.sections.some((s) => cleTheme(s.nom) === cleTheme(t)),
    ),
  ]

  /**
   * Marque une tâche faite — MÊME quand elle n'est encore qu'une dictée en
   * attente de réseau (`enAttente`). Repéré par une revue Copilot sur la
   * PR #5 : `toggleStatus` fait un `update ... where id = ...` en base, et
   * l'id d'une tâche en attente n'y existe pas encore — la ligne restait
   * visible et repartait pour un second chantier au prochain appui.
   * `oublierEnAttente` annule la création en attente à la place.
   */
  async function marquerTacheFaite(task: Task) {
    if (task.enAttente) tasksState.oublierEnAttente(task.id)
    else await tasksState.toggleStatus(task)
  }

  /**
   * Une « tâche » qui est en fait une demande à Claude passe dans le cockpit.
   *
   * On crée le chantier ET on marque la tâche faite — on ne la SUPPRIME
   * jamais : c'est sa liste, et il doit pouvoir retrouver ce qu'il a dicté.
   * La note d'origine part avec le chantier, sinon le contexte resterait dans
   * la tâche pendant que le travail part sans lui. Même logique que la
   * conversion faite ligne par ligne depuis l'onglet Tâches (TaskItem.tsx) —
   * ne pas en réécrire une seconde.
   */
  async function enFaireUnChantier(task: Task, titre: string, notes: string | null) {
    await addDevItem({
      title: titre,
      notes: [notes, `Dicté comme tâche perso le ${new Date(task.created_at).toLocaleDateString("fr-FR")}, remis dans le cockpit depuis l'onglet Tâches.`]
        .filter(Boolean)
        .join("\n\n"),
      status: "todo",
      priority: "normal",
      theme: null,
    })
    await marquerTacheFaite(task)
  }

  /** Depuis « Où j'en suis » : le tableau ne garde que cette section, et on
   * l'amène sous les yeux — filtrer sans faire défiler laisserait croire qu'il
   * ne s'est rien passé. */
  function voirSection(nom: string) {
    setFiltre({ ...FILTRE_VIDE, section: nom })
    tableauRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /**
   * Depuis « Depuis ton dernier passage » : un message pointait vers du texte
   * plat, sans lien (Raphaël, 17 sept. 2026). On mène au chantier concerné —
   * une recherche sur son titre, qui le fait ressortir seul dans le tableau
   * (`CockpitBoard` ouvre les archives tout seul si c'est là qu'il se
   * trouve) — ou, faute de chantier identifiable, vers le journal général.
   */
  function voirChantierDuMessage(itemId: string | null) {
    const item: DevItem | undefined = itemId ? devItems.find((i) => i.id === itemId) : undefined
    if (item) {
      setFiltre({ ...FILTRE_VIDE, recherche: item.title })
      tableauRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    } else {
      journalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Le bouton reste visible dans LES DEUX modes : sans lui, activer le
          mode simplifié serait un aller sans retour depuis cet écran. */}
      <Button
        variant="outline"
        size="sm"
        className="self-end"
        onClick={basculerSimplifie}
        aria-pressed={simplifie}
      >
        {simplifie ? (
          <>
            <PanelsTopLeft className="size-3.5" />
            Vue complète
          </>
        ) : (
          <>
            <Sparkles className="size-3.5" />
            Vue simple
          </>
        )}
      </Button>

      {simplifie ? (
        /* Mode simplifié : PLUS RIEN d'autre que cette carte, en plein écran
           et une question à la fois. Le reste du cockpit (chantiers, journal,
           « Depuis ton dernier passage »…) n'a pas disparu — il est à un
           appui sur « Vue complète », toujours dans la même base. */
        <CeQuiAttendTaDecision
          messages={devLog.entries}
          devItems={devItems}
          onRepondre={devLog.repondreAQuestion}
          onEtat={devLog.changerEtatAction}
          entreeCible={entreeCible}
          uneALaFois
        />
      ) : (
        <>
          {/* Tout en haut, et seulement quand il y a quelque chose à dire :
              c'est la question qu'on se pose en revenant, avant même
              d'envoyer quoi que ce soit. */}
          <DepuisTonDernierPassage
            devItems={devItems}
            messages={devLog.entries}
            onNaviguer={voirChantierDuMessage}
          />

          {/* Ce qu'il a dicté sans réseau, AU-DESSUS du tableau et pas dedans :
              le filtre de section ne doit pas pouvoir le masquer — un chantier
              en attente rangé dans une section qu'il ne regarde pas est
              précisément celui qu'il perdrait. Le même composant que l'onglet
              Tâches, pas une seconde carte qui dirait la même chose autrement
              (chantier 8b804a01). Silencieuse quand il n'y a rien. */}
          <EnAttenteDenvoi file={fileEnAttente} illisible={fileIllisible} />

          <OuJenSuis
            devItems={devItems}
            sections={devSectionsState.sections}
            messages={devLog.entries}
            loading={loading}
            error={error}
            onLiberer={libererReservation}
            onVoirSection={voirSection}
          />

          {/* Juste sous « Où j'en suis », qui vient de compter ces
              questions-là dans sa colonne « pour toi » : c'est ici qu'on y
              répond. La carte n'existe pas quand rien n'attend. */}
          <CeQuiAttendTaDecision
            messages={devLog.entries}
            devItems={devItems}
            onRepondre={devLog.repondreAQuestion}
            onEtat={devLog.changerEtatAction}
            entreeCible={entreeCible}
          />

          <NouveauChantier
            devItems={devItems}
            sections={devSectionsState.sections}
            themes={themes}
            onSend={addDevItem}
          />

          <div ref={journalRef}>
            <DevLogFeed
              entries={devLog.entries}
              devItems={devItems}
              total={devLog.total}
              loading={devLog.loading}
              error={devLog.error}
              onRefresh={devLog.refresh}
              onChargerPlus={devLog.chargerPlus}
              onAdd={devLog.addEntry}
              onMarkAnswered={devLog.markAnswered}
            />
          </div>

          {/* Silencieuse quand il n'y a rien à dire. Placée avant le journal :
              un doublon coûte une session entière, il vaut d'être vu tôt. */}
          <DoublonsTrouves
            devItems={devItems}
            onArchive={archiveDevItem}
            onRestore={restoreDevItems}
          />

          {/* Silencieuse quand tous les thèmes ont leur section : signale une
              dérive, ne la corrige jamais toute seule (le bouton fait le
              geste). */}
          <ThemesNonDeclares
            devItems={devItems}
            sections={devSectionsState.sections}
            onDeclarer={(nom) => devSectionsState.addSection(nom)}
          />

          {/* Silencieuse quand il n'y a rien à dire. Déplacée de l'onglet
              Tâches le 7 sept. : une demande à Claude dictée par erreur dans
              ses tâches quotidiennes est un sujet de développement, pas une
              course. */}
          <ChantiersEgares
            tasks={tasksState.tasks}
            devItems={devItems}
            sections={devSectionsState.sections}
            onEnFaireUnChantier={enFaireUnChantier}
            onMarquerFaite={marquerTacheFaite}
            onCreerSection={(nom) => devSectionsState.addSection(nom)}
          />

          <ErreursJarvis
            erreursState={erreursState}
            devItems={devItems}
            sections={devSectionsState.sections}
            onCreerChantier={addDevItem}
          />

          {/* SILENCIEUSE TANT QUE LE DIRECT MARCHE, et c'est mesuré : le
              tableau des chantiers doit commencer avant 482 points sur un
              écran de téléphone (`verifier-cockpit-web.mjs`), et cette barre
              en coûte 44 — essayé, le contrôle est monté à 526 et a rougi. La
              place n'est donc prise que le jour où il y a quelque chose à
              dire. L'onglet Tâches, lui, garde le bouton en permanence :
              c'est là qu'il l'a réclamé. */}
          <BarreActualiser
            seulementSiProbleme
            statut={statut}
            derniereMaj={derniereMajCombinee}
            enCours={enCours}
            onActualiser={actualiser}
          />

          <div ref={tableauRef}>
            {loading ? (
              <p className="py-8 text-center text-muted-foreground">Chargement...</p>
            ) : error ? (
              <LoadError message={error} onRetry={refresh} />
            ) : (
              <CockpitBoard
                devItems={devItems}
                sectionsState={devSectionsState}
                filtre={filtre}
                onFiltre={setFiltre}
                chantierCible={chantierCible}
                onUpdate={updateDevItem}
                onDelete={deleteDevItem}
                onArchive={archiveDevItem}
                onUnarchive={unarchiveDevItem}
                onUpdateMany={updateManyDevItems}
                onArchiveMany={archiveManyDevItems}
                onDeleteMany={deleteManyDevItems}
                onRestore={restoreDevItems}
                onFusionner={fusionnerDevItems}
                onAnnulerFusion={annulerFusionDevItems}
                messages={devLog.entries}
                onRepondre={(itemId, body) => devLog.addEntry(body, "reponse", itemId)}
                onMarquerTraite={devLog.markAnswered}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
