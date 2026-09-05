import { Capacitor } from "@capacitor/core"
import { Download, RefreshCw, Undo2, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Interrupteur } from "@/components/settings/Interrupteur"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { MajWebApi } from "@/hooks/useMajWeb"
import type { PublishedBuild, UpdateStatus, Verdict } from "@/hooks/useUpdateCheck"
import { ApkDownloader, type ProgressionTelechargement } from "@/lib/apkDownloader"
import { cn } from "@/lib/utils"
import { formatBuildDate, versionInstallee } from "@/lib/version"

const isNative = Capacitor.isNativePlatform()

/** Ce que Paramètres passe : la vérification de version et la mise à jour
 * rapide, toutes deux portées par JarvisDataProvider. En props et pas lues du
 * contexte, pour que le banc d'essai puisse monter cette carte hors de
 * Supabase (voir scripts/harness/reglages.tsx). */
export interface MettreAJourProps {
  update: {
    status: UpdateStatus
    published: PublishedBuild | null
    verifieA: Date | null
    recheck: () => Promise<Verdict>
  }
  majWeb: MajWebApi
}

/** Ce que l'app est en train de faire pendant une mise à jour rapide. Une
 * barre qui avance sans dire de quoi il s'agit laisse croire à un blocage
 * pendant la décompression, qui ne montre aucune progression. */
const ETAPE_LABEL = {
  telechargement: "Téléchargement du paquet...",
  installation: "Installation...",
  redemarrage: "Redémarrage de l'interface...",
} as const

const APK_DOWNLOAD_URL =
  "https://github.com/rnab26/Jarvis-assistant/releases/download/latest-debug/app-debug.apk"

/** Les notes archivées finissent par "Commit <hash>." — même logique que
 * DevItemCard, pour rendre le hash cliquable vers GitHub. */
const UPDATE_STATUS_LABEL = {
  checking: "Vérification...",
  "up-to-date": "À jour",
  "update-available": "Nouvelle version disponible",
  unknown: "Impossible de vérifier",
} as const

/** Une ligne "libellé : valeur" du bloc de version. */
function LigneVersion({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** Ce que la CI a publié, en clair : "build 33 (2026.09.03-b33-c42dcc9) · 3 sept. 2026 à 07:15". */
function libellePubliee(published: PublishedBuild | null): string {
  if (!published) return "inconnue"
  const morceaux: string[] = []
  if (published.buildNumber !== null) morceaux.push(`build ${published.buildNumber}`)
  if (published.version) morceaux.push(published.version)
  else if (published.commit) morceaux.push(published.commit.slice(0, 7))
  const date = formatBuildDate(published.date)
  const base = morceaux.join(" · ") || "inconnue"
  return date ? `${base} · ${date}` : base
}

/**
 * Un <a href> vers l'APK ouvert depuis l'app est intercepté par Capacitor
 * et lancé dans un nouveau contexte Chrome — où le téléchargement d'un
 * gros fichier binaire ne se finalise jamais de façon fiable (bug observé
 * sur device). Sur natif, on passe donc par ApkDownloader (DownloadManager
 * Android), un seul tap.
 *
 * La carte affiche aussi les DEUX versions, installée et publiée : sans
 * ça, une installation sans effet est invisible — c'est exactement ce qui
 * a fait perdre à Raphaël une vingtaine de builds sans qu'il puisse le
 * constater.
 */
/** Poids en Mo si on connaît la taille totale, sinon juste les Mo reçus —
 * mieux vaut une progression sans total qu'aucune information du tout. */
function libelleProgression(p: ProgressionTelechargement): string {
  const recusMo = (p.recus / 1_000_000).toFixed(1)
  if (p.total > 0) {
    const pct = Math.min(100, Math.round((p.recus / p.total) * 100))
    return `${pct}% · ${recusMo} / ${(p.total / 1_000_000).toFixed(1)} Mo`
  }
  return `${recusMo} Mo reçus…`
}

function BarreProgression({ progression }: { progression: ProgressionTelechargement }) {
  const pct = progression.total > 0
    ? Math.min(100, Math.round((progression.recus / progression.total) * 100))
    : null
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width]",
            // Taille totale pas encore connue : on ne fige pas la barre à
            // 0 %, un mouvement continu dit "ça avance" sans mentir sur le
            // pourcentage.
            pct === null && "w-1/3 animate-pulse",
          )}
          style={pct !== null ? { width: `${pct}%` } : undefined}
        />
      </div>
      <p className="text-xs text-muted-foreground">{libelleProgression(progression)}</p>
    </div>
  )
}

