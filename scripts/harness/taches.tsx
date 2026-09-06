import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Toaster } from "@/components/ui/sonner"
import { TaskFormDialog } from "@/components/tasks/TaskFormDialog"
import { TaskItem } from "@/components/tasks/TaskItem"
import { ChantiersEgares } from "@/components/tasks/ChantiersEgares"
import { EnAttenteDenvoi } from "@/components/tasks/EnAttenteDenvoi"
import type { ElementEnAttente } from "@/lib/fileEnAttente"
import { Button } from "@/components/ui/button"
import { PREFS_NOTIFS_DEFAUT } from "@/lib/notifications/prefs"
import type { DevItem, Task } from "@/types/database"

/**
 * Banc d'essai de la ligne de tâche — la vraie, montée hors de Supabase.
 *
 * Ce qu'il vérifie tient en une phrase : la corbeille d'une tâche demande
 * avant de supprimer. Jusqu'au 5 sept. 2026 elle supprimait au premier appui,
 * sans un mot, et une tâche supprimée ne se retrouve nulle part — il n'y a pas
 * d'archive pour les tâches, contrairement aux chantiers.
 */
const rien = async () => {}

function tache(id: string, title: string, notes: string | null = null): Task {
  return {
    id,
    user_id: "banc",
    category_id: null,
    title,
    notes,
    due_date: null,
    due_time: null,
    status: "todo",
    created_at: "2026-09-04T10:00:00Z",
    updated_at: "2026-09-04T10:00:00Z",
  }
}

const TACHES: Task[] = [
  tache("t1", "Appeler le plombier", "Avant vendredi"),
  // Une de ses VRAIES tâches du 5 sept. : une demande à Claude atterrie dans
  // sa liste de courses, où aucune session ne l'aurait jamais lue.
  tache("t2", "R un chantier : savoir combien il reste de credit"),
  // Et une vraie tâche qui parle d'un chantier de maçonnerie : elle ne doit
  // RIEN déclencher. Raphaël est dans l'immobilier — c'est le sens courant
  // du mot chez lui.
  tache("t3", "Commander les carreaux pour le chantier de la villa Dan"),
  tache("t4", "Racheter un spot pour l'entrée de la maison"),
  // Une seconde demande à Claude, elle aussi déjà présente dans le cockpit :
  // le cas le plus fréquent dans ses vraies données (quatre sur six).
  tache("t5", "R un chantier sur la latence du mode Live"),
  // Une tâche datée dans le futur : c'est elle qui doit dire QUAND Jarvis
  // préviendra. Et « Racheter un spot », sans date, doit dire pourquoi il ne
  // préviendra pas — vingt-deux de ses trente tâches sont dans ce cas.
  {
    ...tache("t6", "Programmer l'intervention Avihai"),
    due_date: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    due_time: "14:00",
  },
]

/**
 * Deux chantiers du cockpit, dont UN qui correspond déjà à une tâche égarée.
 *
 * C'est le cas mesuré sur ses vraies données le 6 sept. : quatre des six
 * tâches égarées avaient déjà leur chantier. Sans ce garde-fou, un appui
 * créait un doublon de quelque chose parfois déjà livré.
 */
const CHANTIERS: DevItem[] = [
  {
    id: "d1",
    user_id: "banc",
    title: "Savoir combien il reste de crédit, et à combien de temps de discussion ça équivaut",
    notes: null,
    status: "todo",
    priority: "normal",
    theme: "Coût de fonctionnement",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
  },
  {
    id: "d2",
    user_id: "banc",
    title: "Live dans l'app : lent, coupures, la latence du mode Live sur l'appareil",
    notes: null,
    status: "todo",
    priority: "high",
    theme: "Voix et écoute",
    archived_at: null,
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    created_at: "2026-09-05T10:00:00Z",
    updated_at: "2026-09-05T10:00:00Z",
  },
]

/**
 * Ce qu'il a dicté sans réseau. Deux états, et le second est celui qui trompe :
 * une tâche qu'on renvoie encore, et une qu'on a cessé de renvoyer — celle-là
 * n'est PAS enregistrée, et rien ne doit laisser croire le contraire.
 */
