import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style de l'app : sans elle, le contrôle de largeur sur
// un écran de téléphone ne voudrait rien dire.
import "@/index.css"
import { ConversationsRecentes } from "@/components/memoire/ConversationsRecentes"
import type { EchangesApi } from "@/hooks/useEchanges"
import type { Echange } from "@/types/database"

/**
 * Banc d'essai de la mémoire — la VRAIE carte « Vos conversations », montée
 * hors de Supabase avec des échanges factices.
 *
 * Pourquoi une page plutôt que des tests de fonctions : ce qui casse ici ne
 * casse pas dans le calcul. Une corbeille qui efface sans demander, une
 * recherche qui ne trouve rien parce qu'elle bute sur les accents, un état
 * vide qui ne dit pas quoi faire, une carte qui déborde en largeur sur un
 * téléphone — aucun des quatre ne se voit dans une fonction qui renvoie la
 * bonne valeur. Voir scripts/verifier-memoire-web.mjs.
 */

const JOUR = 24 * 3600_000

function echange(id: string, transcript: string, reponse: string | null, ilYAMs: number): Echange {
  return {
    id,
    user_id: "banc",
    transcript,
    reponse,
    created_at: new Date(Date.now() - ilYAMs).toISOString(),
  }
}

const ECHANGES: Echange[] = [
  echange("e1", "On part sur quoi comme matériau pour la villa Dan ?", "Sur du grès cérame, tu me l'as dit lundi.", 3600_000),
  echange("e2", "Rappelle-moi d'appeler le carreleur demain matin.", "C'est noté pour demain 9 h.", 5 * 3600_000),
  echange("e3", "Où est-ce que je réponds aux questions des sessions ?", "Dans le cockpit dev, sous « Envoyer à Claude Code ».", JOUR),
  echange("e4", "Combien il reste de chantiers en cours ?", "Cinquante-quatre, dont neuf en priorité haute.", JOUR + 3600_000),
  echange("e5", "Mets la musique de Brassens sur Spotify.", "Je te l'ouvre.", 2 * JOUR),
]

// De quoi dépasser la première page (20) sans écrire cinquante lignes à la main.
for (let i = 6; i <= 28; i++) {
  ECHANGES.push(echange(`e${i}`, `Échange de remplissage numéro ${i}.`, null, (2 + i) * 3600_000))
}

function bancApi(
  echanges: Echange[],
  setEchanges: (e: Echange[]) => void,
  loading: boolean,
  error: string | null,
): EchangesApi {
  return {
    echanges,
    loading,
    error,
    refresh: async () => {},
    oublier: async (id) => setEchanges(echanges.filter((e) => e.id !== id)),
    toutOublier: async () => setEchanges([]),
  }
}

function Banc() {
  const [echanges, setEchanges] = useState(ECHANGES)
  const [etat, setEtat] = useState<"pret" | "chargement" | "erreur" | "vide">("pret")

  const api = useMemo(
    () =>
      bancApi(
        etat === "vide" ? [] : echanges,
        setEchanges,
        etat === "chargement",
        etat === "erreur" ? "Réseau injoignable (banc d'essai)." : null,
      ),
    [echanges, etat],
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      {/* Les quatre états, pour les voir tous les quatre à l'écran et pas
          seulement dans le code. */}
      <div className="flex flex-wrap gap-2">
        {(["pret", "chargement", "erreur", "vide"] as const).map((e) => (
          <button
            key={e}
            type="button"
            data-etat={e}
            className="rounded border px-2 py-1 text-sm"
            onClick={() => setEtat(e)}
          >
            {e}
          </button>
        ))}
      </div>
      <ConversationsRecentes api={api} />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Banc />)
