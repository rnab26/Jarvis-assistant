import {
  Bell,
  Check,
  Download,
  MapPin,
  Mic,
  Phone,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AUTORISATIONS,
  Autorisations as PontAutorisations,
  actionDeLaLigne,
  clesADemander,
  libelleEtat,
  resumeAutorisations,
  type AutorisationDeclaree,
  type CleAutorisation,
  type EtatAutorisation,
} from "@/lib/autorisationsTelephone"

const ICONES: Record<CleAutorisation, LucideIcon> = {
  micro: Mic,
  notifications: Bell,
  contacts: Users,
  telephone: Phone,
  position: MapPin,
  position_fond: MapPin,
  installer_maj: Download,
}

/**
 * Ce que Jarvis a le droit de faire sur le téléphone.
 *
 * La même liste sert à deux endroits — l'écran de premier lancement et la
 * carte de Paramètres — et c'est voulu : une autorisation refusée au premier
 * lancement doit se rattraper plus tard exactement au même endroit, avec les
 * mêmes mots. Deux écrans qui disent la même chose autrement finiraient par
 * ne plus la dire pareil.
 *
 * Le composant ne va JAMAIS chercher l'état lui-même : il le reçoit. C'est ce
 * qui permet au banc d'essai (scripts/harness/autorisations.tsx) de le monter
 * hors d'Android et de vérifier ce qu'on voit dans chaque cas — accordée,
 * refusée pour de bon, en attente d'une autre, état illisible — dont aucun ne
 * se produit sur cette machine.
 */
export interface ListeAutorisationsProps {
  etats: EtatAutorisation[]
  chargement: boolean
  /** Ce qui a empêché de lire l'état. Null = tout va bien. */
  erreur: string | null
  /** Faux hors de l'app Android, ou dans une APK antérieure à ce plugin. */
  disponible: boolean
  onDemander: (cles: CleAutorisation[]) => void
  onOuvrirReglages: (cle: CleAutorisation) => void
  onReessayer?: () => void
  /** Ce qui est en train d'être demandé, pour désactiver le bon bouton. */
  enCours: CleAutorisation | "toutes" | null
}

function Ligne({
  declaree,
  etat,
  etats,
  onDemander,
  onOuvrirReglages,
  enCours,
}: {
  declaree: AutorisationDeclaree
  etat: EtatAutorisation | undefined
  etats: EtatAutorisation[]
  onDemander: (cles: CleAutorisation[]) => void
  onOuvrirReglages: (cle: CleAutorisation) => void
  enCours: CleAutorisation | "toutes" | null
}) {
  const action = actionDeLaLigne(declaree, etat, etats)
  const Icone = ICONES[declaree.cle]
  const occupee = enCours === declaree.cle || enCours === "toutes"

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3"
      data-autorisation={declaree.cle}
      data-action={action}
    >
      <div className="flex items-start gap-3">
        <Icone
          className={
            etat?.accordee ? "mt-0.5 size-4 shrink-0 text-primary" : "mt-0.5 size-4 shrink-0 text-muted-foreground"
          }
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-tight">{declaree.titre}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{declaree.usage}</p>
        </div>
        <span
          data-etat={declaree.cle}
          className={
            etat?.accordee
              ? "shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
              : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          }
        >
          {libelleEtat(etat)}
        </span>
      </div>

      {/* Ce qu'il perd sans elle : c'est ça qui fait décider, pas le nom
          Android. On ne l'affiche donc que tant qu'elle n'est pas accordée. */}
      {!etat?.accordee && (
        <p className="pl-7 text-xs text-muted-foreground">
          Sans elle : {declaree.sansElle}
        </p>
      )}
      <p className="pl-7 text-[11px] text-muted-foreground/70">{declaree.technique}</p>

      {action === "demander" && (
        <div className="pl-7">
          <Button size="sm" disabled={occupee} onClick={() => onDemander([declaree.cle])}>
            {occupee ? "Demande en cours…" : "Autoriser"}
          </Button>
        </div>
      )}
      {action === "reglages" && (
        <div className="pl-7">
          <Button size="sm" variant="outline" onClick={() => onOuvrirReglages(declaree.cle)}>
            Ouvrir les réglages d'Android
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            {declaree.type === "speciale"
              ? "Android ne propose pas de fenêtre pour celle-ci : elle se donne depuis ses réglages."
              : etat?.connue === false
                ? "Android ne dit pas si elle est accordée : à vérifier dans ses réglages."
                : "Refusée une fois, Android ne la redemande plus. Le seul chemin est ses réglages."}
          </p>
        </div>
      )}
      {action === "attend_parent" && (
        <p className="pl-7 text-xs text-muted-foreground">
          Disponible une fois « {AUTORISATIONS.find((a) => a.cle === declaree.dependDe)?.titre} »
          accordée — Android refuse les deux d'un coup.
        </p>
      )}
    </div>
  )
}

