import { useCallback, useEffect, useRef, useState } from "react"
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh"
import { useRefreshOnForeground } from "@/hooks/useRefreshOnForeground"
import { agirSurEcran } from "@/lib/controleEcran"
import { phraseDebutRejeu, phraseEchecRejeu, type EtapeEntrainement, type SequenceEntrainement } from "@/lib/entrainement"
import { errorMessage } from "@/lib/errorMessage"
import { withErrorToast } from "@/lib/notifyError"
import { supabase } from "@/lib/supabase"
import { withTimeout } from "@/lib/withTimeout"
import type { SequenceEntrainementRow } from "@/types/database"

/**
 * Les séquences enregistrées en mode entraînement (chantier 86df4f4a).
 *
 * La DÉCISION (reconnaître « commence/termine l'entraînement », retrouver la
 * bonne séquence à « refais X ») vit dans `src/lib/entrainement.ts`, pur et
 * vérifié hors ligne. Ici, seulement la lecture, l'écriture, et l'exécution
 * du rejeu — qui doit forcément vivre côté React, puisqu'elle appelle
 * `agirSurEcran` (le pont vers le service d'accessibilité).
 */
export function useEntrainement(userId: string | undefined) {
  const [sequences, setSequences] = useState<SequenceEntrainementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!userId) {
      setSequences([])
      setError(null)
      setLoading(false)
      return
    }
    const request = ++latestRequest.current
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from("sequences_entrainement")
          .select("*")
          .order("created_at", { ascending: false }),
      )
      if (request !== latestRequest.current) return
      if (queryError) throw queryError
      setSequences(data ?? [])
      setError(null)
    } catch (e) {
      if (request !== latestRequest.current) return
      setError(errorMessage(e))
    } finally {
      if (request === latestRequest.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useRefreshOnForeground(refresh)
  useRealtimeRefresh("sequences_entrainement", userId, refresh)

  /** Enregistre ce qui vient d'être montré. Un nom déjà pris est complété
   * plutôt que refusé : deux entraînements le même jour portent souvent le
   * même nom faute d'y avoir pensé, et bloquer sur un doublon perdrait la
   * dictée qu'on vient de faire. */
  async function addSequence(nom: string, etapes: EtapeEntrainement[]) {
    if (!userId) return
    await withErrorToast("Impossible d'enregistrer cette séquence", async () => {
      const { error } = await supabase
        .from("sequences_entrainement")
        .insert({ user_id: userId, nom, etapes })
      if (error) throw error
      await refresh()
    })
  }

  async function renameSequence(id: string, nom: string) {
    await withErrorToast("Impossible de renommer cette séquence", async () => {
      const { error } = await supabase
        .from("sequences_entrainement")
        .update({ nom, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  async function deleteSequence(id: string) {
    await withErrorToast("Impossible de supprimer cette séquence", async () => {
      const { error } = await supabase.from("sequences_entrainement").delete().eq("id", id)
      if (error) throw error
      await refresh()
    })
  }

  /** Après un rejeu, silencieux comme le reste des compteurs de ce projet :
   * un échec de cette écriture ne doit pas se voir en plus de l'échec du
   * rejeu lui-même. */
  async function noterResultatRejeu(id: string, reussi: boolean) {
    try {
      const sequence = sequences.find((s) => s.id === id)
      await supabase
        .from("sequences_entrainement")
        .update({
          dernier_essai_at: new Date().toISOString(),
          dernier_resultat: reussi ? "reussi" : "echec",
          reussites: (sequence?.reussites ?? 0) + (reussi ? 1 : 0),
          echecs: (sequence?.echecs ?? 0) + (reussi ? 0 : 1),
        })
        .eq("id", id)
      await refresh()
    } catch {
      // Un compteur qui rate ne doit jamais faire échouer le rejeu qu'il compte.
    }
  }

  /**
   * Exécute une séquence pas à pas, dans l'ordre enregistré. S'ARRÊTE au
   * premier échec plutôt que de continuer à l'aveugle : une application qui
   * a changé d'interface entre l'enregistrement et le rejeu invaliderait
   * toutes les étapes suivantes, et enchaîner des clics au hasard est
   * exactement ce que `controleEcran.ts` s'interdit déjà pour une commande
   * normale.
   */
  async function rejouer(sequence: SequenceEntrainement): Promise<string> {
    const messages = [phraseDebutRejeu(sequence.nom)]
    let reussi = true
    for (let i = 0; i < sequence.etapes.length; i++) {
      const etape = sequence.etapes[i]
      const resultat = await agirSurEcran(etape.commande, etape.cible ?? undefined)
      if (!resultat.ok) {
        messages.push(phraseEchecRejeu(sequence.nom, i + 1, sequence.etapes.length))
        reussi = false
        break
      }
      if (i === sequence.etapes.length - 1) messages.push(resultat.message)
    }
    void noterResultatRejeu(sequence.id, reussi)
    return messages.join(" ")
  }

  return {
    sequences,
    loading,
    error,
    refresh,
    addSequence,
    renameSequence,
    deleteSequence,
    noterResultatRejeu,
    rejouer,
  }
}
