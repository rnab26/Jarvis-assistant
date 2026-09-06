import { Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { depuisDerniereVisite, depuisQuand } from "@/lib/depuisDerniereVisite"
import { courtAuteur } from "@/lib/journalBord"
import type { DevItem, DevLogEntry } from "@/types/database"

/** Sur CET écran seulement : voir STOCKAGE_LOCAL_ASSUME dans reglages.ts. */
const CLE = "jarvis_cockpit_vu"

/**
 * « Depuis ton dernier passage » — ce qui a bougé pendant qu'il n'était pas là.
 *
 * Raphaël lance plusieurs sessions et s'absente une nuit ou une journée. Il
 * revient sur un cockpit où des chantiers ont été livrés, d'autres ouverts, et
 * où des sessions lui ont écrit. Rien ne le lui disait : il fallait comparer
 * de tête avec ce qu'il avait vu la veille, ou tout relire.
 *
 * Deux choix qui comptent :
 *   — la date de visite n'est enregistrée QUE quand il appuie sur « Vu ». Si
 *     elle se mettait à jour toute seule à l'affichage, le bandeau
 *     disparaîtrait avant qu'il ait eu le temps de le lire, et il n'aurait
 *     aucun moyen de le retrouver.
 *   — la toute première ouverture n'annonce rien : sans repère, « tout est
 *     nouveau » serait faux et couvrirait l'écran.
 *
 * CE QUI A ÉTÉ CORRIGÉ LE 6 SEPT., et pourquoi il ne faut pas le défaire.
 * Ce matin-là il a regardé son cockpit sans arriver à savoir ce qui avait
 * bougé. Monté sur ses VRAIES données, le bandeau disait « 14 livrés,
 * 2 nouveaux, 10 messages », trois titres, « … et 11 autres livrés » — puis
 * DEUX comptes rendus d'une session à l'autre, de 2 000 et 2 500 caractères,
 * qui occupaient les deux lignes les plus précieuses de l'écran. Il ne
 * pouvait pas lire ce qui avait bougé : ce qui avait bougé était sous un mur
 * de notes techniques qui ne lui étaient pas adressées.
 *
 * Donc : les livrés se lisent TOUS (le reste est à un appui, pas caché
 * derrière « … et 11 autres »), ce qui lui est ADRESSÉ se lit — même règle
 * que le badge du journal, `estPourRaphael` —, et ce que les sessions
 * s'écrivent entre elles se COMPTE sans se déballer.
 */
interface DepuisTonDernierPassageProps {
  devItems: DevItem[]
  messages: DevLogEntry[]
}

function lire(): string | null {
  try {
    return localStorage.getItem(CLE)
  } catch {
    // Navigateur qui refuse le stockage : on n'annonce rien, on ne casse rien.
    return null
  }
}

/** Combien de chantiers livrés on lit d'emblée. Au-delà, un appui : une nuit
 * de sessions autonomes en livre quatorze, et quatorze lignes en tête du
 * cockpit repoussent le tableau hors de l'écran. */
const LIVRES_EN_TETE = 5

export function DepuisTonDernierPassage({ devItems, messages }: DepuisTonDernierPassageProps) {
  const [vuLe, setVuLe] = useState<string | null>(null)
  const [masque, setMasque] = useState(false)
  const [toutVoir, setToutVoir] = useState(false)

  // Au montage seulement : la date lue est celle du passage PRÉCÉDENT, et elle
  // ne doit pas bouger pendant qu'il regarde.
  useEffect(() => {
    setVuLe(lire())
  }, [])

  const bilan = useMemo(
    () => depuisDerniereVisite(devItems, messages, vuLe),
    [devItems, messages, vuLe],
  )

  if (masque || !bilan.quelqueChose || !bilan.depuis) return null

  function marquerVu() {
    try {
      localStorage.setItem(CLE, new Date().toISOString())
    } catch {
      // Rien à faire : on masque quand même pour cette session d'affichage.
    }
    setMasque(true)
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm font-medium">
            {bilan.origine === "passage"
              ? `Depuis ton dernier passage, ${depuisQuand(bilan.depuis)}`
              : `Depuis ton dernier message, ${depuisQuand(bilan.depuis)}`}
          </p>
          <Button variant="ghost" size="sm" onClick={marquerVu}>
            <Check className="size-3.5" />
            Vu
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {bilan.livres.length > 0 && (
            <Badge variant="secondary">
              {bilan.livres.length} livré{bilan.livres.length > 1 ? "s" : ""}
            </Badge>
          )}
          {bilan.nouveaux.length > 0 && (
            <Badge variant="outline">
              {bilan.nouveaux.length} nouveau{bilan.nouveaux.length > 1 ? "x" : ""}
            </Badge>
          )}
          {bilan.messages.length > 0 && (
            <Badge variant="destructive">
              {bilan.messages.length} pour toi
            </Badge>
          )}
        </div>

        {/* CE QUI A ÉTÉ LIVRÉ, en entier. « … et 11 autres livrés » disait le
            nombre et cachait la réponse : c'est justement ce qu'il cherchait. */}
        {(toutVoir ? bilan.livres : bilan.livres.slice(0, LIVRES_EN_TETE)).map((item) => (
          <p key={item.id} className="truncate text-xs text-muted-foreground">
            ✓ {item.title}
          </p>
        ))}
        {!toutVoir && bilan.livres.length > LIVRES_EN_TETE && (
          <button
            type="button"
            className="flex items-center gap-1 self-start text-xs text-muted-foreground underline"
            onClick={() => setToutVoir(true)}
          >
            <ChevronRight className="size-3" />
            Voir les {bilan.livres.length - LIVRES_EN_TETE} autres livrés
          </button>
        )}
        {toutVoir && bilan.livres.length > LIVRES_EN_TETE && (
          <button
            type="button"
            className="flex items-center gap-1 self-start text-xs text-muted-foreground underline"
            onClick={() => setToutVoir(false)}
          >
            <ChevronDown className="size-3" />
            Replier
          </button>
        )}

        {/* Ce qu'une session a écrit POUR LUI, coupé court : le bandeau dit
            qu'il y a quelque chose, le journal le dit en entier. */}
        {bilan.messages.slice(0, 2).map((m) => (
          <p key={m.id} className="truncate text-xs">
            💬 {courtAuteur(m.author)} : {extraitLisible(m.body)}
          </p>
        ))}

        {/* Et ce que les sessions se disent entre elles : compté, jamais
            déballé. Deux notes de 2 000 caractères tenaient ici le 6 sept. */}
        {bilan.notesEntreSessions > 0 && (
          <p className="text-xs text-muted-foreground/70">
            {bilan.notesEntreSessions} note{bilan.notesEntreSessions > 1 ? "s" : ""} entre sessions,
            dans le journal de bord.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Le début d'un message, coupé net.
 *
 * Une session écrit des comptes rendus de plusieurs milliers de caractères.
 * Les couper au CSS (`truncate`) rend une ligne, mais le navigateur doit
 * d'abord mettre en page tout le texte, et surtout : une phrase coupée au
 * pixel près se termine n'importe où. On coupe au mot, avec des points de
 * suspension, pour que le fragment reste une phrase.
 */
function extraitLisible(corps: string, maximum = 110): string {
  const propre = corps.replace(/\s+/g, " ").trim()
  if (propre.length <= maximum) return propre
  const coupe = propre.slice(0, maximum)
  const espace = coupe.lastIndexOf(" ")
  return `${espace > 40 ? coupe.slice(0, espace) : coupe}…`
}
