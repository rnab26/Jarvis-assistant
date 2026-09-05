import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LocalNotifications } from "@capacitor/local-notifications"
import { useRelireApresRestauration } from "@/hooks/useReglagesSync"
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis"
import { phraseAnnonce, raisonDuSilence } from "@/lib/notifications/annonceVocale"
import { noterEcoute } from "@/lib/journalEcoute"
import { readVoicePrefs } from "@/lib/voicePrefs"
import {
  construirePlan,
  corpsChantiersLivres,
  ID_CHANTIERS_LIVRES,
  ID_SESSION_BLOQUEE,
} from "@/lib/notifications/plan"
import {
  ecrirePrefsNotifs,
  lirePrefsNotifs,
  type PrefsNotifications,
} from "@/lib/notifications/prefs"
import {
  appliquerPlan,
  demanderPermission,
  envoyerTest,
  ETAT_INDISPONIBLE,
  listerProgrammees,
  lireEtat,
  notificationsDisponibles,
  notifierMaintenant,
  ouvrirReglageAlarmes,
  toutAnnuler,
  type EtatNotifications,
} from "@/lib/notifications/service"
import { estPourRaphael } from "@/lib/journalDestinataire"
import { supabase } from "@/lib/supabase"
import type { DevItem, DevLogEntry, Task } from "@/types/database"

/** Groupe les livraisons d'une même session : archiver six chantiers d'affilée
 * doit faire une notification, pas six. Sa demande, mot pour mot : « groupé
 * par session, pas par chantier ». */
const FENETRE_GROUPEMENT_MS = 45_000

export interface NotificationsApi {
  prefs: PrefsNotifications
  /** Faux tant qu'on n'a pas encore interrogé Android : sans ce drapeau,
   * Paramètres afficherait "non autorisé" pendant un instant à chaque
   * ouverture, alors que la permission est accordée. */
  pret: boolean
  setPrefs: (partiel: Partial<PrefsNotifications>) => void
  etat: EtatNotifications
  /** Nombre de notifications actuellement programmées, et la prochaine. */
  programmees: { total: number; prochaine: Date | null }
  demander: () => Promise<EtatNotifications>
  ouvrirAlarmes: () => Promise<EtatNotifications>
  tester: () => Promise<void>
  effacerTout: () => Promise<void>
  rafraichir: () => Promise<void>
}

/**
 * Le système de notifications de Jarvis : ce qu'il a le droit de faire
 * sonner, quand, et ce qui se passe quand on appuie dessus.
 *
 * MONTÉ UNE SEULE FOIS, dans JarvisDataProvider — pas dans Paramètres. Les
 * rappels doivent être reprogrammés dès qu'une tâche change, y compris quand
 * la modification vient de la voix ou d'un autre appareil : un écran de
 * réglages qu'on n'ouvre jamais ne reprogrammerait plus rien.
 *
 * LA RÈGLE D'AIGUILLAGE, formulée par Raphaël le 4 sept. : ce qui décide,
 * ce n'est pas qui a initié la demande, c'est OÙ LA CHOSE ATTERRIT. Ce qui
 * vit dans la base de Jarvis (tâches, chantiers) — Jarvis notifie. Ce qui
 * est parti chez Google (événement d'agenda, mail) — Google notifie, et on
 * se tait, sinon il reçoit tout en double. C'est pour ça qu'on ne lit ici
 * que `tasks` et `dev_items`, et jamais l'agenda.
 */
