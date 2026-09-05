import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CLES_APP,
  CLE_CANAL_MESSAGES,
  appPreferee,
  canalMessagesPrefere,
} from "@/lib/actionsTelephoneVocales"
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
  const [ia, setIa] = useState<string | null>(null)
  const [appels, setAppels] = useState<string | null>(null)
  const [canal, setCanal] = useState<"whatsapp" | "sms" | null>(null)

  function relire() {
    setMusique(appPreferee("musique"))
    setNavigation(appPreferee("navigation"))
    setIa(appPreferee("ia"))
    setAppels(appPreferee("appels"))
    setCanal(canalMessagesPrefere())
  }

  useEffect(() => {
    relire()
    // La base gagne à la connexion : sans ça, l'écran resterait sur ce qu'il
    // avait lu au montage et afficherait une préférence périmée.
    window.addEventListener(REGLAGES_RESTAURES, relire)
    return () => window.removeEventListener(REGLAGES_RESTAURES, relire)
  }, [])

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
        <Ligne
          titre="Musique"
          valeur={musique}
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
        <LigneAppel
          valeur={appels}
          onChoisir={(nom) => {
            ecrireReglage(CLES_APP.appels, nom)
            relire()
          }}
          onOublier={() => oublier(CLES_APP.appels)}
        />
        <Ligne
          titre="Itinéraires"
          valeur={navigation}
          onOublier={() => oublier(CLES_APP.navigation)}
        />
        {/* Manquait à l'appel : cette préférence existait, se fixait à l'oral,
            et n'apparaissait nulle part — exactement le défaut que cette carte
            répare pour les deux autres. Trouvée par verifier-reglages.ts. */}
        <Ligne
          titre="Question à une IA"
          valeur={ia}
          onOublier={() => oublier(CLES_APP.ia)}
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
      </CardContent>
    </Card>
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
function LigneAppel({
  valeur,
  onChoisir,
  onOublier,
}: {
  valeur: string | null
  onChoisir: (nom: string) => void
  onOublier: () => void
}) {
  const [apps, setApps] = useState<ApplicationInstallee[] | null>(null)

  useEffect(() => {
    ActionsTelephone.listerApplicationsAppel()
      .then((r) => setApps(r.applications ?? []))
      // Hors de l'app, ou APK antérieure à cette méthode : on retombe sur
      // l'affichage simple plutôt que sur une liste vide inexpliquée.
      .catch(() => setApps(null))
  }, [])

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Appels</p>
          <p className="truncate text-xs text-muted-foreground">
            {valeur ?? "Rien de choisi : Android te demandera avec quelle application appeler."}
          </p>
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
        <p className="text-xs text-muted-foreground">
          Aucune application capable de passer un appel n'a été trouvée.
        </p>
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

function Ligne({
  titre,
  valeur,
  onOublier,
}: {
  titre: string
  valeur: string | null
  onOublier: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="font-medium">{titre}</p>
        <p className="truncate text-xs text-muted-foreground">
          {valeur ?? "Rien de choisi : Jarvis te le demandera la prochaine fois."}
        </p>
      </div>
      {valeur && (
        // « Oublier » plutôt qu'un champ à retaper : le nom doit correspondre à
        // une application réellement installée, et Jarvis sait la retrouver en
        // la redemandant. Un nom tapé de travers ne lancerait rien.
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onOublier}>
          Oublier
        </Button>
      )}
    </div>
  )
}
