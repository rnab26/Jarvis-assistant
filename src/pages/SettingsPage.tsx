import { Capacitor } from "@capacitor/core"
import { Search, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Badge } from "@/components/ui/badge"
import { AppsParDefaut } from "@/components/settings/AppsParDefaut"
import { Confidentialite } from "@/components/settings/Confidentialite"
import { MettreAJour } from "@/components/settings/MettreAJour"
import { ModeLive } from "@/components/settings/ModeLive"
import { Notifications } from "@/components/settings/Notifications"
import { Nouveautes } from "@/components/settings/Nouveautes"
import { Reinitialiser } from "@/components/settings/Reinitialiser"
import { Section, sectionCorrespond } from "@/components/settings/Section"
import { Theme } from "@/components/settings/Theme"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { JarvisCore, CORE_IMAGE_CHANGEE, type CoreEtat } from "@/components/JarvisCore"
import { detourerCore, ecrireCoreImage, lireCoreImage } from "@/lib/coreImage"
import { Geofence } from "@/lib/geofencePlugin"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useJarvisData } from "@/contexts/JarvisDataContext"
import { useSpeechSynthesis, type SpeechSynthesisVoice } from "@/hooks/useSpeechSynthesis"
import {
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  SUITE_MAX_MS,
  SUITE_MIN_MS,
} from "@/lib/dialoguePrefs"
import { PITCH_MAX, PITCH_MIN, RATE_MAX, RATE_MIN } from "@/lib/voicePrefs"

const isNative = Capacitor.isNativePlatform()

/** Les sections de l'écran : leur titre, leur résumé, et ce qu'on peut taper
 * pour les retrouver. Déclarées ici et étalées dans le rendu (`{...SECTIONS.voix}`)
 * plutôt qu'écrites deux fois — sinon les mots-clés de la recherche et ceux
 * de la section auraient divergé au premier ajout, et la recherche aurait
 * compté des résultats qu'elle n'affiche pas. */
const SECTIONS = {
  voix: {
    cle: "voix",
    titre: "Voix et écoute",
    resume: "Sa voix, le rythme, le mot-clé de réveil",
    motsCles:
      "voix parler muet silence débit vitesse hauteur ton rythme pause silence enchaîner mot-clé réveil jarvis prononciation entendre travers accent langue mode live conversation continue essai",
  },
  taches: {
    cle: "taches",
    titre: "Tâches et organisation",
    resume: "Widget d'écran d'accueil, rappels de lieu",
    motsCles:
      "widget écran d'accueil nombre de tâches urgentes catégorie rappel de lieu géolocalisation position gps arriver sur place",
  },
  notifications: {
    cle: "notifications",
    titre: "Notifications",
    resume: "Ce que Jarvis a le droit de faire sonner",
    motsCles:
      "notification sonner déranger alerte rappel échéance heure d'une tâche avance point du matin briefing résumé nouvelle version chantier livré session bloquée alarme exacte permission tester silencieux",
  },
  apps: {
    cle: "apps",
    titre: "Ce que Jarvis utilise",
    resume: "Applications par défaut, canal des messages",
    motsCles:
      "application par défaut musique spotify itinéraire navigation waze maps canal des messages whatsapp sms question à une ia",
  },
  apparence: {
    cle: "apparence",
    titre: "Apparence",
    resume: "Thème clair ou sombre, image du cœur",
    motsCles: "thème clair sombre nuit couleur affichage cœur réacteur image logo animation",
  },
  comptes: {
    cle: "comptes",
    titre: "Comptes et connexions",
    resume: "Google",
    motsCles: "compte google agenda calendrier gmail mail brancher connecter débrancher autorisation",
  },
  app: {
    cle: "app",
    titre: "L'application",
    resume: "Version, mise à jour, nouveautés",
    motsCles:
      "version build mise à jour apk installer télécharger réinstaller automatique nouveautés changements réinitialiser réglages par défaut confidentialité données vie privée suppression compte",
  },
} as const

const LISTE_SECTIONS = Object.values(SECTIONS)

/** Active/désactive le déclenchement des rappels de lieu par
 * géolocalisation réelle (Geofencing Android) — demande les permissions
 * la première fois, y compris l'écran "tout le temps" séparé requis à
 * partir d'Android 10. */