export function useNotifications(
  tasks: Task[],
  devItems: DevItem[],
  userId: string | undefined,
): NotificationsApi {
  const navigate = useNavigate()
  const [prefs, setPrefsState] = useState<PrefsNotifications>(lirePrefsNotifs)
  const [etat, setEtat] = useState<EtatNotifications>(ETAT_INDISPONIBLE)
  const [programmees, setProgrammees] = useState<{ total: number; prochaine: Date | null }>({
    total: 0,
    prochaine: null,
  })
  const [pret, setPret] = useState(false)

  useRelireApresRestauration(() => setPrefsState(lirePrefsNotifs()))

  const relireListe = useCallback(async () => {
    const liste = await listerProgrammees()
    const dates = liste
      .map((n) => (n.schedule?.at ? new Date(n.schedule.at) : null))
      .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    setProgrammees({ total: liste.length, prochaine: dates[0] ?? null })
  }, [])

  const rafraichir = useCallback(async () => {
    setEtat(await lireEtat())
    await relireListe()
    setPret(true)
  }, [relireListe])

  useEffect(() => {
    void rafraichir()
  }, [rafraichir])

  // Ce que Jarvis DIT quand une de ses notifications arrive. La décision
  // vit dans annonceVocale.ts, qui se vérifie sans téléphone ; ici on ne fait
  // que la brancher. Passe par une ref : ces écouteurs sont montés une seule
  // fois, et sans elle ils garderaient les réglages du premier rendu — le
  // piège déjà payé dans MicButton le 4 sept.
  const { speak } = useSpeechSynthesis()
  const direRef = useRef<
    (
      notification: { title?: string | null; body?: string | null },
      declencheur: "recue" | "appui",
    ) => void
  >(() => {})
  useEffect(() => {
    direRef.current = (notification, declencheur) => {
      const ctx = { prefs, voixCoupee: readVoicePrefs().muted, maintenant: new Date() }
      const phrase = phraseAnnonce(notification, ctx)
      // Écrit dans le journal d'écoute, dit ou pas dit : le pont Android ne se
      // vérifie pas depuis une machine sans téléphone, et sans cette trace
      // « ça n'a pas parlé » n'aurait aucune cause lisible — ni même de quoi
      // savoir si l'annonce a seulement été déclenchée.
      noterEcoute("notif_annonce", {
        declencheur,
        dite: phrase !== null,
        raison: raisonDuSilence(notification, ctx),
        longueur: phrase?.length ?? 0,
      })
      // Sans attendre, et sans faire échouer quoi que ce soit : une voix qui
      // ne part pas ne doit pas empêcher la notification de s'afficher.
      if (phrase) void speak(phrase).catch(() => {})
    }
  })

  // Appuyer sur une notification doit emmener là où se trouve la chose dont
  // elle parle. Sans ça, on retombe sur la dernière page ouverte et il faut
  // refaire le chemin à la main — ce qui, sur un rappel, revient à l'ignorer.
  useEffect(() => {
    if (!notificationsDisponibles()) return
    const poignees = [
      LocalNotifications.addListener(
        "localNotificationActionPerformed",
        ({ notification }) => {
          const route = (notification.extra as { route?: string } | undefined)?.route
          if (route) navigate(route)
          direRef.current(notification, "appui")
          void rafraichir()
        },
      ),
      // Reçue pendant que l'app est OUVERTE : Android ne l'affiche alors
      // parfois même pas dans le volet, et rien n'était dit. C'est le cas où
      // parler coûte le moins et sert le plus — il a le téléphone en main.
      LocalNotifications.addListener("localNotificationReceived", (notification) => {
        direRef.current(notification, "recue")
      }),
    ]
    return () => {
      for (const poignee of poignees) poignee.then((h) => h.remove()).catch(() => {})
    }
  }, [navigate, rafraichir])

  // Reprogrammation. La signature évite de refaire le travail natif à chaque
  // rechargement de la liste des tâches : `tasks` est un nouveau tableau à
  // chaque rafraîchissement temps réel, même quand rien n'a changé.
  const signatureRef = useRef<string | null>(null)
  useEffect(() => {
    if (!notificationsDisponibles() || !etat.autorise) return
    const plan = construirePlan(tasks, prefs)
    const signature = JSON.stringify(
      plan.map((n) => [n.id, n.titre, n.corps, n.quand.getTime()]),
    )
    if (signature === signatureRef.current) return
    signatureRef.current = signature

    const timer = setTimeout(() => {
      appliquerPlan(plan)
        .then(relireListe)
        .catch(() => {
          // Programmation refusée par Android (permission retirée entre-temps) :
          // l'état relu le dira, inutile d'interrompre l'utilisateur ici.
          void rafraichir()
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [tasks, prefs, etat.autorise, relireListe, rafraichir])

  // Chantiers livrés par une session pendant que l'app tourne.
  const dejaArchivesRef = useRef<Set<string> | null>(null)
  const enAttenteRef = useRef<string[]>([])
  const timerLivraisonRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const archives = new Set(devItems.filter((i) => i.archived_at).map((i) => i.id))
    const connus = dejaArchivesRef.current
    dejaArchivesRef.current = archives
    // Premier chargement : tout est "nouveau" alors que rien ne vient de se
    // passer. On mémorise sans notifier.
    if (connus === null || !prefs.livre) return

    const nouveaux = devItems.filter((i) => i.archived_at && !connus.has(i.id))
    if (nouveaux.length === 0) return
    enAttenteRef.current.push(...nouveaux.map((i) => i.title))

    if (timerLivraisonRef.current) clearTimeout(timerLivraisonRef.current)
    timerLivraisonRef.current = setTimeout(() => {
      const titres = enAttenteRef.current
      enAttenteRef.current = []
      timerLivraisonRef.current = null
      if (titres.length === 0) return
      // .catch() et pas void : une notification qui ne peut pas partir
      // (permission retirée entre-temps) laisserait sinon une promesse
      // rejetée non gérée, qui casse la page pour une information
      // secondaire. Elle observe, elle ne commande rien.
      notifierMaintenant({
        id: ID_CHANTIERS_LIVRES,
        titre:
          titres.length === 1
            ? "Un chantier livré"
            : `${titres.length} chantiers livrés`,
        corps: corpsChantiersLivres(titres),
        canal: "livraisons",
        route: "/cockpit",
      }).catch(() => {})
    }, FENETRE_GROUPEMENT_MS)
  }, [devItems, prefs.livre])

  // Sessions bloquées : elles écrivent dans le journal de bord et attendent.
  // On écoute les insertions plutôt que de relire la table : c'est le seul
  // moment où l'information est neuve, et le journal complet n'est chargé
  // que dans le cockpit.
  useEffect(() => {
    if (!userId || !prefs.bloque || !notificationsDisponibles()) return
    let annule = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function brancher() {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (annule || !token) return
      await supabase.realtime.setAuth(token)
      if (annule) return
      channel = supabase
        .channel(`notifs:dev_log:${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "dev_log", filter: `user_id=eq.${userId}` },
          ({ new: ligne }) => {
            const entree = ligne as DevLogEntry
            if (!estPourRaphael(entree)) return
            notifierMaintenant({
              id: ID_SESSION_BLOQUEE,
              titre:
                entree.kind === "blocage"
                  ? "Une session est bloquée"
                  : "Une session te pose une question",
              corps: entree.body.slice(0, 240),
              canal: "blocages",
              route: "/cockpit",
            }).catch(() => {})
          },
        )
        .subscribe()
    }

    brancher()
    return () => {
      annule = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, prefs.bloque])

  const setPrefs = useCallback((partiel: Partial<PrefsNotifications>) => {
    setPrefsState((precedent) => {
      const suivant = { ...precedent, ...partiel }
      ecrirePrefsNotifs(suivant)
      return suivant
    })
  }, [])

  const demander = useCallback(async () => {
    const suivant = await demanderPermission()
    setEtat(suivant)
    // La signature est repartie à zéro : la permission vient d'être
    // accordée, il faut programmer maintenant ce qui ne pouvait pas l'être.
    signatureRef.current = null
    await relireListe()
    return suivant
  }, [relireListe])

  const ouvrirAlarmes = useCallback(async () => {
    const suivant = await ouvrirReglageAlarmes()
    setEtat(suivant)
    return suivant
  }, [])

  const tester = useCallback(async () => {
    await envoyerTest()
  }, [])

  const effacerTout = useCallback(async () => {
    await toutAnnuler()
    signatureRef.current = null
    await relireListe()
  }, [relireListe])

  return {
    prefs,
    pret,
    setPrefs,
    etat,
    programmees,
    demander,
    ouvrirAlarmes,
    tester,
    effacerTout,
    rafraichir,
  }
}
