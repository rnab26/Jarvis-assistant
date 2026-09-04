import { ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Le lien vers la page de confidentialité.
 *
 * La page existe et est publiée (public/confidentialite.html, vérifiée en
 * ligne), mais aucun écran de l'application n'y menait : elle n'avait été
 * écrite que pour la validation du compte Google. Or c'est la page qui dit
 * où vivent les données, ce que Google reçoit, et — point qui compte — que
 * les contenus envoyés à l'offre gratuite de Gemini peuvent servir à
 * améliorer ses produits. Une application qui traite des mails et un agenda
 * doit pouvoir montrer ça depuis ses réglages, sans qu'on aille chercher une
 * URL.
 *
 * Lien absolu vers le site publié, et pas le fichier local : dans l'app,
 * ouvrir une page locale remplacerait l'application dans sa propre fenêtre
 * (et lui ferait perdre son état pour revenir). Là, Android l'ouvre dans le
 * navigateur, Jarvis reste où il est.
 */
const URL_CONFIDENTIALITE = "https://rnab26.github.io/Jarvis-assistant/confidentialite.html"

export function Confidentialite() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confidentialité</CardTitle>
        <CardDescription>
          Où vivent tes données, ce que Google reçoit quand ton compte est branché, ce que Jarvis
          retient et pendant combien de temps.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a
          href={URL_CONFIDENTIALITE}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
        >
          Lire la page de confidentialité
          <ExternalLink className="size-3.5" />
        </a>
      </CardContent>
    </Card>
  )
}
