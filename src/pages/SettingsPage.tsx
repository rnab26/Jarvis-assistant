import { Capacitor } from "@capacitor/core"
import { Search, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { CarteRepliable } from "@/components/cockpit/CarteRepliable"
import { Deconnexion } from "@/components/settings/Deconnexion"
import { Badge } from "@/components/ui/badge"
import { AppsParDefaut } from "@/components/settings/AppsParDefaut"
import {
  ApprentissageNotifications,
  useApprentissageNotifications,
} from "@/components/settings/ApprentissageNotifications"
import { AssistantTelephone } from "@/components/settings/AssistantTelephone"
import { CarteAutorisations } from "@/components/settings/Autorisations"
import { BulleFlottante } from "@/components/settings/BulleFlottante"
import { Cockpit } from "@/components/settings/Cockpit"
import { Consommation } from "@/components/settings/Consommation"
import { MoteurDeLangue } from "@/components/settings/MoteurDeLangue"
import { SessionsAutonomes } from "@/components/settings/SessionsAutonomes"
import { Memoire, useDatesEchanges } from "@/components/settings/Memoire"
import { Confidentialite } from "@/components/settings/Confidentialite"
import { FenetreAnnulation } from "@/components/settings/FenetreAnnulation"
import { ControleEcran } from "@/components/settings/ControleEcran"
import { Entrainement } from "@/components/settings/Entrainement"
import { LectureNotifications } from "@/components/settings/LectureNotifications"
import { MoteurReconnaissance } from "@/components/settings/MoteurReconnaissance"
import { ConnecteursIA } from "@/components/settings/ConnecteursIA"
import { MettreAJour } from "@/components/settings/MettreAJour"
import { ModeLive } from "@/components/settings/ModeLive"
import { Notifications } from "@/components/settings/Notifications"
import { Nouveautes } from "@/components/settings/Nouveautes"
import { Reinitialiser } from "@/components/settings/Reinitialiser"
import { Section } from "@/components/settings/Section"
import {
  LISTE_SECTIONS_PARAMETRES as LISTE_SECTIONS,
  SECTIONS_PARAMETRES as SECTIONS,
  resoudreCibleParametres,
  sectionCorrespond,
} from "@/lib/sectionsParametres"
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
import type { UpdateStatus } from "@/hooks/useUpdateCheck"
import { useSpeechSynthesis, type SpeechSynthesisVoice } from "@/hooks/useSpeechSynthesis"
import {
  PAUSE_MAX_MS,
  PAUSE_MIN_MS,
  SUITE_MAX_MS,
  SUITE_MIN_MS,
} from "@/lib/dialoguePrefs"
import { CLE_ARCHIVES_OUVERTES, archivesOuvertes } from "@/lib/archiveTaches"
import { ecrireReglage } from "@/lib/reglages"
import { PITCH_MAX, PITCH_MIN, RATE_MAX, RATE_MIN } from "@/lib/voicePrefs"

const isNative = Capacitor.isNativePlatform()

/**
 * Ce que la barre « L'application » dit sans qu'on l'ouvre.
 *
 * Sa consigne du 3 sept. : le badge « À jour / Nouvelle version » est fait
 * pour qu'il puisse vérifier lui-même à tout moment. Enfoui dans une section
 * repliée, en bas de page, il ne remplissait plus ce rôle.
 *
 * Rien pendant la vérification ni quand elle échoue : un badge qui clignote à
 * chaque ouverture, ou qui affiche « inconnu », use l'attention sans rien
 * apprendre. Seul « à jour » et « nouvelle version » disent quelque chose.
 */
function BadgeMaj({ status }: { status: UpdateStatus }) {
  if (status === "update-available") {
    return (
      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
        Nouvelle version
      </span>
    )
  }
  if (status === "up-to-date") {
    return <span className="shrink-0 text-xs text-muted-foreground">À jour</span>
  }
  return null
}

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
  // Les dates des conversations gardées : la carte « Mémoire » en a besoin
  // pour annoncer combien une purge effacerait, avant qu'il confirme.
  const datesEchanges = useDatesEchanges()
  // Ce que Jarvis a consommé aujourd'hui : sa demande du 5 sept., « savoir
  // combien il me reste de crédit et à combien de temps de discussion ça
  // équivaut ».
  // Ce que Jarvis a appris de ses propres notifications (chantier 05241cc7).
  const apprentissageState = useApprentissageNotifications()
  const {
    wakeWordState,
    dialogueState,
    devItemsState,
    voiceState,
    tasksState,
    widgetState,
    placeRemindersState,
    pronunciationsState,
    entrainementState,
    updateState,
    majWebState,
    notificationsState,
    // UNE SEULE LECTURE POUR TOUTE L'APP : la carte d'ici et la pastille sous
    // le cœur doivent dire le même chiffre au même moment (chantier bd3afe97).
    // Deux `useConsommation()` séparés appelleraient `etat_consommation` deux
    // fois et finiraient par se contredire à l'écran.
    consommationState,
  } = useJarvisData()
  const { getVoices, speak, speaking, erreur } = useSpeechSynthesis()
  const [recherche, setRecherche] = useState("")
  const [searchParams, setSearchParams] = useSearchParams()
  // Navigation externe vers une section précise (chantier `aac9a0dd`,
  // « emmène-moi dans les notifications ») : `?section=<mot ou clé>` dans
  // l'URL. La cible RÉSOLUE reste en état après lecture — la retenir permet
  // à `<Section>` de s'ouvrir, défiler jusqu'à elle et se mettre en
  // évidence, sans qu'on ait à relire l'URL à chaque rendu. L'écriture de
  // cette action vocale elle-même (reconnaître la phrase, appeler
  // `navigate("/settings?section=…")`) n'est PAS ici : hors du périmètre de
  // cette session (voir dev_log, chantier aac9a0dd), propriété du thème
  // « Le téléphone ». Ce que ce paramètre attend est déjà une cible propre,
  // pas une phrase entière.
  const [cibleSection, setCibleSection] = useState<string | null>(null)
  useEffect(() => {
    const brut = searchParams.get("section")
    if (!brut) return
    const cle = resoudreCibleParametres(brut)
    // Silence sur l'ambiguïté ou l'absence de résultat, même règle que la
    // recherche au clavier : ouvrir la mauvaise section serait pire que ne
    // rien ouvrir. Le paramètre est retiré dans tous les cas, résolu ou
    // pas : le laisser referait tenter la même résolution à chaque rendu.
    if (cle) setCibleSection(cle)
    setSearchParams(
      (p) => {
        p.delete("section")
        return p
      },
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [toutesLesVoix, setToutesLesVoix] = useState(false)
  // Les terminées dépliées d'entrée dans l'onglet Tâches. Le stockage local
  // peut être indisponible (navigation privée) : on lit alors « rien choisi »
  // plutôt que de faire blanchir l'écran des réglages.
  const [archivesTachesOuvertes, setArchivesTachesOuvertes] = useState(() => {
    try {
      return archivesOuvertes(localStorage.getItem(CLE_ARCHIVES_OUVERTES))
    } catch {
      return false
    }
  })

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

      {/* Remontée en tête le 5 sept. 2026 : elle fermait la page, et c'est
          celle qu'il ouvre le plus. Son badge est sur la barre, pour qu'il
          sache s'il a une version en retard SANS ouvrir ni faire défiler. */}
      <Section
        {...SECTIONS.app}
        filtre={recherche}
        ouverteParDefaut
        badge={<BadgeMaj status={updateState.status} />}
        cibleNavigation={cibleSection === SECTIONS.app.cle}
      >
        {/* Fusion demandée par Raphaël le 17 sept. 2026 : « que tout ce qui
            concerne le bloc mettre a jour soit plus condensé et dans un seul
            même bloc avec les dernières mises à jour, et que ce soit
            dépliable — je ne veux pas forcément voir d'entrée de jeu tout
            ça. » Repliée par défaut (CarteRepliable, comme dans le cockpit) ;
            le badge « À jour / Nouvelle version » reste visible SANS déplier,
            même règle que boutonMaj.ts : on ne propose jamais une mise à jour
            quand il n'y en a pas. */}
        <CarteRepliable
          titre="Mettre à jour l'application"
          badge={<BadgeMaj status={updateState.status} />}
        >
          <MettreAJour update={updateState} majWeb={majWebState} />
          <CardContent className="flex flex-col gap-2 pt-0">
            <p className="text-sm font-medium">Dernières mises à jour</p>
            <Nouveautes items={recentChanges} />
          </CardContent>
        </CarteRepliable>
      </Section>

      <Section
        {...SECTIONS.autorisations}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.autorisations.cle}
      >
        <CarteAutorisations />
      </Section>

      <Section
        {...SECTIONS.voix}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.voix.cle}
      >
        <Card>
          <CardHeader>
            <CardTitle>Voix de Jarvis</CardTitle>
            <CardDescription>
              Choisis parmi les voix déjà installées sur l'appareil (gratuit, hors-ligne). Il n'y a
              pas de bouton pour importer un échantillon : ces voix ne peuvent pas être clonées à
              partir d'un enregistrement, c'est une limite du téléphone, pas un réglage qui
              manquerait ici. Une voix construite sur mesure passerait par un service payant, à
              chaque phrase — une décision à part, pas encore prise.
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

            <Interrupteur
              titre="Confirmer le résultat des actions à voix haute"
              description={
                voiceState.confirmerResultat
                  ? "Après chaque action (message, tâche, itinéraire…), il dit si ça a réussi ou échoué."
                  : "Il ne le dit plus à voix haute, mais le texte reste affiché sous le cœur. Une question qui attend ta réponse reste toujours dite."
              }
              actif={voiceState.confirmerResultat}
              onChange={voiceState.setConfirmerResultat}
              disabled={voiceState.muted}
            >
              {voiceState.muted && (
                <p className="text-xs text-muted-foreground">
                  Sans effet tant que la voix est coupée ci-dessus.
                </p>
              )}
            </Interrupteur>

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
            {/* SA DÉCISION DU 9 SEPT. 2026, mot pour mot : « il vaut mieux que
                le micro s'arrête et qu'on réactive jarvis manuellement pour
                reprendre une session plutôt que ça s'active de façon
                intempestive ». Le seuil est un nombre mesuré (voir
                REFUS_AVANT_ABANDON), donc il se règle ici plutôt que de rester
                en dur — et « Ne jamais renoncer » rend exactement le
                comportement d'avant, pour qu'il puisse comparer. */}
            {wakeWordState.enabled && (
              <div className="mt-4 flex flex-col gap-1.5">
                <label
                  htmlFor="veille-abandon"
                  className="text-sm font-medium"
                >
                  Quand le micro est pris par autre chose
                </label>
                <select
                  id="veille-abandon"
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                  value={String(wakeWordState.seuilAbandon)}
                  onChange={(e) => wakeWordState.setSeuilAbandon(Number(e.target.value))}
                >
                  <option value="10">Renoncer vite (10 refus)</option>
                  <option value="20">Renoncer après un moment (20 refus)</option>
                  <option value="40">Insister longtemps (40 refus)</option>
                  <option value="0">Ne jamais renoncer</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Chaque essai refusé rouvre le micro, et ton téléphone joue sa
                  tonalité à chaque fois. Passé ce nombre d'essais refusés
                  d'affilée, Jarvis arrête d'insister et te le dit sous le
                  cœur — un appui sur le cœur le relance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <MoteurReconnaissance />

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

      <Section
        {...SECTIONS.taches}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.taches.cle}
      >
        {/* SA DEMANDE (chantiers 20435f77 / 7c37b6b0) : une tâche cochée quitte
            la liste pour l'archive de sa catégorie. Le réglage existe parce
            que « replié » est un choix, pas une fatalité — quelqu'un qui coche
            beaucoup peut vouloir garder ses terminées sous les yeux sans avoir
            à demander qu'on code l'inverse. */}
        <Card>
          <CardHeader>
            <CardTitle>Les tâches terminées</CardTitle>
            <CardDescription>
              Une tâche cochée quitte la liste et va dans « … terminées », en bas du bloc de sa
              catégorie. Elle n'est pas supprimée : la décocher la fait revenir dans la liste.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Interrupteur
              titre="Les montrer d'entrée"
              description="Dépliées à l'ouverture de l'onglet Tâches, au lieu d'être repliées."
              actif={archivesTachesOuvertes}
              onChange={(actif) => {
                setArchivesTachesOuvertes(actif)
                ecrireReglage(CLE_ARCHIVES_OUVERTES, actif ? "1" : null)
              }}
            />
          </CardContent>
        </Card>

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

      <Section
        {...SECTIONS.notifications}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.notifications.cle}
      >
        {/* Les tâches viennent d'ici : la carte dit combien d'entre elles
            feront réellement sonner quelque chose, avec le calcul qui
            programme les alarmes. */}
        <Notifications api={notificationsState} taches={tasksState.tasks} />

        <ApprentissageNotifications api={apprentissageState} />
      </Section>

      <Section
        {...SECTIONS.apps}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.apps.cle}
      >
        <AssistantTelephone />
        <BulleFlottante />
        <AppsParDefaut />
        <ConnecteursIA />
        <ControleEcran />
        <Entrainement api={entrainementState} />
        <LectureNotifications />
        <FenetreAnnulation />
      </Section>

      <Section
        {...SECTIONS.consommation}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.consommation.cle}
      >
        <Consommation api={consommationState} />
      </Section>

      <Section
        {...SECTIONS.memoire}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.memoire.cle}
      >
        <Memoire api={datesEchanges} />
      </Section>

      <Section
        {...SECTIONS.cockpit}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.cockpit.cle}
      >
        <Cockpit />
        <SessionsAutonomes />

        <MoteurDeLangue />
      </Section>

      <Section
        {...SECTIONS.apparence}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.apparence.cle}
      >
        <Theme />
        <CoeurDeJarvis />
      </Section>

      <Section
        {...SECTIONS.comptes}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.comptes.cle}
      >
        <CompteGoogle />
        <Deconnexion />
      </Section>

      {/* TOUT EN BAS, demande de Raphaël le 17 sept. 2026 : « ça nous
          intéresse pas dans les paramètres, c'est vraiment tout en bas qu'il
          faut le mettre » — pour la confidentialité comme pour les réglages
          par défaut. Dernière section de la page, exprès. */}
      <Section
        {...SECTIONS.confidentialite}
        filtre={recherche}
        cibleNavigation={cibleSection === SECTIONS.confidentialite.cle}
      >
        <Reinitialiser />
        <Confidentialite />
      </Section>
    </div>
  )
}
