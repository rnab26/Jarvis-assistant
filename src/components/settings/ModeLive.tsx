import { useState } from "react"
import { Trash2, Plus, RotateCcw } from "lucide-react"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import {
  DELAI_ADIEU_DEFAUT_MS,
  ecrireClotureActif,
  ecrireClotureDelai,
  ecrireClotureFormules,
  ecrireModeLive,
  formulesAffichees,
  lireClotureLive,
  lireModeLive,
} from "@/lib/livePrefs"
import { normaliserPourFin } from "@/lib/live/finConversation"
import { REGLAGES_RESTAURES } from "@/lib/reglages"

/** Choix proposés pour le délai d'adieu — bornés par DELAI_ADIEU_MIN_MS et
 * DELAI_ADIEU_MAX_MS (livePrefs.ts). Pas un champ libre : une valeur en
 * millisecondes taper à la main n'a aucun sens pour lui sur un téléphone. */
const DELAIS_ADIEU_MS = [2000, 4000, 6000, 8000, 12000, 20000]

function libelleDelai(ms: number): string {
  return `${(ms / 1000).toFixed(0)} s${ms === DELAI_ADIEU_DEFAUT_MS ? " (par défaut)" : ""}`
}

export function ModeLive() {
  const [actif, setActif] = useState(lireModeLive)
  const [cloture, setCloture] = useState(lireClotureLive)
  const [formules, setFormules] = useState(() => formulesAffichees(lireClotureLive()))
  const [ajout, setAjout] = useState("")
  const [erreur, setErreur] = useState<string | null>(null)

  useRelireApresRestauration(() => {
    setActif(lireModeLive())
    const suivant = lireClotureLive()
    setCloture(suivant)
    setFormules(formulesAffichees(suivant))
  })

  function basculer(valeur: boolean) {
    setActif(valeur)
    ecrireModeLive(valeur)
    // Le micro garde le mode dans son propre état React : sans ce signal, il
    // continuerait sur l'ancien mode jusqu'au prochain lancement de l'app, et
    // l'interrupteur aurait l'air de ne rien commander. C'est exactement le
    // signal que tous les réglages écoutent déjà pour se relire.
    window.dispatchEvent(new Event(REGLAGES_RESTAURES))
  }

  /** Écrit puis relit : une écriture qui ne tient pas (stockage plein,
   * navigation privée) doit se voir, et ne doit pas laisser croire que la
   * valeur précédente a changé. */
  function ecrireEtVerifier<T>(
    ecrire: () => void,
    valeurAttendueLue: () => T,
    valeurAttendue: T,
    appliquer: (v: T) => void,
    ancienneValeur: T,
  ) {
    ecrire()
    const relue = valeurAttendueLue()
    if (JSON.stringify(relue) !== JSON.stringify(valeurAttendue)) {
      setErreur("Le réglage n'a pas pu s'enregistrer sur cet appareil. La valeur précédente reste active.")
      appliquer(ancienneValeur)
      return
    }
    setErreur(null)
    appliquer(valeurAttendue)
  }

  function basculerCloture(valeur: boolean) {
    const avant = cloture
    ecrireEtVerifier(
      () => ecrireClotureActif(valeur),
      () => lireClotureLive().actif,
      valeur,
      (v) => setCloture((c) => ({ ...c, actif: v })),
      avant.actif,
    )
  }

  function enregistrerFormules(suivantes: string[]) {
    const avant = formules
    ecrireEtVerifier(
      () => ecrireClotureFormules(suivantes),
      () => formulesAffichees(lireClotureLive()),
      suivantes,
      setFormules,
      avant,
    )
  }

  function ajouter() {
    const propre = normaliserPourFin(ajout)
    if (!propre) return
    if (formules.some((f) => normaliserPourFin(f) === propre)) {
      setAjout("")
      return
    }
    enregistrerFormules([...formules, ajout.trim()])
    setAjout("")
  }

  function supprimer(formule: string) {
    enregistrerFormules(formules.filter((f) => f !== formule))
  }

  function remettreParDefaut() {
    ecrireClotureFormules(null)
    setErreur(null)
    setFormules(formulesAffichees(lireClotureLive()))
  }

  function changerDelai(valeur: string) {
    const ms = Number(valeur)
    const avant = cloture.delaiMs
    ecrireEtVerifier(
      () => ecrireClotureDelai(ms),
      () => lireClotureLive().delaiMs,
      ms,
      (v) => setCloture((c) => ({ ...c, delaiMs: v })),
      avant,
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode conversation Live (essai)</CardTitle>
        <CardDescription>
          Deux façons de parler à Jarvis, et on mesure laquelle tient. Sans ce mode, le téléphone
          transcrit ta phrase puis l'envoie. Avec, l'audio part en continu chez Google, qui gère
          lui-même la fin de tour, l'interruption et la transcription — plus fluide en principe,
          encore en essai en pratique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Interrupteur
          titre="Mode conversation Live"
          description={
            actif
              ? "Le cœur ouvre une conversation continue. Dis « terminé » ou « au revoir » pour la fermer."
              : "Le micro classique : tu appuies, tu parles, Jarvis répond."
          }
          actif={actif}
          onChange={basculer}
        />

        {actif && (
          <div className="space-y-3 border-t pt-4">
            <Interrupteur
              titre="Clôturer à la voix"
              description={
                cloture.actif
                  ? "Une des formules ci-dessous ferme la conversation, sans toucher l'écran."
                  : "Désactivé : seul un appui sur le cœur ferme la conversation."
              }
              actif={cloture.actif}
              onChange={basculerCloture}
            />

            {cloture.actif && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ce qui ferme la conversation</p>
                  <p className="text-xs text-muted-foreground">
                    Dis n'importe laquelle de ces phrases pour clore, précédée si tu veux d'un mot
                    de politesse (« Merci, terminé »).
                  </p>
                </div>

                {formules.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Liste vide : plus aucune formule ne ferme la conversation par la voix.
                  </p>
                )}

                <ul className="space-y-1">
                  {formules.map((formule) => (
                    <li
                      key={formule}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1"
                    >
                      <span className="truncate text-xs">{formule}</span>
                      <ConfirmerAction
                        trigger={
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        }
                        titre={`Retirer « ${formule} » ?`}
                        description="Cette phrase ne fermera plus la conversation par la voix. Tu peux la rajouter à tout moment."
                        libelleConfirmation="Retirer"
                        onConfirmer={() => supprimer(formule)}
                      />
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2">
                  <Input
                    value={ajout}
                    onChange={(e) => setAjout(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") ajouter()
                    }}
                    placeholder="Ajouter une formule"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Ajouter la formule"
                    onClick={ajouter}
                    disabled={ajout.trim().length < 2}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={remettreParDefaut}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Remettre la liste par défaut
                </Button>

                <div className="space-y-2 border-t pt-3">
                  <Label htmlFor="delai-adieu">Le temps qu'il a pour dire au revoir</Label>
                  <Select value={String(cloture.delaiMs)} onValueChange={changerDelai}>
                    <SelectTrigger id="delai-adieu">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DELAIS_ADIEU_MS.map((ms) => (
                        <SelectItem key={ms} value={String(ms)}>
                          {libelleDelai(ms)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Passé ce délai, la conversation se ferme même si Jarvis n'a pas fini sa phrase.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {erreur && <p className="text-xs text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}
