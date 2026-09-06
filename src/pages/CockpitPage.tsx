import { useRef, useState } from "react"
import { LoadError } from "@/components/LoadError"
import { CeQuiAttendTaDecision } from "@/components/cockpit/CeQuiAttendTaDecision"
import { CockpitBoard, themesDe } from "@/components/cockpit/CockpitBoard"
import { DevLogFeed } from "@/components/cockpit/DevLogFeed"
import { DepuisTonDernierPassage } from "@/components/cockpit/DepuisTonDernierPassage"
import { DoublonsTrouves } from "@/components/cockpit/DoublonsTrouves"
import { EnvoyerAClaudeCode } from "@/components/cockpit/EnvoyerAClaudeCode"
import { ErreursJarvis } from "@/components/cockpit/ErreursJarvis"
import { OuJenSuis } from "@/components/cockpit/OuJenSuis"
import { ThemesNonDeclares } from "@/components/cockpit/ThemesNonDeclares"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useAuth } from "@/hooks/useAuth"
import { useDevLog } from "@/hooks/useDevLog"
import { FILTRE_VIDE, type FiltreCockpit } from "@/lib/sections"
import { cleTheme } from "@/lib/themeChantier"

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
 * Le bouton « + Chantier » qui ouvrait un formulaire à cinq champs a été
 * retiré : il faisait exactement la même chose que la fenêtre d'envoi, en
 * plus laborieux, et deux chemins vers le même résultat obligent à choisir
 * avant d'agir. Le formulaire complet reste accessible là où il sert vraiment
 * — le crayon d'une carte, pour retoucher un chantier existant.
 */
export function CockpitPage() {
  const { devItemsState, devSectionsState, erreursState } = useJarvisData()
  const { session } = useAuth()
  const devLog = useDevLog(session?.user.id)
  // Le filtre du tableau vit ici, pas dans le tableau : « Où j'en suis » doit
  // pouvoir l'imposer quand Raphaël appuie sur une section.
  const [filtre, setFiltre] = useState<FiltreCockpit>(FILTRE_VIDE)
  const tableauRef = useRef<HTMLDivElement>(null)
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
    libererReservation,
  } = devItemsState

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

  /** Depuis « Où j'en suis » : le tableau ne garde que cette section, et on
   * l'amène sous les yeux — filtrer sans faire défiler laisserait croire qu'il
   * ne s'est rien passé. */
  function voirSection(nom: string) {
    setFiltre({ ...FILTRE_VIDE, section: nom })
    tableauRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tout en haut, et seulement quand il y a quelque chose à dire : c'est
          la question qu'on se pose en revenant, avant même d'envoyer quoi que
          ce soit. */}
      <DepuisTonDernierPassage devItems={devItems} messages={devLog.entries} />

      <OuJenSuis
        devItems={devItems}
        sections={devSectionsState.sections}
        messages={devLog.entries}
        loading={loading}
        error={error}
        onLiberer={libererReservation}
        onVoirSection={voirSection}
      />

      {/* Juste sous « Où j'en suis », qui vient de compter ces questions-là
          dans sa colonne « pour toi » : c'est ici qu'on y répond. La carte
          n'existe pas quand rien n'attend. */}
      <CeQuiAttendTaDecision
        messages={devLog.entries}
        devItems={devItems}
        onRepondre={devLog.repondreAQuestion}
        onEtat={devLog.changerEtatAction}
      />

      <EnvoyerAClaudeCode
        devItems={devItems}
        sections={devSectionsState.sections}
        themes={themes}
        onSend={addDevItem}
      />

      <DevLogFeed
        entries={devLog.entries}
        devItems={devItems}
        loading={devLog.loading}
        error={devLog.error}
        onRefresh={devLog.refresh}
        onAdd={devLog.addEntry}
        onMarkAnswered={devLog.markAnswered}
      />

      {/* Silencieuse quand il n'y a rien à dire. Placée avant le journal :
          un doublon coûte une session entière, il vaut d'être vu tôt. */}
      <DoublonsTrouves devItems={devItems} onArchive={archiveDevItem} onRestore={restoreDevItems} />

      {/* Silencieuse quand tous les thèmes ont leur section : signale une
          dérive, ne la corrige jamais toute seule (le bouton fait le geste). */}
      <ThemesNonDeclares
        devItems={devItems}
        sections={devSectionsState.sections}
        onDeclarer={(nom) => devSectionsState.addSection(nom)}
      />

      <ErreursJarvis
        erreursState={erreursState}
        devItems={devItems}
        sections={devSectionsState.sections}
        onCreerChantier={addDevItem}
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
            onUpdate={updateDevItem}
            onDelete={deleteDevItem}
            onArchive={archiveDevItem}
            onUnarchive={unarchiveDevItem}
            onUpdateMany={updateManyDevItems}
            onArchiveMany={archiveManyDevItems}
            onDeleteMany={deleteManyDevItems}
            onRestore={restoreDevItems}
            messages={devLog.entries}
            onRepondre={(itemId, body) => devLog.addEntry(body, "reponse", itemId)}
            onMarquerTraite={devLog.markAnswered}
          />
        )}
      </div>
    </div>
  )
}
