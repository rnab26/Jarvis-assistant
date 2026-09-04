import { Send, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { decouperDemande } from "@/lib/demandeChantier"
import { suggererSection } from "@/lib/suggestionTheme"
import { resoudreTheme } from "@/lib/themeChantier"
import type { DevItem, DevItemInput, DevPriority, DevSection } from "@/types/database"

/** Les trois crans, du plus calme au plus pressé. */
const PRIORITES: { valeur: DevPriority; libelle: string }[] = [
  { valeur: "low", libelle: "Quand tu peux" },
  { valeur: "normal", libelle: "Normal" },
  { valeur: "high", libelle: "Urgent" },
]

/**
 * La fenêtre d'où Raphaël envoie un chantier à Claude Code.
 *
 * CE QUE C'EST VRAIMENT, ET POURQUOI C'EST ÉCRIT ICI. Il n'existe aucune API
 * pour pousser un chantier vers une session Claude Code en train de tourner :
 * une session ne reçoit rien, elle LIT. Au démarrage, le hook
 * .claude/hooks/session-start.sh interroge la base et injecte les chantiers et
 * le journal dans son contexte. « Envoyer à Claude Code » veut donc dire :
 * écrire une ligne dans dev_items que la PROCHAINE session lira.
 *
 * L'écart entre les deux — envoyer et être lu — est la seule chose qui peut
 * décevoir ici. D'où le bandeau permanent en bas de la fenêtre : il dit
 * combien de sessions travaillent en ce moment, et que ce qu'il envoie leur
 * parviendra à leur prochain démarrage, pas maintenant. Ne pas le retirer
 * pour gagner de la place : sans lui, la fenêtre promet un envoi temps réel
 * qu'elle ne tient pas.
 */

/** Au-delà, la réservation ne prouve plus qu'une session est vivante. */
function sessionsActives(devItems: DevItem[]): string[] {
  const maintenant = Date.now()
  return [
    ...new Set(
      devItems
        .filter(
          (i) =>
            i.claimed_by &&
            i.claim_expires_at &&
            new Date(i.claim_expires_at).getTime() > maintenant,
        )
        .map((i) => i.claimed_by!.replace(/^claude\//, "")),
    ),
  ].sort((a, b) => a.localeCompare(b, "fr"))
}

interface EnvoyerAClaudeCodeProps {
  devItems: DevItem[]
  sections: DevSection[]
  themes: string[]
  onSend: (input: DevItemInput) => Promise<unknown>
}

export function EnvoyerAClaudeCode({
  devItems,
  sections,
  themes,
  onSend,
}: EnvoyerAClaudeCodeProps) {
  const [texte, setTexte] = useState("")
  const [theme, setTheme] = useState("")
  const [nouveauTheme, setNouveauTheme] = useState(false)
  const [priorite, setPriorite] = useState<DevPriority>("normal")
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState<string | null>(null)
  // Tant qu'il n'a pas touché aux puces lui-même, la suggestion mène. Dès
  // qu'il en choisit une, elle ne bouge plus sous ses doigts.
  const [choisiAlaMain, setChoisiAlaMain] = useState(false)

  const actives = sessionsActives(devItems)
  const apercu = decouperDemande(texte)

  // « Des fois on ne sait pas quel est le thème le plus approprié à
  // sélectionner » (chantier 41816bdc) : la section la plus probable est
  // pré-sélectionnée d'après ce que les sections contiennent déjà. Calcul
  // local — aucun appel au modèle, donc aucun quota consommé pour ranger.
  const suggestion = useMemo(
    () => (texte.trim().length < 8 ? null : suggererSection(texte, devItems, sections)),
    [texte, devItems, sections],
  )

  // Le thème retenu est DÉRIVÉ, pas recopié dans un état : tant que Raphaël
  // n'a rien choisi, c'est la suggestion qui vaut, et elle suit ce qu'il tape
  // sans qu'un effet ait à la recopier (un état recopié d'un autre finit
  // toujours par diverger d'un rendu sur l'autre).
  const themeRetenu = choisiAlaMain ? theme : (suggestion?.nom ?? "")

  async function envoyer() {
    if (!apercu.titre) return
    setEnvoi(true)
    try {
      await onSend({
        title: apercu.titre,
        notes: apercu.notes,
        status: "todo",
        priority: priorite,
        // Passe par resoudreTheme : si un thème équivalent existe déjà, c'est
        // LUI qui est enregistré, à l'orthographe près. Sans ça, « L app
        // elle-meme » vient doubler « L'app elle-même » et coupe le sujet en
        // deux dans le cockpit — arrivé pour de vrai, nettoyé le 3 sept.
        theme: resoudreTheme(themeRetenu, themes),
      })
      setEnvoye(apercu.titre)
      setTexte("")
      setPriorite("normal")
      // Le thème reste : il enchaîne souvent plusieurs demandes sur un sujet.
    } catch {
      // Déjà signalé par un toast : on garde sa saisie plutôt que de la perdre.
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Envoyer à Claude Code</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={texte}
          rows={3}
          placeholder="Ce qu'il faut faire. La première phrase devient le titre, rien n'est perdu."
          aria-label="Ce qu'il faut faire"
          onChange={(e) => {
            setTexte(e.target.value)
            setEnvoye(null)
          }}
        />

        {/* Le titre est calculé, pas saisi : le montrer évite la surprise
            d'un chantier qui apparaît sous un intitulé qu'il n'a pas choisi. */}
        {apercu.notes && (
          <p className="text-xs text-muted-foreground">
            Titre du chantier : <span className="font-medium">{apercu.titre}</span>
          </p>
        )}

        {/* Des puces plutôt qu'un champ libre : sur un téléphone, retaper
            « L'app elle-même » à la main finit par produire « L app
            elle-meme », un second thème pour le même sujet. On choisit ce qui
            existe ; écrire reste possible, mais c'est le geste rare. */}
        <div className="flex flex-col gap-2">
          <Label>Thème (facultatif)</Label>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={themeRetenu === t && !nouveauTheme}
                onClick={() => {
                  setNouveauTheme(false)
                  setChoisiAlaMain(true)
                  setTheme(themeRetenu === t ? "" : t)
                }}
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                  themeRetenu === t && !nouveauTheme
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {!choisiAlaMain && suggestion?.nom === t && <Sparkles className="size-3" />}
                {t}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={nouveauTheme}
              onClick={() => {
                setNouveauTheme(!nouveauTheme)
                setChoisiAlaMain(true)
                setTheme("")
              }}
              className={`rounded-full border border-dashed px-2.5 py-1 text-xs ${
                nouveauTheme ? "border-primary text-primary" : "text-muted-foreground"
              }`}
            >
              Nouveau thème
            </button>
          </div>
          {nouveauTheme && (
            <Input
              value={theme}
              autoFocus
              placeholder="Nom du nouveau thème"
              aria-label="Nom du nouveau thème"
              onChange={(e) => setTheme(e.target.value)}
            />
          )}

          {/* La suggestion se dit, et dit sur quoi elle s'appuie : une
              proposition qu'on ne peut pas juger est acceptée sans être lue,
              et range le chantier au mauvais endroit sans que personne le
              voie. */}
          {!choisiAlaMain && suggestion && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="size-3" />
              Section suggérée : <span className="font-medium">{suggestion.nom}</span>
              {suggestion.motsCommuns.length > 0 && (
                <>— d'après « {suggestion.motsCommuns.slice(0, 4).join(", ")} »</>
              )}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setChoisiAlaMain(true)
                  setTheme("")
                }}
              >
                choisir moi-même
              </button>
            </p>
          )}
        </div>

        {/* Trois crans, pas un interrupteur. Avec « urgent ou pas », tout ce
            qui comptait un peu partait en urgent, et plus rien ne ressortait :
            demande de Raphaël, « ajouter un niveau moyen pour éviter d'avoir
            beaucoup de tâche urgente ». */}
        <div className="flex flex-col gap-2">
          <Label>Priorité</Label>
          <div className="flex gap-1.5">
            {PRIORITES.map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={priorite === valeur}
                onClick={() => setPriorite(valeur)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  priorite === valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          className="self-end"
          disabled={envoi || !apercu.titre}
          onClick={envoyer}
        >
          <Send className="size-4" />
          Envoyer
        </Button>

        {envoye && (
          <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            « {envoye} » est dans la liste ci-dessous.{" "}
            {actives.length > 0
              ? "Les sessions en cours ne le verront pas maintenant : elles liront la base à leur prochain démarrage."
              : "La prochaine session le lira à son démarrage."}
          </p>
        )}

        {/* Ce bandeau ne dit plus QUI travaille — la carte « Qui travaille en
            ce moment », juste en dessous, le dit mieux et en entier. Il garde
            la seule chose que cette fenêtre-ci doit promettre : ce qu'on
            envoie ne part pas vers une session en cours. */}
        <p className="text-xs text-muted-foreground">
          Un chantier envoyé d'ici n'est pas poussé vers une session : chaque session lit
          la base à son démarrage. L'effet est donc différé jusqu'à la prochaine.
        </p>
      </CardContent>
    </Card>
  )
}