export function ListeAutorisations({
  etats,
  chargement,
  erreur,
  disponible,
  onDemander,
  onOuvrirReglages,
  onReessayer,
  enCours,
}: ListeAutorisationsProps) {
  if (!disponible) {
    return (
      <p className="text-sm text-muted-foreground">
        Les autorisations n'existent que dans l'application installée sur le téléphone. Sur le
        site web, le navigateur les demande lui-même au moment où il en a besoin.
      </p>
    )
  }

  if (chargement) {
    return <p className="text-sm text-muted-foreground">Lecture des autorisations…</p>
  }

  if (erreur) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{erreur}</p>
        {onReessayer && (
          <Button size="sm" variant="outline" onClick={onReessayer}>
            Réessayer
          </Button>
        )}
      </div>
    )
  }

  const aDemander = clesADemander(etats)
  const resume = resumeAutorisations(etats)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" data-resume>
          {resume.accordees} accordée{resume.accordees > 1 ? "s" : ""} sur {resume.total}
        </p>
        {aDemander.length > 0 ? (
          <Button
            size="sm"
            data-tout-autoriser
            disabled={enCours !== null}
            onClick={() => onDemander(aDemander)}
          >
            {enCours === "toutes" ? "Demande en cours…" : "Tout autoriser"}
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-sm text-primary" data-rien-a-demander>
            <Check className="size-4" aria-hidden /> Rien à demander
          </span>
        )}
      </div>

      {AUTORISATIONS.map((declaree) => (
        <Ligne
          key={declaree.cle}
          declaree={declaree}
          etat={etats.find((e) => e.cle === declaree.cle)}
          etats={etats}
          onDemander={onDemander}
          onOuvrirReglages={onOuvrirReglages}
          enCours={enCours}
        />
      ))}

      <p className="text-xs text-muted-foreground">
        Rien n'est copié dans Jarvis : ces autorisations lui donnent le droit de lire le
        téléphone au moment où il en a besoin, et rien d'autre. Ouvrir une application et lui
        passer un texte n'en demande aucune.
      </p>
    </div>
  )
}

/**
 * L'état réel des autorisations, et de quoi le changer.
 *
 * Le plugin peut manquer alors qu'on est bien dans l'app : depuis la mise à
 * jour rapide, une interface récente tourne parfois dans une APK plus
 * ancienne. On distingue donc « pas dans l'app » de « ça a échoué », sans
 * quoi une panne se lirait comme une absence.
 */
export function useAutorisations() {
  const [etats, setEtats] = useState<EtatAutorisation[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [disponible, setDisponible] = useState(true)
  const [enCours, setEnCours] = useState<CleAutorisation | "toutes" | null>(null)

  const relire = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      const res = await PontAutorisations.etat()
      setEtats(res.autorisations ?? [])
      setDisponible(true)
    } catch {
      setDisponible(false)
    } finally {
      setChargement(false)
    }
  }, [])

  useEffect(() => {
    void relire()
  }, [relire])

  const demander = useCallback(async (cles: CleAutorisation[]) => {
    if (cles.length === 0) return
    setEnCours(cles.length === 1 ? cles[0] : "toutes")
    setErreur(null)
    try {
      const res = await PontAutorisations.demander({ cles })
      setEtats(res.autorisations ?? [])
    } catch {
      setErreur("La demande d'autorisation n'a pas abouti. Réessaie, ou passe par les réglages d'Android.")
    } finally {
      setEnCours(null)
    }
  }, [])

  const ouvrirReglages = useCallback(async (cle: CleAutorisation) => {
    try {
      await PontAutorisations.ouvrirEcran({ cle })
    } catch {
      setErreur("Les réglages d'Android ne se sont pas ouverts.")
    }
  }, [])

  return { etats, chargement, erreur, disponible, enCours, relire, demander, ouvrirReglages }
}

/** La carte de Paramètres. Le premier lancement montre la même liste. */
export function CarteAutorisations() {
  const a = useAutorisations()

  // Les autorisations changent depuis les réglages d'Android, hors de l'app :
  // sans cette relecture au retour, la carte afficherait encore « refusée »
  // juste après qu'il l'ait accordée, et le bouton semblerait n'avoir servi
  // à rien.
  useEffect(() => {
    const relire = () => {
      if (document.visibilityState === "visible") void a.relire()
    }
    document.addEventListener("visibilitychange", relire)
    return () => document.removeEventListener("visibilitychange", relire)
  }, [a])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden />
          Ce que Jarvis a le droit de faire
        </CardTitle>
        <CardDescription>
          Les autorisations du téléphone, dites par ce qu'elles permettent. À accorder ou à
          retirer quand tu veux.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ListeAutorisations
          etats={a.etats}
          chargement={a.chargement}
          erreur={a.erreur}
          disponible={a.disponible}
          enCours={a.enCours}
          onDemander={a.demander}
          onOuvrirReglages={a.ouvrirReglages}
          onReessayer={a.relire}
        />
      </CardContent>
    </Card>
  )
}
