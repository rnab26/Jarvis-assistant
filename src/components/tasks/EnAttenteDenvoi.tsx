import { CloudOff, RotateCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { resumerFile, type ElementEnAttente } from "@/lib/fileEnAttente"

/**
 * Ce qu'il a dicté et qui n'est pas encore enregistré.
 *
 * SA CRAINTE, dans le chantier b5411c23 : « s'assurer que tout ajout de tâches
 * ou autre chose faites dans jarvis soit enregistré en live […] il peut y
 * avoir de la perte de datas ». Il dicte en voiture : le réseau coupé n'est
 * pas le cas rare, c'est la situation normale.
 *
 * TROIS CHOSES QUE CETTE CARTE FAIT, ET UNE QU'ELLE NE FAIT PAS.
 *
 * 1. ELLE NE S'AFFICHE PAS QUAND IL N'Y A RIEN. `resumerFile` rend `phrase:
 *    null` dans ce cas, et on ne rend rien du tout. Un bandeau « 0 en
 *    attente » est une ligne de plus à lire, et il use le signal qui doit
 *    servir le jour où il y a vraiment quelque chose.
 * 2. ELLE NE DIT JAMAIS « C'EST ENREGISTRÉ ». La phrase vient du module pur,
 *    qui est gardé là-dessus par son contrôle hors ligne. Le mot qui compte
 *    est « dès que » : il annonce qu'il reste quelque chose à faire.
 * 3. ELLE EST AU-DESSUS DE LA LISTE, PAS DEDANS. Le filtre de catégorie ne
 *    doit pas pouvoir la masquer : une tâche en attente rangée dans une
 *    catégorie qu'il ne regarde pas est précisément celle qu'il perdrait.
 *
 * CE QU'ELLE NE FAIT PAS : proposer d'abandonner depuis ici. Abandonner
 * détruit une dictée, donc ça passe par `ConfirmerAction`, et c'est sur LA
 * LIGNE de la tâche — là où il voit ce qu'il abandonne, pas dans un résumé qui
 * ne nomme rien.
 */
interface EnAttenteDenvoiProps {
  file: ElementEnAttente[]
  /**
   * Le tampon n'a pas pu être lu ou pas pu être écrit.
   *
   * Ce n'est PAS « rien en attente », et la différence est tout l'intérêt :
   * lui dire que tout va bien alors qu'on n'en sait rien, c'est exactement la
   * panne silencieuse qu'on cherche à supprimer.
   */
  illisible?: boolean
}

export function EnAttenteDenvoi({ file, illisible }: EnAttenteDenvoiProps) {
  const resume = resumerFile(file)

  if (resume.phrase === null && !illisible) return null

  return (
    <Card className={resume.bloques > 0 ? "border-destructive/50" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <CloudOff
            className={`mr-1.5 inline size-4 align-[-2px] ${
              resume.bloques > 0 ? "text-destructive" : "text-muted-foreground"
            }`}
          />
          {resume.total > 0
            ? `${resume.total} chose${resume.total > 1 ? "s" : ""} en attente d'envoi`
            : "La file d'attente n'a pas pu être lue"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {resume.phrase && <p className="text-sm">{resume.phrase}</p>}

        {illisible && (
          <p className="text-sm text-destructive">
            Je n'ai pas pu lire ce qui attendait d'être envoyé sur cet appareil. Ce n'est pas « rien
            en attente » : je ne sais pas. Ce que tu dictes maintenant part quand même, mais ne
            comptera pas sur ce tampon si tu fermes l'application.
          </p>
        )}

        {resume.total > 0 && (
          <p className="text-xs text-muted-foreground">
            <RotateCw className="mr-1 inline size-3 align-[-1px]" />
            {resume.bloques > 0
              ? "Chaque ligne concernée porte un bouton pour réessayer, et un pour l'abandonner."
              : "Elles repartent toutes seules dès que le réseau revient, dans l'ordre où tu les as dites."}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
