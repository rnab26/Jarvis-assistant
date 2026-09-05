import { AlertTriangle, Brain, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SILENCE_SUSPECT, type SanteMemoireApi } from "@/hooks/useSanteMemoire"

/** « il y a 3 heures », « hier », « il y a 4 jours ». */
function ilYA(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 2) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} minutes`
  const heures = Math.round(minutes / 60)
  if (heures < 24) return `il y a ${heures} heure${heures > 1 ? "s" : ""}`
  const jours = Math.round(heures / 24)
  return jours === 1 ? "hier" : `il y a ${jours} jours`
}

/**
 * Le témoin de la mémoire : est-ce qu'elle tourne encore ?
 *
 * POURQUOI CETTE LIGNE EXISTE. Le 4 sept. 2026, la mémorisation de Jarvis est
 * restée morte pendant des heures — le modèle sur lequel elle tournait était
 * plafonné à vingt requêtes par jour. Elle est silencieuse par construction
 * (choix de Raphaël : elle ne doit jamais le déranger) et elle avale ses
 * erreurs : rien, absolument rien, ne le disait. 42 échanges dictés, aucun
 * souvenir retenu, et personne pour s'en apercevoir.
 *
 * Ce témoin ne notifie pas et ne dérange pas — la mémoire reste muette, c'est
 * sa décision. Il rend simplement l'état consultable, là où Raphaël va déjà
 * voir ce que Jarvis a retenu.
 */
export function SanteMemoire({ api }: { api: SanteMemoireApi }) {
  const { sante, loading, error, refresh } = api

  if (loading) {
    return <p className="text-xs text-muted-foreground">Vérification de la mémoire...</p>
  }

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Impossible de savoir si la mémoire tourne : {error}</span>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw className="size-3.5" />
          Réessayer
        </Button>
      </div>
    )
  }

  if (!sante) return null

  const { dernierSouvenir, echangesDepuis, erreur } = sante
  // Une panne signalée par la mémoire elle-même vaut mieux qu'un compte : elle
  // dit POURQUOI. Le silence prolongé, lui, rattrape les pannes que la mémoire
  // n'a même pas pu signaler.
  const silence = echangesDepuis >= SILENCE_SUSPECT
  const alerte = silence || erreur !== null

  if (!alerte) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Brain className="size-3.5" />
        {dernierSouvenir
          ? `Mémoire active — dernière mise à jour ${ilYA(dernierSouvenir)}.`
          : "Jarvis n'a encore rien retenu."}
        {echangesDepuis > 0 && ` ${echangesDepuis} échange${echangesDepuis > 1 ? "s" : ""} depuis.`}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        La mémoire de Jarvis ne retient plus rien
      </p>
      {silence && (
        <p className="text-sm">
          {echangesDepuis} échanges dictés depuis la dernière chose retenue
          {dernierSouvenir ? ` (${ilYA(dernierSouvenir)})` : ""}. Il arrive souvent qu'un échange
          n'ait rien à retenir, mais jamais autant d'affilée : au-delà de {SILENCE_SUSPECT}, c'est
          qu'elle a cessé de fonctionner.
        </p>
      )}
      {erreur && (
        <p className="text-sm">
          Elle a signalé : « {erreur.titre} »{erreur.occurrences > 1 && `, ${erreur.occurrences} fois`}
          , la dernière {ilYA(erreur.lastSeen)}.
          {erreur.detail && (
            <span className="block text-xs text-muted-foreground">{erreur.detail}</span>
          )}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Le reste de Jarvis n'est pas touché : tes tâches, tes chantiers et tes conversations
        continuent d'être enregistrés. Le détail est dans le registre des erreurs du cockpit.
      </p>
      <div>
        <Button variant="outline" size="sm" onClick={refresh}>
          <RefreshCw className="size-4" />
          Revérifier
        </Button>
      </div>
    </div>
  )
}
