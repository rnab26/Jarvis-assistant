import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { StatutDirect } from "@/lib/etatDirect"

/**
 * Recharge une liste dès qu'une de ses lignes change en base, quelle que
 * soit l'origine du changement.
 *
 * Avant, l'app ne rechargeait que sur ses PROPRES écritures et au retour au
 * premier plan : une tâche ajoutée depuis le web n'apparaissait jamais dans
 * l'app restée ouverte, et inversement. C'est ce qui donnait "l'affichage
 * des tâches ne se met pas toujours à jour tout seul".
 *
 * On ne consomme pas la ligne reçue : on relance le chargement normal. Une
 * seule source de vérité pour ce qui est affiché (la requête de la liste,
 * avec son tri), au lieu d'une deuxième logique de fusion qui pourrait
 * diverger.
 *
 * Le jeton de l'utilisateur est posé sur la connexion Realtime AVANT de
 * s'abonner : sans ça, le canal rejoint avec la seule clé publique, RLS
 * refuse la diffusion et on ne reçoit jamais rien — vérifié, le canal passe
 * bien "SUBSCRIBED" et reste silencieux, l'échec est donc totalement muet.
 *
 * IL REND SON ÉTAT, et c'est le chantier ce69489b : « Les taches ne
 * s'affichent pas en live et il n'y a aucun moyen d'actualiser ».
 * `subscribe()` était appelé SANS rappel — un CHANNEL_ERROR, un TIMED_OUT,
 * une socket qu'Android ferme en veille passaient sans un mot, et l'écran
 * restait figé en ayant l'air normal. La bibliothèque retente d'elle-même
 * (son `rejoinTimer`, lu dans RealtimeChannel.js) ; on ne double donc PAS sa
 * boucle de reconnexion, on dit seulement où elle en est. Ce qu'on ajoute
 * par-dessus, c'est `rebrancher()` : un vrai geste de réparation, appelé
 * quand Raphaël appuie sur Actualiser alors que le canal est coupé.
 */
export function useRealtimeRefresh(
  table: string,
  userId: string | undefined,
  refresh: () => void,
): { statut: StatutDirect; rebrancher: () => void } {
  const [statut, setStatut] = useState<StatutDirect>("connexion")
  // Incrémenté par `rebrancher()` : refait tourner l'effet, donc défait le
  // canal et en rejoint un neuf.
  const [essai, setEssai] = useState(0)
  const refreshRef = useRef(refresh)
  // Affectation dans un effet, pas pendant le rendu : lire ou écrire
  // une ref pendant le rendu est un anti-patron React.
  useEffect(() => {
    refreshRef.current = refresh
  })

  const rebrancher = useCallback(() => {
    setStatut("connexion")
    setEssai((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!userId) return
    let annule = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    // Une commande vocale peut produire plusieurs écritures d'affilée : on
    // groupe la rafale en un seul rechargement.
    let timer: ReturnType<typeof setTimeout> | null = null
    // Est-on déjà passé par « SUBSCRIBED » sur CE canal ? La première fois,
    // l'appelant vient de charger la liste tout seul : recharger serait une
    // requête pour rien, trois fois par ouverture d'écran.
    let dejaJoint = false

    function planifier() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        refreshRef.current()
      }, 250)
    }

    async function brancher() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (annule || !token) return
      await supabase.realtime.setAuth(token)
      if (annule) return

      channel = supabase
        .channel(`realtime:${table}:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
          planifier,
        )
        .subscribe((etat) => {
          if (annule) return
          if (etat === "SUBSCRIBED") {
            // On recharge en REJOIGNANT, pas seulement au premier abonnement :
            // pendant que le canal était coupé, tout ce qui a changé ailleurs
            // est passé à côté. Sans ça, il retrouverait le direct ET une
            // liste périmée, ce qui est le pire des deux.
            setStatut("en_ligne")
            if (dejaJoint) planifier()
            dejaJoint = true
          } else if (etat === "CHANNEL_ERROR" || etat === "TIMED_OUT" || etat === "CLOSED") {
            setStatut("coupe")
          }
        })
    }

    brancher()

    return () => {
      annule = true
      if (timer) clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [table, userId, essai])

  return { statut, rebrancher }
}
