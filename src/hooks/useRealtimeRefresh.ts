import { useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

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
 */
export function useRealtimeRefresh(
  table: string,
  userId: string | undefined,
  refresh: () => void,
) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    if (!userId) return
    let annule = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    // Une commande vocale peut produire plusieurs écritures d'affilée : on
    // groupe la rafale en un seul rechargement.
    let timer: ReturnType<typeof setTimeout> | null = null

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
        .subscribe()
    }

    brancher()

    return () => {
      annule = true
      if (timer) clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [table, userId])
}
