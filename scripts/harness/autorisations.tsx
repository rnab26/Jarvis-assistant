import { useState } from "react"
import { createRoot } from "react-dom/client"
// La vraie feuille de style : sans elle, le contrôle de largeur sur un écran
// de téléphone ne voudrait rien dire.
import "@/index.css"
import { ListeAutorisations } from "@/components/settings/Autorisations"
import { AUTORISATIONS, type CleAutorisation, type EtatAutorisation } from "@/lib/autorisationsTelephone"

/**
 * Banc d'essai de l'écran des autorisations.
 *
 * Pourquoi une page plutôt que des tests de fonctions : verifier-autorisations.ts
 * couvre déjà le calcul (que demander, quel bouton). Ce qui casse ici casse à
 * L'ÉCRAN — un bouton « Autoriser » affiché sur une ligne qu'Android ne
 * redemandera jamais, une ligne qui n'explique pas pourquoi elle n'a pas de
 * bouton, une carte qui déborde en largeur sur un téléphone, un écran vide
 * quand le plugin manque. Aucun des quatre ne se voit dans une fonction qui
 * renvoie la bonne valeur.
 *
 * Les états sont fabriqués exprès : le refus définitif, l'état illisible et
 * l'APK trop ancienne ne se produisent pas sur cette machine, et ce sont
 * justement les cas où l'écran doit encore dire quelque chose d'utile.
 */

const tous = (accordee: boolean): EtatAutorisation[] =>
  AUTORISATIONS.map((a) => ({ cle: a.cle, accordee, bloquee: false, connue: true }))

function Cas({ titre, id, children }: { titre: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2 border-t pt-4">
      <h2 className="text-sm font-semibold text-muted-foreground">{titre}</h2>
      {children}
    </section>
  )
}

function BancAutorisations() {
  // Le cas vivant : on part d'un téléphone neuf, et un appui sur « Autoriser »
  // accorde vraiment — c'est ce qui prouve que le bouton est branché.
  const [etats, setEtats] = useState<EtatAutorisation[]>(tous(false))
  const accorder = (cles: CleAutorisation[]) =>
    setEtats((avant) =>
      avant.map((e) => (cles.includes(e.cle) ? { ...e, accordee: true } : e)),
    )

  const avecBlocage = tous(false).map((e) =>
    e.cle === "micro" ? { ...e, bloquee: true } : e.cle === "assistant" ? { ...e, connue: false } : e,
  )

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <Cas titre="Téléphone neuf, boutons branchés" id="cas-neuf">
        <ListeAutorisations
          etats={etats}
          chargement={false}
          erreur={null}
          disponible
          enCours={null}
          onDemander={accorder}
          onOuvrirReglages={() => {}}
        />
      </Cas>

      <Cas titre="Micro refusé pour de bon, assistant illisible" id="cas-bloque">
        <ListeAutorisations
          etats={avecBlocage}
          chargement={false}
          erreur={null}
          disponible
          enCours={null}
          onDemander={() => {}}
          onOuvrirReglages={() => {}}
        />
      </Cas>

      <Cas titre="Tout accordé" id="cas-tout">
        <ListeAutorisations
          etats={tous(true)}
          chargement={false}
          erreur={null}
          disponible
          enCours={null}
          onDemander={() => {}}
          onOuvrirReglages={() => {}}
        />
      </Cas>

      <Cas titre="Hors de l'app (web, ou APK sans le plugin)" id="cas-absent">
        <ListeAutorisations
          etats={[]}
          chargement={false}
          erreur={null}
          disponible={false}
          enCours={null}
          onDemander={() => {}}
          onOuvrirReglages={() => {}}
        />
      </Cas>

      <Cas titre="La lecture a échoué" id="cas-erreur">
        <ListeAutorisations
          etats={[]}
          chargement={false}
          erreur="La demande d'autorisation n'a pas abouti."
          disponible
          enCours={null}
          onDemander={() => {}}
          onOuvrirReglages={() => {}}
          onReessayer={() => {}}
        />
      </Cas>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<BancAutorisations />)
