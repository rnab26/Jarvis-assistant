import { BellRing, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { NotificationsApi } from "@/hooks/useNotifications"
import { ReglagesSysteme } from "@/lib/reglagesSystemePlugin"
import { CHOIX_AVANT_MIN } from "@/lib/notifications/prefs"

/** "aujourd'hui à 14 h 30", "demain à 09 h 15", "ven. 6 sept. à 09 h 15" —
 * la prochaine notification se lit d'un coup d'œil, sans calculer. */
function quandLisible(date: Date): string {
  const maintenant = new Date()
  const jours = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate()).getTime()) /
      86_400_000,
  )
  const heure = date
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", " h ")
  if (jours === 0) return `aujourd'hui à ${heure}`
  if (jours === 1) return `demain à ${heure}`
  return `${date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} à ${heure}`
}

/** Une heure qu'on règle au pouce. `type="time"` ouvre l'horloge d'Android :
 * un champ texte "HH:MM" se remplit mal sur un téléphone. */
function ChoixHeure({
  id,
  label,
  aide,
  valeur,
  onChange,
}: {
  id: string
  label: string
  aide?: string
  valeur: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <Label htmlFor={id}>{label}</Label>
        {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
      </div>
      <input
        id={id}
        type="time"
        value={valeur}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 rounded-md border bg-background px-2 text-sm tabular-nums"
      />
    </div>
  )
}

/**
 * Ce que Jarvis a le droit de faire sonner.
 *
 * Les interrupteurs sont ceux de la fiche « Quand Jarvis doit te déranger »
 * (4 sept. 2026) : ceux auxquels Raphaël a dit oui. Ceux auxquels il a dit
 * non n'ont pas d'interrupteur du tout — un rendez-vous d'agenda et un mail
 * sont déjà annoncés par Google, et un interrupteur de plus laisserait croire
 * qu'il manque quelque chose. La raison est écrite en bas de la carte pour
 * qu'on ne se repose pas la question dans six mois.
 *
 * L'état arrive en props et n'est pas lu du contexte : c'est ce qui permet au
 * banc d'essai de monter cette carte hors de Supabase et de la parcourir sur
 * un écran de téléphone (scripts/harness/reglages.tsx).
 */
export function Notifications({ api }: { api: NotificationsApi }) {
  const { prefs, pret, setPrefs, etat, programmees, demander, ouvrirAlarmes, tester, effacerTout } =
    api
  const [occupe, setOccupe] = useState(false)
  const [confirmerEffacement, setConfirmerEffacement] = useState(false)
  // Android ne redemande jamais deux fois : après un refus, le seul chemin
  // est l'écran système. On ne le propose qu'à ce moment-là, pour ne pas
  // encombrer l'écran d'un bouton dont on n'a besoin qu'une fois.
  const [refuse, setRefuse] = useState(false)

  async function autoriser() {
    setOccupe(true)
    try {
      const suivant = await demander()
      if (suivant.autorise) {
        setRefuse(false)
        toast.success("Notifications autorisées.")
      } else {
        setRefuse(true)
        toast.error("Autorisation refusée", {
          description: "Android ne la redemande pas. Passe par les réglages du téléphone.",
        })
      }
    } finally {
      setOccupe(false)
    }
  }

  async function ouvrirReglagesAndroid() {
    try {
      await ReglagesSysteme.ouvrirNotifications()
    } catch {
      // Plugin absent (web, ou APK plus ancienne que cette interface depuis
      // la mise à jour rapide) : on dit où aller plutôt que d'échouer sans
      // un mot.
      toast.error("Impossible d'ouvrir les réglages depuis ici", {
        description:
          "Réglages d'Android › Applications › Jarvis › Notifications. Installe la dernière APK pour que le bouton fonctionne.",
      })
    }
  }

  async function envoyerUnTest() {
    setOccupe(true)
    try {
      await tester()
      toast.success("Notification de test envoyée.", {
        description: "Elle doit apparaître tout de suite dans le volet des notifications.",
      })
    } catch {
      toast.error("La notification de test n'est pas partie.")
    } finally {
      setOccupe(false)
    }
  }

  async function toutEffacer() {
    setOccupe(true)
    try {
      await effacerTout()
      setConfirmerEffacement(false)
      toast.success("Toutes les notifications programmées ont été annulées.", {
        description: "Elles seront reprogrammées au prochain changement de tes tâches.",
      })
    } catch {
      toast.error("Impossible de tout annuler.")
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quand Jarvis te dérange</CardTitle>
        <CardDescription>
          Ce qu'il a le droit de faire sonner sur ce téléphone, et à quelle heure. Chaque ligne peut
          être coupée séparément, sans toucher aux autres.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!etat.disponible ? (
          <p className="text-sm text-muted-foreground">
            Les notifications n'existent que dans l'app Android installée : un site web ne peut pas
            te réveiller à 9 h. Ouvre Jarvis depuis l'app pour les régler — les choix faits ici y
            seront retrouvés, ils sont enregistrés avec le reste de tes réglages.
          </p>
        ) : !pret ? (
          <p className="text-sm text-muted-foreground">Vérification…</p>
        ) : !etat.autorise ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Android demande ton autorisation avant qu'une application puisse afficher quoi que ce
              soit. Sans elle, aucun des réglages ci-dessous n'aura d'effet.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={autoriser} disabled={occupe}>
                <BellRing className="size-4" />
                Autoriser les notifications
              </Button>
              {refuse && (
                <Button variant="outline" onClick={ouvrirReglagesAndroid}>
                  Ouvrir les réglages d'Android
                </Button>
              )}
            </div>
            {refuse && (
              <p className="text-sm text-muted-foreground">
                Android ne redemande jamais deux fois : le bouton ci-dessus ouvre directement
                l'écran des notifications de Jarvis, autorise-les là-bas puis reviens.
              </p>
            )}
          </div>
        ) : (
          <>
            {!etat.actives && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>
                  Les notifications de Jarvis sont coupées dans les réglages du téléphone. Rien ne
                  s'affichera tant qu'elles y seront désactivées.
                </p>
                <Button size="sm" variant="outline" className="w-fit" onClick={ouvrirReglagesAndroid}>
                  Ouvrir les réglages d'Android
                </Button>
              </div>
            )}
            {!etat.alarmesExactes && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>
                  Il manque l'autorisation « Alarmes et rappels ». Sans elle, Android a le droit de
                  retarder un rappel de plusieurs dizaines de minutes — un rappel à 14 h peut sonner
                  à 14 h 40.
                </p>
                <Button size="sm" variant="outline" className="w-fit" onClick={() => ouvrirAlarmes()}>
                  Autoriser les alarmes exactes
                </Button>
              </div>
            )}

            <Interrupteur
              titre="L'heure d'une tâche arrive"
              description="Pour les tâches qui ont une date. Une tâche faite ou supprimée cesse aussitôt de sonner."
              actif={prefs.echeance}
              onChange={(actif) => setPrefs({ echeance: actif })}
            >
              {prefs.echeance && (
                <div className="flex flex-col gap-3 border-t pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="avant-echeance">Me prévenir</Label>
                    <Select
                      value={String(prefs.avantMin)}
                      onValueChange={(v) => setPrefs({ avantMin: Number(v) })}
                    >
                      <SelectTrigger id="avant-echeance" className="w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHOIX_AVANT_MIN.map((choix) => (
                          <SelectItem key={choix.valeur} value={String(choix.valeur)}>
                            {choix.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ChoixHeure
                    id="heure-sans-heure"
                    label="Tâche datée sans heure"
                    aide="La plupart des tâches dictées n'ont qu'une date : c'est à cette heure-là qu'elles sonnent."
                    valeur={prefs.heureSansHeure}
                    onChange={(v) => setPrefs({ heureSansHeure: v })}
                  />
                </div>
              )}
            </Interrupteur>

            <Interrupteur
              titre="Le point du matin"
              description="Ce qu'il y a à faire aujourd'hui, et ce qui traîne en retard."
              actif={prefs.matin}
              onChange={(actif) => setPrefs({ matin: actif })}
            >
              {prefs.matin && (
                <div className="border-t pt-3">
                  <ChoixHeure
                    id="heure-matin"
                    label="À quelle heure"
                    valeur={prefs.heureMatin}
                    onChange={(v) => setPrefs({ heureMatin: v })}
                  />
                </div>
              )}
            </Interrupteur>

            <Interrupteur
              titre="Une nouvelle version de l'app"
              description="Silencieux. C'est ce qui évite de rester des semaines sur une version périmée sans le savoir."
              actif={prefs.apk}
              onChange={(actif) => setPrefs({ apk: actif })}
            />

            <Interrupteur
              titre="Une session a livré des chantiers"
              description="Silencieux, et groupé : six chantiers livrés d'affilée font une seule notification."
              actif={prefs.livre}
              onChange={(actif) => setPrefs({ livre: actif })}
            />

            <Interrupteur
              titre="Une session est bloquée et t'attend"
              description="Quand une session Claude Code pose une question dans le journal de bord."
              actif={prefs.bloque}
              onChange={(actif) => setPrefs({ bloque: actif })}
            />

            {/* Sa demande d'origine allait plus loin que la notification :
                « Jarvis doit pouvoir intervenir à l'oral pour donner une
                information tel un rappel » (chantier 7567cd47). Il le fait
                quand l'app est ouverte ou qu'il vient d'appuyer dessus ;
                parler app fermée demanderait un service Android permanent,
                qui reste à cadrer avec lui. */}
            <Interrupteur
              titre="Dire les rappels à voix haute"
              description="Quand l'app est ouverte, ou quand tu appuies sur la notification, Jarvis la dit au lieu de seulement l'afficher. Pendant les heures de silence, seulement si tu viens de t'en servir. Jamais si sa voix est coupée."
              actif={prefs.direAVoixHaute}
              onChange={(actif) => setPrefs({ direAVoixHaute: actif })}
            />

            <Interrupteur
              titre="Ne rien faire sonner la nuit"
              description="Les rappels s'affichent quand même, sans bruit : ils sont là au réveil, ils n'ont réveillé personne."
              actif={prefs.silenceNuit}
              onChange={(actif) => setPrefs({ silenceNuit: actif })}
            >
              {prefs.silenceNuit && (
                <div className="flex flex-col gap-3 border-t pt-3">
                  <ChoixHeure
                    id="silence-debut"
                    label="À partir de"
                    valeur={prefs.silenceDebut}
                    onChange={(v) => setPrefs({ silenceDebut: v })}
                  />
                  <ChoixHeure
                    id="silence-fin"
                    label="Jusqu'à"
                    valeur={prefs.silenceFin}
                    onChange={(v) => setPrefs({ silenceFin: v })}
                  />
                  {/* Sa demande du 6 sept. 2026 : « si on l'utilise pour
                      lancer une action, il faudrait que ça marche ». Les
                      heures de silence protègent son sommeil, pas son
                      attention. L'interrupteur existe pour le cas inverse —
                      lire au lit à côté de quelqu'un qui dort. */}
                  <Interrupteur
                    titre="Sauf si je viens de te parler"
                    description="Un rappel que tu as demandé toi-même se dit quand même, si l'app est ouverte ou si tu as parlé à Jarvis dans le quart d'heure. Ce que Jarvis annonce de lui-même reste muet."
                    actif={prefs.silenceLeveParUsage}
                    onChange={(actif) => setPrefs({ silenceLeveParUsage: actif })}
                  />
                </div>
              )}
            </Interrupteur>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-sm">
                {programmees.total === 0
                  ? "Aucune notification programmée pour l'instant."
                  : `${programmees.total} notification${programmees.total > 1 ? "s" : ""} programmée${programmees.total > 1 ? "s" : ""}.`}
                {programmees.prochaine && ` Prochaine ${quandLisible(programmees.prochaine)}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={envoyerUnTest} disabled={occupe}>
                  <BellRing className="size-4" />
                  Tester
                </Button>
                {programmees.total > 0 &&
                  (confirmerEffacement ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={toutEffacer}
                        disabled={occupe}
                      >
                        Confirmer l'annulation
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmerEffacement(false)}
                      >
                        Annuler
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmerEffacement(true)}
                      disabled={occupe}
                    >
                      <Trash2 className="size-4" />
                      Tout annuler
                    </Button>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* Écrit ici pour ne pas se reposer la question : c'est la règle
            d'aiguillage de Raphaël, pas un oubli. Ce qui atterrit chez Google
            est annoncé par Google. */}
        <p className="text-xs text-muted-foreground">
          Jarvis ne te prévient jamais pour un rendez-vous d'agenda ni pour un mail, même quand
          c'est lui qui les a créés : ils vivent chez Google, et Google prévient déjà. Deux
          notifications pour la même chose, c'est une de trop.
        </p>
      </CardContent>
    </Card>
  )
}
