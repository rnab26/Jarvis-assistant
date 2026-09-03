import { Send } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { decouperDemande } from "@/lib/demandeChantier"
import type { DevItem, DevItemInput } from "@/types/database"

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
  themes: string[]
  onSend: (input: DevItemInput) => Promise<void>
}

export function EnvoyerAClaudeCode({ devItems, themes, onSend }: EnvoyerAClaudeCodeProps) {
  const [texte, setTexte] = useState("")
  const [theme, setTheme] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [envoye, setEnvoye] = useState<string | null>(null)

  const actives = sessionsActives(devItems)
  const apercu = decouperDemande(texte)

  async function envoyer() {
    if (!apercu.titre) return
    setEnvoi(true)
    try {
      await onSend({
        title: apercu.titre,
        notes: apercu.notes,
        status: "todo",
        priority: urgent ? "high" : "normal",
        theme: theme.trim() || null,
      })
      setEnvoye(apercu.titre)
      setTexte("")
      setUrgent(false)
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="envoi-theme">Thème (facultatif)</Label>
          <Input
            id="envoi-theme"
            list="envoi-themes"
            value={theme}
            placeholder="Reprends un thème existant"
            onChange={(e) => setTheme(e.target.value)}
          />
          <datalist id="envoi-themes">
            {themes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Switch id="envoi-urgent" checked={urgent} onCheckedChange={setUrgent} />
            <Label htmlFor="envoi-urgent" className="font-normal">
              {urgent ? "Urgent — passera devant" : "Priorité normale"}
            </Label>
          </div>
          <Button size="sm" disabled={envoi || !apercu.titre} onClick={envoyer}>
            <Send className="size-4" />
            Envoyer
          </Button>
        </div>

        {envoye && (
          <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            « {envoye} » est dans la liste ci-dessous.{" "}
            {actives.length > 0
              ? "Les sessions en cours ne le verront pas maintenant : elles liront la base à leur prochain démarrage."
              : "La prochaine session le lira à son démarrage."}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {actives.length === 0
            ? "Aucune session Claude Code ne travaille en ce moment."
            : `${actives.length} session${actives.length > 1 ? "s" : ""} au travail : ${actives.join(", ")}.`}{" "}
          Un chantier envoyé d'ici n'est pas poussé vers une session : chaque session lit
          la base à son démarrage. L'effet est donc différé jusqu'à la prochaine.
        </p>
      </CardContent>
    </Card>
  )
}
