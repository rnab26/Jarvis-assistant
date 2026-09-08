import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Interrupteur } from "@/components/settings/Interrupteur"
import {
  CLES_APP,
  CLE_APP_WHATSAPP,
  CLE_CANAL_MESSAGES,
  appPreferee,
  canalMessagesPrefere,
  paquetWhatsAppPrefere,
} from "@/lib/actionsTelephoneVocales"
import { CLE_ENVOI_AUTO, envoiAutoVoulu } from "@/lib/confirmationEnvoiVocale"
import { etatAccessibilite, type EtatAccessibilite } from "@/lib/controleEcran"
import { REGLAGES_RESTAURES, ecrireReglage } from "@/lib/reglages"
import { ActionsTelephone, type ApplicationInstallee } from "@/lib/actionsTelephone"

/**
 * Les applications que Jarvis utilise pour la musique, les itinéraires, les
 * questions posées à une autre IA, et les messages.
 *
 * Ces préférences existaient déjà : Jarvis les demande une fois à
 * l'oral (« Quelle application utilises-tu pour la musique ? »), les
 * enregistre, et ne les redemande plus jamais. Le problème est qu'elles
 * n'apparaissaient nulle part — impossible de savoir ce qui avait été retenu,
 * impossible d'en changer sans qu'on aille toucher au code. Raphaël l'a
 * signalé le 3 sept. : il ne veut pas avoir à demander de coder chaque
 * changement de préférence.
 *
 * Les clés viennent de actionsTelephoneVocales.ts, qui reste leur seule source
 * de vérité : les recopier ici ferait deux endroits à tenir à jour, et un
 * réglage écrit sous une clé légèrement différente se perdrait en silence.
 */

const CANAUX = [
  { valeur: "whatsapp", libelle: "WhatsApp" },
  { valeur: "sms", libelle: "SMS" },
] as const