const EN_ATTENTE: ElementEnAttente[] = [
  {
    id: "f1",
    cible: "tasks",
    contenu: {},
    libelle: "acheter du pain",
    creeA: Date.now() - 60_000,
    essais: 1,
    dernierEchec: "Failed to fetch",
    dernierEssaiA: Date.now() - 30_000,
  },
]

const EN_ATTENTE_BLOQUE: ElementEnAttente[] = [
  { ...EN_ATTENTE[0], id: "f2", libelle: "relancer le notaire", essais: 5 },
]

/** Les mêmes, telles qu'elles apparaissent DANS la liste. */
const TACHES_EN_ATTENTE: Task[] = [
  {
    ...TACHES[0],
    id: "f1",
    title: "acheter du pain",
    notes: null,
    due_date: null,
    due_time: null,
    status: "todo",
    enAttente: true,
    echecEnvoi: "Failed to fetch",
    envoiBloque: false,
  },
  {
    ...TACHES[0],
    id: "f2",
    title: "relancer le notaire",
    notes: null,
    due_date: null,
    due_time: null,
    status: "todo",
    enAttente: true,
    echecEnvoi: "Failed to fetch",
    envoiBloque: true,
  },
]

function BancDesTaches() {
  const [taches, setTaches] = useState<Task[]>(TACHES)
  const [chantiersCrees, setChantiersCrees] = useState<string[]>([])

  return (
    <div className="flex flex-col gap-2 p-3">
      <Toaster />
      <TaskFormDialog
        categories={[]}
        taches={taches}
        onSubmit={rien}
        trigger={<Button size="sm">Nouvelle tâche</Button>}
      />
      <p id="chantiers-crees">Chantiers créés : {chantiersCrees.join(" | ") || "aucun"}</p>
      {/* La carte qui RASSEMBLE les tâches égarées, en tête de l'onglet. Ses
          mots du 6 sept. : « je ne vois pas de quelles 7 lignes existantes tu
          parles » — le signalement était sur chaque ligne, réparti dans
          vingt-neuf tâches. */}
      <div id="egares">
        <ChantiersEgares
          tasks={taches}
          devItems={CHANTIERS}
          onEnFaireUnChantier={async (t, titre) => {
            setChantiersCrees((liste) => [...liste, titre])
            setTaches((liste) => liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)))
          }}
          onMarquerFaite={async (t) => {
            setTaches((liste) => liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)))
          }}
        />
      </div>
      {taches.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          categories={[]}
          onToggle={rien}
          onUpdate={rien}
          onDelete={async (id) => {
            setTaches((liste) => liste.filter((x) => x.id !== id))
          }}
          prefsNotifs={PREFS_NOTIFS_DEFAUT}
          onEnFaireUnChantier={async (titre) => {
            setChantiersCrees((liste) => [...liste, titre])
            setTaches((liste) =>
              liste.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)),
            )
          }}
        />
      ))}
      {taches.length === 0 && <p id="vide">Plus aucune tâche.</p>}

      {/* La carte de résumé, dans ses trois états. Le premier vérifie un
          SILENCE : rien en attente, rien à l'écran. */}
      <div id="attente-rien">
        <EnAttenteDenvoi file={[]} />
      </div>
      <div id="attente">
        <EnAttenteDenvoi file={EN_ATTENTE} />
      </div>
      <div id="attente-bloque">
        <EnAttenteDenvoi file={EN_ATTENTE_BLOQUE} />
      </div>
      <div id="attente-illisible">
        <EnAttenteDenvoi file={[]} illisible />
      </div>

      {/* Et les lignes elles-mêmes : c'est là qu'il agit. */}
      <div id="lignes-attente">
        {TACHES_EN_ATTENTE.map((t) => (
          <TaskItem
            key={t.id}
            task={t}
            categories={[]}
            onToggle={rien}
            onUpdate={rien}
            onDelete={rien}
            onRelancerEnvoi={(id) => setChantiersCrees((l) => [...l, `relance:${id}`])}
            onOublierEnAttente={(id) => setChantiersCrees((l) => [...l, `oubli:${id}`])}
          />
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancDesTaches />)
