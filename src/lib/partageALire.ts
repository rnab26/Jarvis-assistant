// Que faire de ce qu'on vient de partager à Jarvis ?
//
// Chantier 73f06a28. PUR : aucun réseau, aucun React — vérifié hors ligne par
// `scripts/verifier-lire-document.ts`. Import relatif avec extension, parce que
// ce contrôle tourne sous `node --experimental-strip-types`, qui ne connaît pas
// l'alias « @/ » de Vite.
//
// CE QUI EXISTAIT : tout ce qui arrivait par le menu « Partager » d'Android
// était rangé dans Documents, tel quel. Un bail de vingt pages atterrissait
// donc entier, et il fallait le lire soi-même — ce qui revenait à ne rien
// avoir fait.
//
// CE QU'ON NE CHANGE PAS : le chemin de l'aller-retour avec une IA installée
// (`allerRetourIA.ts`) passe AVANT celui-ci et n'est pas touché. Une réponse de
// Perplexity n'est pas un document à résumer, c'est une réponse à ranger sous
// sa question.

/**
 * En dessous, un partage n'a rien à résumer et on le range tel quel.
 *
 * C'est une décision DIFFÉRENTE de `MINIMUM_UTILE` côté serveur, qui dit « a-t-on
 * réussi à extraire du texte de cette page ». Ici la question est « ce qu'il a
 * partagé mérite-t-il un aller-retour au modèle ». Deux seuils voisins, deux
 * raisons distinctes : les confondre en un seul ferait bouger l'un en croyant
 * régler l'autre.
 */
export const MINIMUM_A_RESUMER = 400

export type Partage =
  | { type: "lien"; url: string }
  | { type: "texte"; texte: string }
  | { type: "ranger"; texte: string }

/**
 * Une adresse, éventuellement entourée de texte.
 *
 * Android partage très souvent « Titre de l'article https://… » plutôt qu'une
 * adresse nue : n'accepter que l'adresse seule ferait rater le cas le plus
 * fréquent. On prend donc la première adresse https trouvée.
 */
const ADRESSE = /https:\/\/[^\s<>"']+/i

/**
 * Ce qu'on fait de ce partage.
 *
 * TROIS CAS, et le troisième compte autant que les deux autres : un partage
 * court sans adresse (« penser aux carreaux ») n'a rien à résumer. Le faire
 * passer par le modèle coûterait du quota pour rendre une paraphrase, et le
 * quota est exactement ce qui l'a laissé sans Jarvis deux fois.
 */
export function quoiFaireDuPartage(brut: string): Partage {
  const texte = brut.trim()
  const adresse = texte.match(ADRESSE)?.[0]
  // Une adresse en fin de phrase attrape souvent la ponctuation qui la suit.
  if (adresse) return { type: "lien", url: adresse.replace(/[.,;:)\]]+$/, "") }
  if (texte.length >= MINIMUM_A_RESUMER) return { type: "texte", texte }
  return { type: "ranger", texte }
}

export interface Resume {
  titre: string
  nature: string
  essentiel: string
  points: string[]
  a_faire: string[]
  incertitudes: string[]
}

const NATURE: Record<string, string> = {
  devis: "Devis",
  facture: "Facture",
  contrat: "Contrat",
  compte_rendu: "Compte-rendu",
  article: "Article",
  autre: "Document",
}

/**
 * Le document qu'on range, à partir du résumé.
 *
 * L'ESSENTIEL EN HAUT, LA SOURCE EN BAS. Il ouvre ce document pour se
 * rappeler un montant, pas pour lire une fiche technique : ce qu'il cherche
 * doit être la première chose sous le titre.
 *
 * ET CE QUI N'A PAS PU ÊTRE LU EST ÉCRIT, jamais tu. C'est la règle du 6 sept.
 * — on n'annonce jamais au passé ce qu'on n'a pas constaté. Un résumé qui tait
 * ce qu'il a manqué se lit comme un résumé complet.
 */
export function documentDuResume(r: Resume, source: string | null, tronque: boolean): {
  titre: string
  corps: string
} {
  const morceaux = [r.essentiel.trim()]

  if (r.points.length) {
    morceaux.push(["", "Ce qu'il faut retenir :", ...r.points.map((p) => `• ${p}`)].join("\n"))
  }
  if (r.a_faire.length) {
    morceaux.push(["", "Ce que ça te demande :", ...r.a_faire.map((p) => `• ${p}`)].join("\n"))
  }
  if (r.incertitudes.length) {
    morceaux.push(
      ["", "Ce que je n'ai pas pu lire :", ...r.incertitudes.map((p) => `• ${p}`)].join("\n"),
    )
  }
  if (tronque) {
    morceaux.push("", "Le document était long : je n'en ai lu que le début.")
  }
  if (source) morceaux.push("", `Source : ${source}`)

  return {
    titre: `${NATURE[r.nature] ?? NATURE.autre} — ${r.titre}`,
    corps: morceaux.join("\n"),
  }
}

/**
 * Le document de repli quand la lecture n'a pas abouti.
 *
 * ON GARDE CE QU'IL A PARTAGÉ, TOUJOURS. Échouer à résumer ne doit jamais
 * revenir à perdre ce qu'il nous a donné : c'est exactement ce qui lui est
 * arrivé le 5 sept. avec deux chantiers dictés et jamais enregistrés.
 */
export function documentNonLu(brut: string, pourquoi: string, maintenant: Date): {
  titre: string
  corps: string
} {
  return {
    titre: `Partagé le ${maintenant.toLocaleDateString("fr-FR")}`,
    corps: [`Je n'ai pas pu en sortir l'essentiel : ${pourquoi}`, "", brut].join("\n"),
  }
}