function RappelsGeolocalises() {
  const [enAttente, setEnAttente] = useState(false)
  const [arrierePlanOk, setArrierePlanOk] = useState<boolean | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const { geofenceState } = useJarvisData()

  useEffect(() => {
    if (!isNative || !geofenceState.enabled) return
    Geofence.hasBackgroundPermission()
      .then((r) => setArrierePlanOk(r.granted))
      .catch(() => setArrierePlanOk(null))
  }, [geofenceState.enabled])

  async function activer() {
    setErreur(null)
    if (!isNative) {
      geofenceState.setEnabled(true)
      return
    }
    setEnAttente(true)
    try {
      const { granted, backgroundGranted } = await Geofence.requestLocationPermissions()
      if (!granted) {
        setErreur("Localisation refusée. Autorise-la dans les paramètres de l'app pour activer cette option.")
        return
      }
      geofenceState.setEnabled(true)
      setArrierePlanOk(backgroundGranted)
    } catch {
      setErreur("La demande de permission a échoué.")
    } finally {
      setEnAttente(false)
    }
  }

  function desactiver() {
    geofenceState.setEnabled(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rappels de lieu : géolocalisation réelle</CardTitle>
        <CardDescription>
          En plus du déclenchement par la conversation (toujours actif), Jarvis peut te prévenir
          automatiquement en arrivant près d'un lieu enregistré — même sans lui parler. Utilise
          l'API Geofencing d'Android (pas de suivi GPS continu, la plus économe en batterie pour
          ça), mais consomme quand même plus que sans. Désactivé par défaut.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Interrupteur
          titre="Me prévenir en arrivant sur place"
          description="Utilise la position du téléphone, en plus du déclenchement par la conversation."
          actif={geofenceState.enabled}
          disabled={enAttente}
          onChange={(actif) => (actif ? activer() : desactiver())}
        />

        {geofenceState.enabled && arrierePlanOk === false && (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>
              Il manque l'autorisation "Tout le temps" — sans elle, les rappels ne se déclenchent
              que pendant que l'app est ouverte à l'écran, comme avant.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => Geofence.openLocationSettings()}
            >
              Ouvrir les réglages de localisation
            </Button>
          </div>
        )}
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * Le compte Google : agenda et mails. Une seule carte, un seul bouton — la
 * configuration côté Google Cloud est faite une fois pour toutes par le
 * propriétaire de l'application, personne d'autre n'a de console à ouvrir.
 */
function CompteGoogle() {
  const { googleAccountState } = useJarvisData()
  const { account, connected, loading, error, enCours, urlAOuvrir, connecter, deconnecter } =
    googleAccountState
  const [confirmation, setConfirmation] = useState(false)

  const peutAgenda = account?.scopes.includes("calendar") ?? false
  const peutGmail = account?.scopes.includes("gmail") ?? false

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compte Google</CardTitle>
        <CardDescription>
          Donne à Jarvis l'accès à ton agenda et à tes mails, pour qu'il puisse consulter tes
          rendez-vous, en créer, et lire ou envoyer un message quand tu le lui demandes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Vérification…</p>
        ) : connected ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Connecté</Badge>
              {account?.email && <span className="text-sm">{account.email}</span>}
            </div>
            <p className="text-sm text-muted-foreground">
              Jarvis peut {peutAgenda && "voir et modifier tes événements"}
              {peutAgenda && peutGmail && ", "}
              {peutGmail && "lire et envoyer tes mails"}
              {!peutAgenda && !peutGmail && "accéder à ton compte"}. Rien ne part sans que tu le
              demandes.
            </p>
            {confirmation ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>
                  Débrancher retire l'accès de Jarvis à cet agenda et à ces mails. Tes événements et
                  tes messages ne sont pas touchés.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={enCours} onClick={deconnecter}>
                    Débrancher
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmation(false)}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmation(true)}>
                Débrancher ce compte
              </Button>
            )}
          </>
        ) : (
          <>
            <Button disabled={enCours} onClick={connecter}>
              {enCours ? "Ouverture…" : "Connecter mon compte Google"}
            </Button>
            <p className="text-sm text-muted-foreground">
              L'autorisation s'ouvre dans ton navigateur — Google refuse de s'afficher à l'intérieur
              d'une application. Une fois que c'est accepté, reviens ici : l'écran se met à jour tout
              seul.
            </p>
          </>
        )}

        {urlAOuvrir && (
          <a
            href={urlAOuvrir}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline underline-offset-4"
          >
            Ouvrir l'autorisation Google
          </a>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

/** Curseur avec sa valeur lisible : régler une voix ou un rythme se fait à
 * l'oreille, il faut voir où on en est et pouvoir revenir en arrière. */
function ReglageVoix({
  id,
  label,
  min,
  max,
  value,
  onChange,
  step = 0.05,
  format = (v: number) => `${v.toFixed(2)}×`,
  aide,
}: {
  id: string
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  step?: number
  format?: (v: number) => string
  aide?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-primary"
      />
      {aide && <p className="text-xs text-muted-foreground">{aide}</p>}
    </div>
  )
}

const ETATS_APERCU: { etat: CoreEtat; label: string }[] = [
  { etat: "idle", label: "Au repos" },
  { etat: "listening", label: "Il écoute" },
  { etat: "processing", label: "Il réfléchit" },
  { etat: "speaking", label: "Il parle" },
]

/** Personnalisation du réacteur : import d'une image, détourage automatique,
 * et aperçu de la façon dont il réagit selon ce que fait Jarvis. */
function CoeurDeJarvis() {
  const fichierRef = useRef<HTMLInputElement>(null)
  const [personnalisee, setPersonnalisee] = useState(() => lireCoreImage() !== null)
  const [apercu, setApercu] = useState<CoreEtat>("idle")
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  function prevenirLApp() {
    window.dispatchEvent(new Event(CORE_IMAGE_CHANGEE))
  }

  async function importer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setErreur(null)
    setOccupe(true)
    try {
      const dataUrl = await detourerCore(file)
      ecrireCoreImage(dataUrl)
      setPersonnalisee(true)
      prevenirLApp()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Le détourage a échoué.")
    } finally {
      setOccupe(false)
    }
  }

  function reinitialiser() {
    ecrireCoreImage(null)
    setPersonnalisee(false)
    setErreur(null)
    prevenirLApp()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Le cœur de Jarvis</CardTitle>
        <CardDescription>
          Le réacteur affiché sous le micro. Il bat en permanence, s'emballe quand Jarvis
          écoute, envoie des ondes quand il parle et tourne pendant qu'il réfléchit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <JarvisCore etat={apercu} taille={128} />

        <div className="flex flex-wrap justify-center gap-1.5">
          {ETATS_APERCU.map(({ etat, label }) => (
            <Button
              key={etat}
              size="sm"
              variant={apercu === etat ? "default" : "outline"}
              onClick={() => setApercu(etat)}
            >
              {label}
            </Button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Tu peux mettre ton propre réacteur : le fond noir autour du disque est retiré
          automatiquement, il n'y a rien à découper avant.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" disabled={occupe} onClick={() => fichierRef.current?.click()}>
            {occupe ? "Détourage..." : "Importer une image"}
          </Button>
          {personnalisee && (
            <Button variant="ghost" size="sm" onClick={reinitialiser}>
              Revenir à l'originale
            </Button>
          )}
          <input ref={fichierRef} type="file" accept="image/*" hidden onChange={importer} />
        </div>

        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const {
    wakeWordState,
    dialogueState,
    devItemsState,
    voiceState,
    tasksState,
    widgetState,
    placeRemindersState,
    pronunciationsState,
    updateState,
    majWebState,
    notificationsState,
  } = useJarvisData()
  const { getVoices, speak, speaking, erreur } = useSpeechSynthesis()
  const [recherche, setRecherche] = useState("")
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [toutesLesVoix, setToutesLesVoix] = useState(false)

  useEffect(() => {
    getVoices().then(setVoices)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Android installe des dizaines de voix, souvent la même déclinée par pays.
  // On ne montre par défaut que les langues réellement parlées ici, une seule
  // fois chacune — l'index d'origine est conservé, c'est lui qu'attend speak().
  const voixTriees = voices
    .map((voice, index) => ({ voice, index }))
    .sort((a, b) => {
      const rang = (lang: string) => {
        const l = lang.toLowerCase()
        if (l.startsWith("fr")) return 0
        if (l.startsWith("he") || l.startsWith("iw")) return 1
        if (l.startsWith("en")) return 2
        return 3
      }
      const parLangue = rang(a.voice.lang) - rang(b.voice.lang)
      return parLangue !== 0 ? parLangue : a.voice.name.localeCompare(b.voice.name)
    })

  const dejaVues = new Set<string>()
  const voixCourantes = voixTriees.filter(({ voice }) => {
    const langue = voice.lang.toLowerCase()
    const pertinente =
      langue.startsWith("fr") ||
      langue.startsWith("he") ||
      langue.startsWith("iw") ||
      langue.startsWith("en")
    if (!pertinente) return false
    // Même nom décliné en fr-FR, fr-CA, fr-BE… : une seule entrée suffit.
    const cle = `${voice.name}|${langue.slice(0, 2)}`
    if (dejaVues.has(cle)) return false
    dejaVues.add(cle)
    return true
  })

  const voixAffichees = toutesLesVoix ? voixTriees : voixCourantes
  const masquees = voixTriees.length - voixCourantes.length

  const recentChanges = devItemsState.devItems
    .filter((item) => item.archived_at)
    .sort((a, b) => (b.archived_at! < a.archived_at! ? -1 : 1))
    .slice(0, 5)

  // Sept secteurs repliables, tous fermés sauf « L'application ».
  //
  // Raphaël, 4 sept. 2026 : « il faut la sectoriser […] pas foutre tous les
  // paramètres à la chaîne, mélangés dans le désordre ». Un premier essai les
  // avait groupés en trois blocs, mais tout restait déroulé : il fallait
  // encore parcourir l'écran entier pour trouver un réglage. Ce qui manquait
  // n'était pas le regroupement, c'était de pouvoir REFERMER le reste.
  //
  // « L'application » s'ouvre seule : c'est la seule qu'il consulte pour agir
  // — voir s'il est à jour. Les autres sont des réglages qu'on pose une fois.
  //
  // Une carte ajoutée ici va DANS un secteur. Posée entre deux, elle recrée
  // exactement la chaîne qu'on vient de défaire.
  //
  // Et depuis le 4 sept., une recherche : sept secteurs repliés, c'est bien
  // rangé mais ça ne dit pas OÙ est un réglage. Tout écran de réglages un peu
  // fourni en a un — Android, iOS, n'importe quelle application. Sans lui, il
  // faut ouvrir les sections une par une pour retrouver la vitesse de la
  // voix. Les mots-clés de chaque section sont à tenir à jour quand on y
  // ajoute une carte.
  const sectionsAffichees = LISTE_SECTIONS.filter((sec) =>
    sectionCorrespond(sec, recherche),
  ).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un réglage"
            aria-label="Chercher un réglage"
            className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        {recherche.trim() && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {sectionsAffichees === 0
                ? `Aucun réglage ne correspond à « ${recherche.trim()} ».`
                : `${sectionsAffichees} section${sectionsAffichees > 1 ? "s" : ""} sur ${LISTE_SECTIONS.length}.`}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setRecherche("")}>
              Tout afficher
            </Button>
          </div>
        )}
        {/* Un résultat vide qui ne proposerait rien laisserait devant un écran
            blanc, sans savoir si le réglage existe ailleurs ou pas du tout. */}
        {recherche.trim() && sectionsAffichees === 0 && (
          <p className="text-sm text-muted-foreground">
            Essaie un autre mot : « voix », « notification », « thème », « widget », « google »,
            « mise à jour ».
          </p>
        )}
      </div>

      <Section {...SECTIONS.voix} filtre={recherche}>
        <Card>
          <CardHeader>
            <CardTitle>Voix de Jarvis</CardTitle>
            <CardDescription>
              Choisis parmi les voix déjà installées sur l'appareil (gratuit, hors-ligne).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Interrupteur
              titre="Jarvis répond à voix haute"
              description={
                voiceState.muted
                  ? "Il te répond à l'écrit seulement. Dis-lui « remets ta voix » pour le rallumer."
                  : "Tu peux aussi lui dire « coupe ta voix » en pleine discussion."
              }
              actif={!voiceState.muted}
              onChange={(actif) => voiceState.setMuted(!actif)}
            />
  
            <div className="flex flex-col gap-2">
              <Select
                value={voiceState.voiceIndex === null ? "default" : String(voiceState.voiceIndex)}
                onValueChange={(v) => voiceState.setVoiceIndex(v === "default" ? null : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Voix par défaut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Voix par défaut</SelectItem>
                  {voixAffichees.map(({ voice, index }) => (
                    <SelectItem key={index} value={String(index)}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {masquees > 0 && (
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground underline underline-offset-4"
                  onClick={() => setToutesLesVoix(!toutesLesVoix)}
                >
                  {toutesLesVoix
                    ? "Ne montrer que les voix utiles"
                    : `Afficher les ${masquees} autres voix installées`}
                </button>
              )}
            </div>
  
            <ReglageVoix
              id="voix-vitesse"
              label="Vitesse"
              min={RATE_MIN}
              max={RATE_MAX}
              value={voiceState.rate}
              onChange={voiceState.setRate}
            />
            <ReglageVoix
              id="voix-hauteur"
              label="Intensité"
              min={PITCH_MIN}
              max={PITCH_MAX}
              value={voiceState.pitch}
              onChange={voiceState.setPitch}
            />
  
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={speaking}
                onClick={() =>
                  // Forcé : on doit pouvoir écouter la voix pour la régler,
                  // même quand elle est coupée pour les réponses.
                  speak(
                    "Bonjour Raphaël, voici comment je sonne avec ces réglages.",
                    voiceState.voiceIndex ?? undefined,
                    true,
                  )
                }
              >
                {speaking ? "Lecture en cours..." : "Tester"}
              </Button>
              <Button variant="ghost" size="sm" onClick={voiceState.resetTon}>
                Réglages d'origine
              </Button>
            </div>
            {erreur && (
              <p className="text-sm text-destructive">
                La lecture a échoué : {erreur}. Essaie une autre voix.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rythme de la discussion</CardTitle>
            <CardDescription>
              Jarvis n'attend plus qu'Android décide que tu as fini de parler : c'est ce réglage qui
              en décide. Raccourcis la pause s'il te semble lent à répondre, allonge-la s'il te
              coupe la parole.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ReglageVoix
              id="rythme-pause"
              label="Pause tolérée quand tu parles"
              min={PAUSE_MIN_MS}
              max={PAUSE_MAX_MS}
              step={200}
              value={dialogueState.pauseMs}
              onChange={dialogueState.setPauseMs}
              format={(v) => `${(v / 1000).toFixed(1)} s`}
              aide="Le temps de silence après lequel il considère ta phrase terminée. Tu peux aussi toucher le cœur pour dire « j'ai fini » sans attendre."
            />
            <ReglageVoix
              id="rythme-suite"
              label="Il continue de t'écouter après avoir répondu"
              min={SUITE_MIN_MS}
              max={SUITE_MAX_MS}
              step={1000}
              value={dialogueState.suiteMs}
              onChange={dialogueState.setSuiteMs}
              format={(v) => (v === 0 ? "Non" : `${Math.round(v / 1000)} s`)}
              aide="Pour enchaîner sans retoucher le micro. Passe à « Non » pour revenir à un micro qu'on rouvre à chaque phrase."
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={dialogueState.resetRythme}
            >
              Réglages d'origine
            </Button>
          </CardContent>
        </Card>

        <ModeLive />

        <Card>
          <CardHeader>
            <CardTitle>Mot-clé de réveil "Jarvis"</CardTitle>
            <CardDescription>
              Une fois activé, dis "Jarvis" pour démarrer une commande sans toucher le bouton
              micro — tant que l'app est ouverte à l'écran (pas en arrière-plan, écran éteint).
              Consomme plus de batterie/données que l'usage normal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Interrupteur
              titre="Écouter le mot-clé « Jarvis »"
              description="Le micro reste à l'écoute tant que l'app est ouverte à l'écran."
              actif={wakeWordState.enabled}
              onChange={wakeWordState.setEnabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ce qu'il entend de travers</CardTitle>
            <CardDescription>
              La dictée écorche certains mots, surtout les noms propres. Reprends Jarvis à voix
              haute — "ce n'est pas Avirail, c'est Avihail" — et il corrigera tout seul les fois
              suivantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pronunciationsState.pronunciations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune correction pour l'instant.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pronunciationsState.pronunciations.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="font-medium">{p.veut_dire}</p>
                      <p className="text-sm text-muted-foreground">entendu « {p.entendu} »</p>
                    </div>
                    <ConfirmerAction
                      titre="Supprimer cette correction ?"
                      description={
                        <>
                          Jarvis réentendra « {p.entendu} » sans savoir que tu dis
                          « {p.veut_dire} ».
                        </>
                      }
                      libelleConfirmation="Supprimer"
                      onConfirmer={() => pronunciationsState.deletePronunciation(p.id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Supprimer">
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section {...SECTIONS.taches} filtre={recherche}>
        <Card>
          <CardHeader>
            <CardTitle>Widget d'écran d'accueil</CardTitle>
            <CardDescription>
              Ce que le widget Android affiche : nombre de tâches, urgentes, et les prochaines à
              faire. Le widget se met à jour dès que tu changes un réglage ici.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Tâches affichées</span>
              <Select
                value={String(widgetState.config.maxTasks)}
                onValueChange={(v) => widgetState.setConfig({ maxTasks: Number(v) })}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
  
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Catégorie</span>
              <Select
                value={widgetState.config.categoryId ?? "all"}
                onValueChange={(v) =>
                  widgetState.setConfig({ categoryId: v === "all" ? null : v })
                }
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {tasksState.categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
  
            <Interrupteur
              titre="Urgentes uniquement"
              description="N'afficher sur le widget que les tâches en retard ou dues aujourd'hui."
              actif={widgetState.config.urgentOnly}
              onChange={(actif) => widgetState.setConfig({ urgentOnly: actif })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rappels liés à un lieu</CardTitle>
            <CardDescription>
              Dis à Jarvis "retiens que quand je parle de [lieu], rappelle-moi [ceci]" — la
              prochaine fois que tu mentionnes ce lieu en lui parlant, il te le rappellera dans sa
              réponse. Déclenché par la conversation par défaut ; active la géolocalisation
              ci-dessous pour un déclenchement automatique en plus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {placeRemindersState.placeReminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun rappel de lieu pour l'instant.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {placeRemindersState.placeReminders.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-lg border p-3">
                    <div className="flex-1">
                      <p className="font-medium">{p.place}</p>
                      <p className="text-sm text-muted-foreground">{p.reminder}</p>
                    </div>
                    <ConfirmerAction
                      titre="Supprimer ce rappel de lieu ?"
                      description={
                        <>
                          Jarvis ne te rappellera plus « {p.reminder} » en arrivant à
                          « {p.place} ».
                        </>
                      }
                      libelleConfirmation="Supprimer"
                      onConfirmer={() => placeRemindersState.deletePlaceReminder(p.id)}
                      trigger={
                        <Button variant="ghost" size="icon" aria-label="Supprimer">
                          <Trash2 className="size-4" />
                        </Button>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <RappelsGeolocalises />
      </Section>

      <Section {...SECTIONS.notifications} filtre={recherche}>
        <Notifications api={notificationsState} />
      </Section>

      <Section {...SECTIONS.apps} filtre={recherche}>
        <AppsParDefaut />
      </Section>

      <Section {...SECTIONS.apparence} filtre={recherche}>
        <Theme />
        <CoeurDeJarvis />
      </Section>

      <Section {...SECTIONS.comptes} filtre={recherche}>
        <CompteGoogle />
      </Section>

      <Section {...SECTIONS.app} filtre={recherche} ouverteParDefaut>
        <MettreAJour update={updateState} majWeb={majWebState} />

        <Nouveautes items={recentChanges} />

        <Reinitialiser />

        <Confidentialite />
      </Section>
    </div>
  )
}
