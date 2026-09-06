import { useCallback, useEffect, useRef, useState } from "react"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { MATINS_A_PREPARER, grouperParJour, type Agenda, type RendezVous } from "@/lib/notifications/plan"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Ses rendez-vous des prochains jours, pour le point du matin.
 *
 * POURQUOI UN HOOK À PART, et c'est la consigne écrite dans le chantier
 * 307b6fa2 : « attention à ne pas appeler l'agenda dans le chemin de
 * reprogrammation, qui se déclenche à chaque modification. » Les notifications
 * sont reprogrammées dès qu'une tâche change — cocher une tâche appellerait
 * Google. On charge donc l'agenda de son côté, une fois, et la
 * reprogrammation se sert de ce qu'on a.
 *
 * SI L'AGENDA NE RÉPOND PAS, ON GARDE CE QU'ON A. Compte non branché, jeton
 * expiré, réseau coupé : le point du matin retombe alors exactement sur le
 * texte d'avant ce chantier, celui qui ne parle que des tâches. Une panne
 * d'agenda ne doit pas faire disparaître un point du matin dont il ne s'est
 * jamais plaint.
 */
const RAFRAICHIR_AU_PLUS_TOUS_LES_MS = 30 * 60 * 1000

export function useAgendaDuMatin(actif: boolean): Agenda {
  const [agenda, setAgenda] = useState<Agenda>({})
  const dernier = useRef(0)

  const charger = useCallback(async () => {
    // Point du matin éteint : pas la peine de déranger Google, ni de dépenser
    // un aller-retour réseau pour un texte que personne ne lira.
    if (!actif) return
    if (Date.now() - dernier.current < RAFRAICHIR_AU_PLUS_TOUS_LES_MS) return
    dernier.current = Date.now()

    try {
      const maintenant = new Date()
      const fin = new Date(maintenant)
      fin.setDate(fin.getDate() + MATINS_A_PREPARER)
      const { data, error } = await withTimeout(
        supabase.functions.invoke("google-calendar", {
          body: {
            action: "list",
            depuis: maintenant.toISOString(),
            jusqu_a: fin.toISOString(),
            // Sept jours de rendez-vous : au-delà, on remplirait la mémoire
            // pour des matins qu'on reprogrammera de toute façon avant.
            limite: 50,
          },
        }),
      )
      if (error || !Array.isArray(data?.evenements)) return
      setAgenda(grouperParJour(data.evenements as RendezVous[]))
    } catch {
      // Silencieux par construction : voir l'en-tête. Ce qu'on avait reste.
    }
  }, [actif])

  useEffect(() => {
    void charger()
  }, [charger])
  useRefreshOnForeground(charger)

  return agenda
}
