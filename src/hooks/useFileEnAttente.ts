import { useCallback, useEffect, useRef, useState } from "react"
import { errorMessage } from "@/lib/errorMessage"
import { signalerErreur } from "@/lib/erreurs"
import {
  aRenvoyer,
  estBloque,
  lireFile,
  mettreEnFile,
  noterEchec,
  relancer,
  retirerDeLaFile,
  serialiserFile,
  type CibleEnAttente,
  type ElementEnAttente,
} from "@/lib/fileEnAttente"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"

/**
 * Ce qu'il a dicté sans réseau, en attendant que ça s'écrive vraiment.
 *
 * D'OÙ ÇA VIENT. La moitié TÂCHES existait depuis le 7 sept. 2026, écrite à
 * même `useTasks`. Le chantier 8b804a01 demandait la même chose pour les
 * CHANTIERS dictés — exactement le même cas : une dictée qui n'existe que dans
 * le navigateur au moment où l'écriture échoue, et le cas qui motive tout ça
 * est « il dicte en conduisant, dans un tunnel ».
 *
 * RECOPIER CENT LIGNES DANS `useDevItems` AURAIT ÉTÉ LE VRAI DANGER : deux
 * boucles de renvoi qui finissent par ne plus se comporter pareil, sur le seul
 * mécanisme dont le rôle est de ne rien perdre. Elles vivent donc ici, une
 * fois, et les deux hooks s'en servent.
 *
 * UNE CLÉ DE STOCKAGE PAR CIBLE, et c'est délibéré. Le tampon est un simple
 * tableau JSON : deux instances qui liraient et réécriraient la MÊME clé
 * s'effaceraient mutuellement — la dernière à écrire emporterait ce que
 * l'autre venait d'ajouter. Une dictée perdue par le mécanisme censé les
 * sauver serait la pire panne possible, et parfaitement silencieuse.
 *
 * Le raisonnement lui-même (quand renvoyer, quand abandonner, quoi dire) reste
 * dans `src/lib/fileEnAttente.ts`, qui est PUR et vérifié hors ligne. Ici il
 * n'y a que le tampon, l'envoi et les déclencheurs.
 */
export interface FileEnAttenteApi<T> {
  /** Ce qui attend, dans l'ordre dicté. */
  file: ElementEnAttente<T>[]
  /** Vrai quand le tampon n'a PAS pu être lu : ce n'est pas « rien en
   * attente », c'est « on ne sait pas ». */
  illisible: boolean
  /** Met une dictée en file après un échec d'écriture. */
  ajouter: (id: string, contenu: T, libelle: string, erreur: unknown) => void
  /** Il appuie sur « Réessayer ». */
  relancerEnvoi: (id: string) => void
  /** Il retire une dictée : elle disparaît pour de bon. */
  oublier: (id: string) => void
  /** Renvoie ce qui attend. Appelée par les déclencheurs, et au retour au
   * premier plan par l'appelant. */
  vider: () => Promise<void>
}