export function MettreAJour({ update, majWeb }: MettreAJourProps) {
  const { status, published, verifieA, recheck } = update
  const { etat, verdict, etape, progression: progressionWeb, erreur: erreurWeb, auto, setAuto, appliquer, revenir } =
    majWeb

  const [etatApk, setEtatApk] = useState<"idle" | "besoin-permission" | "telechargement" | "erreur">("idle")
  const [erreur, setErreur] = useState<string | null>(null)
  const [progression, setProgression] = useState<ProgressionTelechargement | null>(null)
  const [confirmerRetour, setConfirmerRetour] = useState(false)

  useEffect(() => {
    if (!isNative) return
    // Écouté en permanence plutôt que seulement pendant le téléchargement :
    // s'abonner APRÈS avoir lancé downloadAndInstall risquerait de rater les
    // tout premiers événements natifs, envoyés dès l'enregistrement de la
    // requête.
    // Le .catch() n'est pas décoratif : depuis la mise à jour rapide, une
    // interface récente peut tourner dans une APK plus ancienne, où ce plugin
    // n'existe pas encore. Sans lui, la promesse rejetée remonte en erreur non
    // gérée et casse la page entière — pour une barre de progression.
    const poignee = ApkDownloader.addListener("progression", (p) => setProgression(p)).catch(
      () => null,
    )
    return () => {
      poignee.then((h) => h?.remove()).catch(() => {})
    }
  }, [])

  /* Une vérification qui aboutit sans rien changer à l'écran passe pour un
     bouton mort — c'est le retour de Raphaël, deux fois. Le résultat est donc
     annoncé explicitement, avec le numéro de build : on ne lui demande plus
     de deviner que quelque chose s'est produit. */
  async function revérifier() {
    const { status: verdictMaj, published: infos } = await recheck()
    const build = infos?.buildNumber !== null && infos?.buildNumber !== undefined
      ? ` (build ${infos.buildNumber})`
      : ""
    if (verdictMaj === "up-to-date") {
      toast.success(`Vérifié : tu es à jour${build}.`)
    } else if (verdictMaj === "update-available") {
      toast.warning(`Vérifié : une nouvelle version existe${build}.`)
    } else {
      toast.error("Vérification impossible", {
        description: "GitHub n'a pas répondu. Réessaie dans un moment.",
      })
    }
  }

  async function mettreAJourVite() {
    try {
      await appliquer()
    } catch {
      // Message déjà porté par erreurWeb, affiché sous les boutons.
    }
  }

  async function revenirEnArriere() {
    setConfirmerRetour(false)
    await revenir()
    toast.success("Retour à la version installée avec l'application.")
  }

  async function telecharger() {
    setErreur(null)
    const { granted } = await ApkDownloader.hasInstallPermission()
    if (!granted) {
      setEtatApk("besoin-permission")
      return
    }
    setEtatApk("telechargement")
    setProgression(null)
    try {
      await ApkDownloader.downloadAndInstall({ url: APK_DOWNLOAD_URL })
      setEtatApk("idle")
    } catch (e) {
      setEtatApk("erreur")
      setErreur(e instanceof Error ? e.message : "Échec du téléchargement.")
    } finally {
      setProgression(null)
    }
  }

  const majRapidePossible = verdict?.possible === true
  const enCours = etape !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mettre à jour l'application</CardTitle>
        {/* L'explication ne s'affiche QUE quand elle sert à décider, c'est-à-dire
            quand une version attend. Le reste du temps, elle prenait six lignes
            pour ne rien apprendre — et depuis que cette carte est en tête de
            Paramètres, ces six lignes repoussaient tout le reste vers le bas.
            Demande de Raphaël, 5 sept. : « rehausser, mais en compactant ». */}
        {status === "update-available" && (
          <CardDescription>
            {isNative
              ? "La plupart des mises à jour s'appliquent en quelques secondes, sans réinstaller. Seules celles qui touchent le cœur de l'application demandent une nouvelle APK."
              : "Le site est republié à chaque changement : cette page est déjà à jour. Le bouton télécharge l'APK Android."}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {/* Trois numéros de version tenaient un pavé bordé en permanence. Ils
            ne servent qu'à comprendre un DÉSACCORD entre ce qui tourne et ce
            qui est publié : dépliés quand une version attend, repliés sinon —
            mais toujours atteignables en un appui, jamais supprimés. */}
        <details className="w-full" open={status === "update-available"}>
          <summary className="cursor-pointer list-none text-sm text-muted-foreground">
            <span className="underline decoration-dotted underline-offset-4">
              Versions ({versionInstallee()})
            </span>
          </summary>
          <div className="mt-2 flex w-full flex-col gap-0.5 rounded-lg border px-3 py-2">
            <LigneVersion
              label={isNative ? "Interface en cours" : "Version de cette page"}
              value={
                versionInstallee() +
                (isNative ? (etat.actif ? " · mise à jour rapide" : " · livrée avec l'app") : "")
              }
            />
            {isNative &&
              etat.identiteApk?.build !== null &&
              etat.identiteApk?.build !== undefined && (
                <LigneVersion
                  label="Application installée"
                  value={`build ${etat.identiteApk.build}`}
                />
              )}
            <LigneVersion label="Dernière version publiée" value={libellePubliee(published)} />
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3">
          {isNative && majRapidePossible ? (
            <Button onClick={mettreAJourVite} disabled={enCours}>
              <Zap className="size-4" />
              {enCours ? ETAPE_LABEL[etape] : "Mettre à jour maintenant"}
            </Button>
          ) : isNative ? (
            <Button onClick={telecharger} disabled={etatApk === "telechargement"}>
              <Download className="size-4" />
              {etatApk === "telechargement" ? "Téléchargement..." : "Mettre à jour"}
            </Button>
          ) : (
            <Button asChild>
              <a href={APK_DOWNLOAD_URL} download>
                <Download className="size-4" />
                Télécharger la dernière version
              </a>
            </Button>
          )}
          {isNative && (
            <Badge variant={status === "update-available" ? "destructive" : "outline"}>
              {UPDATE_STATUS_LABEL[status]}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={revérifier}
            disabled={status === "checking"}
            aria-label="Revérifier"
          >
            <RefreshCw className={cn("size-4", status === "checking" && "animate-spin")} />
            Revérifier
          </Button>
        </div>

        {/* Pourquoi le bouton propose une réinstallation plutôt que la mise à
            jour rapide : sans cette phrase, la promesse « plus besoin de
            réinstaller » passerait pour cassée. */}
        {isNative && verdict && !verdict.possible && (
          <p className="text-sm text-muted-foreground">{verdict.raison}</p>
        )}

        {enCours && (
          <div className="flex w-full flex-col gap-1">
            <p className="text-sm">{ETAPE_LABEL[etape]}</p>
            {etape === "telechargement" && progressionWeb && (
              <BarreProgression progression={progressionWeb} />
            )}
          </div>
        )}
        {etatApk === "telechargement" && progression && (
          <BarreProgression progression={progression} />
        )}

        {/* Sans cette ligne, revérifier alors qu'on est déjà à jour ne
            change rien à l'écran : le bouton paraît cassé. L'heure qui
            avance est la preuve que la vérification a bien eu lieu. */}
        {verifieA && (
          <p className="text-xs text-muted-foreground">
            Dernière vérification à {verifieA.toLocaleTimeString("fr-FR")}
          </p>
        )}

        {isNative && (
          <Interrupteur
            titre="Appliquer les mises à jour rapides toute seule"
            description="Au démarrage de l'app, quand la mise à jour ne demande pas de réinstallation. Celles qui touchent le cœur de l'application resteront toujours à ta main."
            actif={auto}
            onChange={setAuto}
          />
        )}

        {isNative && etat.actif && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Tu tournes sur une mise à jour rapide (build {etat.actif.build ?? "?"}). Si quelque
              chose se comporte mal, reviens à la version livrée avec l'application installée.
            </p>
            {confirmerRetour ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="destructive" onClick={revenirEnArriere}>
                  Confirmer le retour
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmerRetour(false)}>
                  Annuler
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-fit"
                onClick={() => setConfirmerRetour(true)}
              >
                <Undo2 className="size-4" />
                Revenir à la version installée
              </Button>
            )}
          </div>
        )}

        {/* Un paquet qui n'a pas démarré ne laisse aucune trace visible : sans
            ce message, l'app serait simplement revenue en arrière toute seule,
            sans explication. */}
        {isNative && etat.dernierEchec && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            La mise à jour rapide du build {etat.dernierEchec.build ?? "?"} n'a pas démarré :
            l'application est repartie sur la version précédente. Installe l'APK pour passer à la
            nouvelle version.
          </p>
        )}

        {erreurWeb && <p className="text-sm text-destructive">{erreurWeb}</p>}

        {etatApk === "besoin-permission" && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-muted-foreground">
              Android bloque l'installation d'une app venant d'ailleurs que le Play Store par
              défaut — autorise Jarvis une fois, puis appuie à nouveau sur "Mettre à jour".
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => ApkDownloader.openInstallPermissionSettings()}
            >
              Autoriser cette source
            </Button>
          </div>
        )}
        {etatApk === "erreur" && erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </CardContent>
    </Card>
  )
}
