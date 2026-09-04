import { useCallback, useEffect, useRef, useState } from "react"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import type { PublishedBuild, UpdateStatus } from "@/hooks/useUpdateCheck"
import type { ProgressionTelechargement } from "@/lib/apkDownloader"
import { ecrireMajAuto, lireMajAuto } from "@/lib/majPrefs"
import {
  appliquerBundle,
  demarrageMajWeb,
  lireEtatMajWeb,
  majWebDisponible,
  revenirALAPK,
  verdictMaj,
  type EtapeMaj,
  type EtatMajWeb,
  type VerdictMajWeb,
} from "@/lib/majWeb"
import { ID_MAJ_APP } from "@/lib/notifications/plan"
import { notifierMaintenant } from "@/lib/notifications/service"

/** L'instant du démarrage de l'interface. Une mise à jour ne s'applique
 * toute seule que dans la première minute : redémarrer l'app au retour au
 * premier plan, en plein milieu d'une dictée, serait pire que le retard
 * qu'on corrige. */
const DEMARRAGE = Date.now()
const FENETRE_AUTO_MS = 60_000

/** Le dernier build annoncé, pour ne pas notifier deux fois la même version.
 * Sur l'appareil seulement : ce n'est pas une préférence, c'est un
 * aide-mémoire. */
const CLE_DERNIER_ANNONCE = "jarvis_maj_annoncee"

function dejaAnnonce(build: number | null): boolean {
  if (build === null) return false
  try {
    return localStorage.getItem(CLE_DERNIER_ANNONCE) === String(build)
  } catch {
    return false
  }
}

function noterAnnonce(build: number | null) {
  try {
    if (build !== null) localStorage.setItem(CLE_DERNIER_ANNONCE, String(build))
  } catch {
    // Sans mémoire, la notification pourra se répéter au prochain lancement.
    // Désagréable, jamais dangereux.
  }
}

export interface MajWebApi {
  etat: EtatMajWeb
  /** Ce que la mise à jour publiée permet, ou pourquoi elle ne permet rien. */
  verdict: VerdictMajWeb | null
  /** Étape en cours, null quand rien ne tourne. */
  etape: EtapeMaj | null
  progression: ProgressionTelechargement | null
  erreur: string | null
  auto: boolean
  setAuto: (actif: boolean) => void
  appliquer: () => Promise<void>
  revenir: () => Promise<void>
  rafraichir: () => Promise<void>
}

/**
 * La mise à jour de l'app sans réinstallation, du côté de l'écran.
 *
 * Monté dans JarvisDataProvider, pas dans Paramètres : la vérification, la
 * notification et l'application automatique doivent avoir lieu même si
 * Raphaël n'ouvre jamais l'onglet Paramètres — c'est précisément ce qui l'a
 * laissé une vingtaine de builds en retard sans s'en rendre compte.
 */
export function useMajWeb(
  published: PublishedBuild | null,
  status: UpdateStatus,
  notifierApk: boolean,
): MajWebApi {
  const [etat, setEtat] = useState<EtatMajWeb>({
    disponible: majWebDisponible(),
    identiteApk: null,
    actif: null,
    dernierEchec: null,
  })
  const [etape, setEtape] = useState<EtapeMaj | null>(null)
  const [progression, setProgression] = useState<ProgressionTelechargement | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [auto, setAutoState] = useState(lireMajAuto)

  useRelireApresRestauration(() => setAutoState(lireMajAuto()))

  const rafraichir = useCallback(async () => {
    await demarrageMajWeb()
    setEtat(await lireEtatMajWeb())
  }, [])

  useEffect(() => {
    void rafraichir()
  }, [rafraichir])

  const verdict =
    published && status === "update-available"
      ? verdictMaj(published.empreinteNative, etat.identiteApk, published.bundleUrl)
      : null

  const appliquerRef = useRef<() => Promise<void>>(async () => {})

  const appliquer = useCallback(async () => {
    if (!published?.bundleUrl) return
    setErreur(null)
    setProgression(null)
    try {
      await appliquerBundle(
        {
          url: published.bundleUrl,
          build: published.buildNumber,
          version: published.version,
          commit: published.commit,
        },
        setEtape,
        setProgression,
      )
      // Pas de suite : setServerBasePath relance l'interface. Si on repasse
      // ici, c'est que le redémarrage n'a pas eu lieu.
    } catch (e) {
      setEtape(null)
      setProgression(null)
      setErreur(e instanceof Error ? e.message : "La mise à jour rapide a échoué.")
      throw e
    }
  }, [published])

  useEffect(() => {
    appliquerRef.current = appliquer
  })

  // Ce qu'on fait quand une nouvelle version existe : l'appliquer tout seul
  // si elle le permet, sinon le dire — et le dire UNE fois par version.
  const traiteRef = useRef<number | null>(null)
  useEffect(() => {
    if (status !== "update-available" || !published || !verdict) return
    if (traiteRef.current === published.buildNumber) return
    traiteRef.current = published.buildNumber

    if (verdict.possible && auto && Date.now() - DEMARRAGE < FENETRE_AUTO_MS) {
      void appliquerRef.current()
      return
    }

    if (!notifierApk || dejaAnnonce(published.buildNumber)) return
    noterAnnonce(published.buildNumber)
    void notifierMaintenant({
      id: ID_MAJ_APP,
      titre: "Nouvelle version de Jarvis",
      corps: verdict.possible
        ? "Elle s'installe en quelques secondes, sans réinstaller l'app. Ouvre Paramètres."
        : "Celle-ci demande d'installer l'APK. Ouvre Paramètres.",
      canal: "app",
      route: "/settings",
    })
  }, [status, published, verdict, auto, notifierApk])

  const setAuto = useCallback((actif: boolean) => {
    setAutoState(actif)
    ecrireMajAuto(actif)
  }, [])

  const revenir = useCallback(async () => {
    await revenirALAPK()
    setEtat(await lireEtatMajWeb())
  }, [])

  return { etat, verdict, etape, progression, erreur, auto, setAuto, appliquer, revenir, rafraichir }
}