export function useFileEnAttente<T extends object>(options: {
  /** La clé de stockage, propre à cette cible (voir plus haut). */
  cle: string
  cible: CibleEnAttente
  /** La table Supabase où renvoyer. */
  table: string
  userId: string | undefined
  /** Rechargé quand au moins un renvoi est passé. */
  refresh: () => Promise<void> | void
  /** Ce qu'on écrit dans le registre des erreurs quand on abandonne, suivi du
   * libellé de la dictée. Ex. « Tâche dictée jamais enregistrée ». */
  titreAbandon: string
}): FileEnAttenteApi<T> {
  const { cle, cible, table, userId, refresh, titreAbandon } = options

  const [file, setFile] = useState<ElementEnAttente<T>[]>([])
  const [illisible, setIllisible] = useState(false)
  // La boucle de renvoi vit dans un effet monté UNE FOIS : sans cette
  // référence elle garderait la file du premier rendu, c'est-à-dire vide, et
  // ne renverrait jamais rien. Le piège déjà payé dans MicButton le 4 sept.
  const fileRef = useRef<ElementEnAttente<T>[]>([])

  useEffect(() => {
    let brut: string | null = null
    try {
      brut = localStorage.getItem(cle)
    } catch {
      setIllisible(true)
      return
    }
    const lue = lireFile(brut)
    if (lue === null) setIllisible(true)
    else {
      fileRef.current = lue as ElementEnAttente<T>[]
      setFile(fileRef.current)
    }
  }, [cle])

  // Écrit à CHAQUE changement, sans attendre : le cas qui compte est celui où
  // il range son téléphone tout de suite après avoir dicté.
  const ecrire = useCallback(
    (suivante: ElementEnAttente<T>[]) => {
      fileRef.current = suivante
      setFile(suivante)
      try {
        localStorage.setItem(cle, serialiserFile(suivante))
      } catch {
        // Stockage plein ou refusé : la file sert encore pour cette session,
        // mais on ne peut pas promettre qu'elle survivra à la fermeture.
        setIllisible(true)
      }
    },
    [cle],
  )

  const ajouter = useCallback(
    (id: string, contenu: T, libelle: string, erreur: unknown) => {
      ecrire(
        mettreEnFile(fileRef.current, {
          id,
          cible,
          contenu,
          libelle,
          creeA: Date.now(),
          essais: 0,
          dernierEchec: errorMessage(erreur),
          dernierEssaiA: Date.now(),
        }) as ElementEnAttente<T>[],
      )
    },
    [cible, ecrire],
  )

  const vider = useCallback(async () => {
    if (!userId) return
    const aFaire = aRenvoyer(fileRef.current, Date.now())
    if (aFaire.length === 0) return

    let courante = fileRef.current
    let auMoinsUnPasse = false
    for (const element of aFaire) {
      try {
        // UPSERT, pas insert : si l'écriture était en fait passée la première
        // fois (réponse perdue), celle-ci ne fait rien du tout au lieu de
        // créer un jumeau.
        const { error } = await withTimeout(
          supabase
            .from(table)
            .upsert({ ...element.contenu, id: element.id, user_id: userId }, { onConflict: "id" }),
        )
        if (error) throw error
        courante = retirerDeLaFile(courante, element.id) as ElementEnAttente<T>[]
        auMoinsUnPasse = true
      } catch (e) {
        courante = noterEchec(courante, element.id, errorMessage(e), Date.now()) as ElementEnAttente<T>[]
        const bloque = courante.find((x) => x.id === element.id)
        // UN ABANDON NE SE FAIT JAMAIS EN SILENCE : au moment où l'on cesse de
        // renvoyer tout seul, ça devient une ligne du registre des erreurs.
        // Pas avant — un réseau coupé de trente secondes n'est pas une panne.
        if (bloque && estBloque(bloque)) {
          signalerErreur("systeme", `${titreAbandon} : ${element.libelle}`, {
            detail: errorMessage(e),
          })
        }
      }
    }
    ecrire(courante)
    if (auMoinsUnPasse) await refresh()
  }, [userId, table, titreAbandon, ecrire, refresh])

  /** Il appuie sur « Réessayer » : on repart d'essais à zéro, parce que c'est
   * un geste de sa part et pas un renvoi automatique de plus. */
  const relancerEnvoi = useCallback(
    (id: string) => {
      ecrire(relancer(fileRef.current, id) as ElementEnAttente<T>[])
      // Le prochain tour de `vider` le reprendra ; on ne l'attend pas ici,
      // sinon le bouton resterait bloqué le temps du réseau.
    },
    [ecrire],
  )

  const oublier = useCallback(
    (id: string) => ecrire(retirerDeLaFile(fileRef.current, id) as ElementEnAttente<T>[]),
    [ecrire],
  )

  // ── Ce qui fait repartir la file ─────────────────────────────────────────
  // Trois déclencheurs, et il faut les trois : le retour du réseau (le cas
  // qu'il vit — il sort du tunnel), le retour au premier plan (branché par
  // l'appelant, qui recharge en même temps), et un battement régulier
  // (« en ligne » peut être vrai alors que rien ne passe : un Wi-Fi de
  // parking, un portail captif).
  useEffect(() => {
    if (!userId) return
    const repartir = () => {
      void vider()
    }
    repartir()
    window.addEventListener("online", repartir)
    const battement = window.setInterval(repartir, 30_000)
    return () => {
      window.removeEventListener("online", repartir)
      window.clearInterval(battement)
    }
  }, [userId, vider])

  return { file, illisible, ajouter, relancerEnvoi, oublier, vider }
}
