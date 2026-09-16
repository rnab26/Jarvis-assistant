import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { JarvisDataContext } from "@/contexts/JarvisDataContext"
import { DocumentsPage } from "@/pages/DocumentsPage"
import { cleStockage, ligneDeDocument } from "@/lib/nomDocument"
import type { DocumentFile } from "@/types/database"

/**
 * Banc d'essai de l'onglet Docs. Monte la VRAIE `DocumentsPage` — pas une
 * copie — avec un `documentsState` fabriqué, à travers le contexte exporté.
 *
 * CE QU'IL VÉRIFIE ET QU'AUCUN CONTRÔLE PUR NE PEUT VOIR : un nom hébreu est
 * écrit de droite à gauche. Mêlé à des chiffres et à une extension latine, il
 * passe par l'algorithme bidirectionnel du navigateur, dans une ligne en
 * `truncate` à côté de deux boutons. Le module pur prouve que le nom revient
 * intact ; seul un vrai moteur de rendu dit s'il TIENT sur son écran.
 *
 * `?echec=1` rejoue l'import raté de sa capture du 15 sept. 2026, pour voir ce
 * qu'il lit à la place de « Invalid key: … ».
 */

const UTILISATEUR = "8bb3be37-6704-4467-948c-48427e4feff7"

/** Son fichier, copié de sa capture au caractère près. */
const LE_SIEN = "טופס 18 פופי יוגה 162437_260915_בעמ.pdf"

function doc(nom: string, size: number, createdAt: string): DocumentFile {
  // LA MÊME fonction que `useDocuments.refresh()`, pas une copie : c'est ce
  // qui fait que casser la conversion dans le hook fait rougir ce banc.
  return ligneDeDocument(UTILISATEUR, cleStockage(nom), size, createdAt, null)
}

const DOCUMENTS: DocumentFile[] = [
  doc(LE_SIEN, 284_512, "2026-09-15T16:24:00Z"),
  doc("facture été — reçu d'acompte.pdf", 91_204, "2026-09-14T09:10:00Z"),
  doc("contrat-villa-dan_2026.pdf", 1_204_880, "2026-09-12T18:02:00Z"),
]

function Banc() {
  const parametres = new URLSearchParams(window.location.search)
  const echec = parametres.get("echec") === "1"
  const [documents, setDocuments] = useState<DocumentFile[]>(DOCUMENTS)

  const documentsState = {
    documents,
    loading: false,
    error: null,
    refresh: async () => {},
    uploadFile: async () => {
      // Le message brut que Storage rendait, mot pour mot.
      if (echec) throw new Error(`Invalid key: ${UTILISATEUR}/${LE_SIEN}`)
    },
    saveTextDocument: async () => {},
    saveBinaryDocument: async () => {},
    getDownloadUrl: async () => "https://exemple.invalid/x",
    deleteDocument: async (chemin: string) => {
      setDocuments((liste) => liste.filter((d) => d.path !== chemin))
    },
  }

  return (
    <JarvisDataContext.Provider
      value={{ documentsState } as unknown as React.ContextType<typeof JarvisDataContext>}
    >
      <div className="mx-auto max-w-md p-4">
        <DocumentsPage />
      </div>
    </JarvisDataContext.Provider>
  )
}

createRoot(document.getElementById("root")!).render(<Banc />)
