import { LogOut } from "lucide-react"
import { ConfirmerAction } from "@/components/ConfirmerAction"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/hooks/useAuth"

/**
 * Se déconnecter — déplacé ici le 7 sept. 2026, à sa demande.
 *
 * SES MOTS, capture à l'appui : « remonté le menu parametre en haut a droite a
 * la place de déconnexion et intégrer la déconnexion dans les paramètres ».
 *
 * POURQUOI C'EST UN PROGRÈS ET PAS UN DÉPLACEMENT : « Déconnexion » était le
 * bouton le plus visible de l'application, en haut à droite de CHAQUE écran,
 * alors que c'est l'action la plus rare — et la plus fâcheuse à déclencher par
 * erreur. Elle prenait la place de celle dont il se sert tous les jours.
 *
 * ET ELLE DEMANDE AVANT, comme toute action qu'on ne peut pas défaire d'un
 * geste : se reconnecter demande de retrouver son mot de passe, ce qui n'est
 * jamais le moment. Même composant que les autres confirmations de l'app.
 */
export function Deconnexion() {
  const { session, signOut } = useAuth()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Se déconnecter</CardTitle>
        <CardDescription>
          {session?.user.email
            ? `Connecté avec ${session.user.email}.`
            : "Tu es connecté."}{" "}
          Tes tâches, chantiers et souvenirs restent en base : rien n'est perdu.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ConfirmerAction
          titre="Se déconnecter de Jarvis ?"
          description="Il faudra te reconnecter avec ton adresse et ton mot de passe pour revenir. Rien n'est supprimé."
          libelleConfirmation="Se déconnecter"
          onConfirmer={signOut}
          trigger={
            <Button variant="outline" size="sm">
              <LogOut className="size-4" />
              Se déconnecter
            </Button>
          }
        />
      </CardContent>
    </Card>
  )
}