export function AppsParDefaut() {
  const [musique, setMusique] = useState<string | null>(null)
  const [navigation, setNavigation] = useState<string | null>(null)
  const [appels, setAppels] = useState<string | null>(null)
  const [whatsapp, setWhatsapp] = useState<string | null>(null)
  const [canal, setCanal] = useState<"whatsapp" | "sms" | null>(null)
  const [envoiAuto, setEnvoiAuto] = useState(() => envoiAutoVoulu(localStorage.getItem(CLE_ENVOI_AUTO)))
  const [accessibilite, setAccessibilite] = useState<EtatAccessibilite | null>(null)

  function relire() {
    setMusique(appPreferee("musique"))
    setNavigation(appPreferee("navigation"))
    setAppels(appPreferee("appels"))
    setWhatsapp(paquetWhatsAppPrefere())
    setCanal(canalMessagesPrefere())
    setEnvoiAuto(envoiAutoVoulu(localStorage.getItem(CLE_ENVOI_AUTO)))
  }

  useEffect(() => {
    relire()
    // La base gagne à la connexion : sans ça, l'écran resterait sur ce qu'il
    // avait lu au montage et afficherait une préférence périmée.
    window.addEventListener(REGLAGES_RESTAURES, relire)
    return () => window.removeEventListener(REGLAGES_RESTAURES, relire)
  }, [])

  // L'état RÉEL du service d'accessibilité, comme ControleEcran.tsx : sans
  // lui, ce réglage pourrait dire « Activé » alors qu'Android a coupé
  // l'accès, et rien ne le dirait avant le premier message resté en plan.
  useEffect(() => {
    let annule = false
    etatAccessibilite().then((e) => {
      if (!annule) setAccessibilite(e)
    })
    const auRetour = () => {
      if (document.visibilityState === "visible") etatAccessibilite().then((e) => !annule && setAccessibilite(e))
    }
    document.addEventListener("visibilitychange", auRetour)
    return () => {
      annule = true
      document.removeEventListener("visibilitychange", auRetour)
    }
  }, [])

  function basculerEnvoiAuto(actif: boolean) {
    setEnvoiAuto(actif)
    ecrireReglage(CLE_ENVOI_AUTO, actif ? "1" : "0")
  }

  // Stables : passées en prop à un effet, une fonction recréée à chaque
  // rendu relancerait la lecture des applications en boucle.
  const listerMusique = useCallback(() => ActionsTelephone.listerApplicationsMusique(), [])
  const listerItineraire = useCallback(() => ActionsTelephone.listerApplicationsItineraire(), [])
  const listerAppel = useCallback(() => ActionsTelephone.listerApplicationsAppel(), [])

  function oublier(cle: string) {
    ecrireReglage(cle, null)
    relire()
  }

  function choisirCanal(valeur: "whatsapp" | "sms") {
    ecrireReglage(CLE_CANAL_MESSAGES, valeur)
    relire()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tes applications par défaut</CardTitle>
        <CardDescription>
          Ce que Jarvis utilise sans te redemander. Il te pose la question une seule
          fois, à l'oral ; ici tu vois ce qu'il a retenu et tu peux le changer.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* LES TROIS LIGNES SE CHOISISSENT MAINTENANT ICI, et la liste vient
            du TÉLÉPHONE. Son retour du 6 sept. 2026 : « il a une certaine
            logique de me demander pour un itinéraire quelle application
            j'utilise, mais il ne sait pas la lancer. […] en aucun cas il y a
            Waze. Il n'y a pas les applications qu'il y a. » Il n'y avait
            effectivement AUCUNE liste : ces lignes montraient la valeur
            retenue et un bouton « Oublier », rien de plus. Impossible de voir
            ce qui est installé, impossible de choisir sans repasser par
            l'oral. Même cause racine que WhatsApp Business le matin même : on
            supposait au lieu de regarder. */}
        <LigneAvecChoix
          titre="Musique"
          siRien="Rien de choisi : Jarvis te le demandera la prochaine fois."
          siAucune="Aucune application de musique n'a été trouvée sur ton téléphone."
          lister={listerMusique}
          valeur={musique}
          onChoisir={(nom) => {
            ecrireReglage(CLES_APP.musique, nom)
            relire()
          }}
          onOublier={() => oublier(CLES_APP.musique)}
        />
        {/* Ajoutée le 5 sept. 2026 au soir. Sans elle, Android affiche
            « Terminer l'action avec… » à chaque appel dès que deux
            applications savent téléphoner — c'était l'un des deux appuis
            qu'il devait encore faire pour qu'un appel parte.

            Et contrairement aux trois autres, celle-ci se CHOISIT ici : Jarvis
            ne la demande jamais à l'oral, donc une ligne avec le seul bouton
            « Oublier » n'aurait servi à rien — la préférence serait restée
            vide pour toujours. */}
        <LigneAvecChoix
          titre="Appels"
          siRien="Rien de choisi : Android te demandera avec quelle application appeler."
          siAucune="Aucune application capable de passer un appel n'a été trouvée."
          lister={listerAppel}
          valeur={appels}
          onChoisir={(nom) => {
            ecrireReglage(CLES_APP.appels, nom)
            relire()
          }}
          onOublier={() => oublier(CLES_APP.appels)}
        />
        <LigneAvecChoix
          titre="Itinéraires"
          siRien="Rien de choisi : Jarvis te le demandera la prochaine fois."
          siAucune="Aucune application capable d'ouvrir un itinéraire n'a été trouvée."
          lister={listerItineraire}
          valeur={navigation}
          onChoisir={(nom) => {
            ecrireReglage(CLES_APP.navigation, nom)
            relire()
          }}
          onOublier={() => oublier(CLES_APP.navigation)}
        />
        {/* L'IA n'est plus ici : elle a sa carte, « Tes applications d'IA »,
            juste en dessous. Elle y montre celles qui sont installées, la
            favorite, et la phrase à dire — deux façons de régler la même
            chose finiraient par ne plus dire pareil. */}

        {/* LEQUEL des deux WhatsApp. Le 6 sept. 2026, ses messages partaient
            dans WhatsApp Business : le chemin « lien wa.me » ne visait aucune
            application, et Android choisissait. Cette ligne ne s'affiche que
            s'il en a vraiment deux — sinon il n'y a rien à choisir. */}
        <LigneWhatsApp
          paquet={whatsapp}
          onChoisir={(p) => {
            ecrireReglage(CLE_APP_WHATSAPP, p)
            relire()
          }}
          onOublier={() => oublier(CLE_APP_WHATSAPP)}
        />

        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="font-medium">Messages</p>
          {/* Ici le choix est fermé — WhatsApp ou SMS, rien d'autre — donc on
              propose les deux directement plutôt que de le renvoyer à l'oral. */}
          <div className="flex gap-1.5">
            {CANAUX.map(({ valeur, libelle }) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={canal === valeur}
                onClick={() => choisirCanal(valeur)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${
                  canal === valeur
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {libelle}
              </button>
            ))}
          </div>
          {canal === null && (
            <p className="text-xs text-muted-foreground">
              Rien de choisi : Jarvis te le demandera au premier message.
            </p>
          )}
        </div>

        {/* Réglage du chantier ed32cbcc, sa décision du 5 sept. 2026 au soir :
            « une fois qu'il y a le message, que je le relise, et que si je dis
            oui c'est bon envoie, ça l'envoie ». Décoché par défaut — sans lui,
            Jarvis prépare le message comme avant et attend un « envoie » une
            fois WhatsApp ouvert. Ne s'affiche que pour WhatsApp : le clic
            automatique sur Envoyer n'est vérifié que là. */}
        {canal !== "sms" && (
          <Interrupteur
            titre="Envoyer les messages sans que j'appuie"
            description="Jarvis relit le destinataire et le texte à voix haute avant d'ouvrir WhatsApp. Si tu dis « oui », il ouvre WhatsApp et appuie lui-même sur Envoyer."
            actif={envoiAuto}
            onChange={basculerEnvoiAuto}
          >
            {envoiAuto && (
              <p
                className={
                  accessibilite?.actif
                    ? "text-xs text-emerald-600 dark:text-emerald-400"
                    : "text-xs text-amber-600 dark:text-amber-400"
                }
              >
                {accessibilite?.actif
                  ? "Le service d'accessibilité est actif : Jarvis peut appuyer sur Envoyer."
                  : "Ce réglage a besoin du service « Appuyer sur l'écran à ta place », pas encore activé. Tant qu'il ne l'est pas, Jarvis relit le message mais ne peut rien cliquer."}
              </p>
            )}
          </Interrupteur>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Lequel des deux WhatsApp — et rien du tout quand il n'y en a qu'un.
 *
 * Une ligne « choisis ton WhatsApp » sur un téléphone qui n'en a qu'un est du
 * bruit. Elle n'apparaît que quand la question se pose vraiment, c'est-à-dire
 * exactement quand Jarvis, sinon, devinerait.
 */
function LigneWhatsApp({
  paquet,
  onChoisir,
  onOublier,
}: {
  paquet: string | null
  onChoisir: (paquet: string) => void
  onOublier: () => void
}) {
  const [apps, setApps] = useState<ApplicationInstallee[] | null>(null)

  useEffect(() => {
    ActionsTelephone.listerApplicationsWhatsApp()
      .then((r) => setApps(r.applications ?? []))
      .catch(() => setApps(null))
  }, [])

  // Rien à choisir : pas de ligne. Hors de l'app non plus.
  if (apps === null || apps.length < 2) return null

  const nomChoisi = apps.find((a) => a.paquet === paquet)?.nom ?? null

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">WhatsApp</p>
          <p className="truncate text-xs text-muted-foreground">
            {nomChoisi ??
              "Tu en as deux : tant que tu n'as pas choisi, Jarvis te le demandera plutôt que de deviner."}
          </p>
        </div>
        {paquet && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onOublier}>
            Oublier
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {apps.map((app) => (
          <button
            key={app.paquet}
            type="button"
            aria-pressed={paquet === app.paquet}
            onClick={() => onChoisir(app.paquet)}
            className={`rounded-md border px-2 py-1.5 text-xs ${
              paquet === app.paquet
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {app.nom}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * L'application d'appel : la seule des quatre qui se choisit ICI.
 *
 * Les trois autres sont demandées à l'oral la première fois. Celle-ci ne
 * l'est jamais — et un réglage qu'aucun chemin ne permet de poser est une
 * demi-fonctionnalité : elle serait restée vide, et le sélecteur d'Android
 * aurait continué de s'afficher à chaque appel.
 *
 * On ne liste QUE les applications qui savent réellement passer un appel
 * (ACTION_CALL), pas toutes celles qui sont installées : en choisir une qui
 * ne répond pas à cet intent ne changerait rien, sans que rien ne le dise.
 */
function LigneAvecChoix({
  titre,
  siRien,
  siAucune,
  lister,
  valeur,
  onChoisir,
  onOublier,
}: {
  titre: string
  /** Ce que ça donne tant qu'il n'a rien choisi. */
  siRien: string
  /** Ce qu'on dit quand on a VRAIMENT regardé et qu'il n'y a rien. */
  siAucune: string
  lister: () => Promise<{ applications: ApplicationInstallee[] }>
  valeur: string | null
  onChoisir: (nom: string) => void
  onOublier: () => void
}) {
  const [apps, setApps] = useState<ApplicationInstallee[] | null>(null)

  useEffect(() => {
    lister()
      .then((r) => setApps(r.applications ?? []))
      // Hors de l'app, ou APK antérieure à cette méthode : on retombe sur
      // l'affichage simple plutôt que sur une liste vide inexpliquée.
      .catch(() => setApps(null))
  }, [lister])

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{titre}</p>
          <p className="truncate text-xs text-muted-foreground">{valeur ?? siRien}</p>
        </div>
        {valeur && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={onOublier}>
            Oublier
          </Button>
        )}
      </div>

      {apps === null ? (
        <p className="text-xs text-muted-foreground">
          Le choix ne s'affiche que dans l'application installée sur le téléphone.
        </p>
      ) : apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">{siAucune}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {apps.map((app) => (
            <button
              key={app.paquet}
              type="button"
              aria-pressed={valeur === app.nom}
              onClick={() => onChoisir(app.nom)}
              className={`rounded-md border px-2 py-1.5 text-xs ${
                valeur === app.nom
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground"
              }`}
            >
              {app.nom}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

