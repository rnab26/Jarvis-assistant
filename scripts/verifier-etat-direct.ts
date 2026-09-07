/**
 * Ce qu'on dit d'une liste qui devrait se mettre à jour toute seule.
 *
 *   node --experimental-strip-types scripts/verifier-etat-direct.ts
 *
 * Sans réseau, sans navigateur : `src/lib/etatDirect.ts` est pur.
 *
 * LA MOITIÉ DE CES CONTRÔLES VÉRIFIE LE SILENCE, pas l'alerte. Un bandeau
 * orange qui s'allume à chaque ouverture de l'app n'est plus lu du tout le
 * jour où il compte — c'est la panne qu'on ne verra pas. Les cas « ça ne doit
 * RIEN dire » sont donc aussi importants que les autres.
 */
import {
  ageEnClair,
  combinerStatuts,
  etatAffiche,
  type EntreeEtat,
  type StatutDirect,
} from "../src/lib/etatDirect.ts"

let echecs = 0
function verifier(nom: string, ok: boolean, detail = "") {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

const MAINTENANT = 1_757_260_000_000
const base: EntreeEtat = {
  statut: "en_ligne",
  derniereMaj: MAINTENANT - 30_000,
  maintenant: MAINTENANT,
  enCours: false,
  reseau: true,
}
const avec = (p: Partial<EntreeEtat>): EntreeEtat => ({ ...base, ...p })

// ── Le pire l'emporte ────────────────────────────────────────────────────
// L'onglet Tâches suit DEUX canaux (les tâches et les catégories). Si l'un
// des deux est coupé, une partie de l'écran est figée : annoncer « en ligne »
// serait faux, et c'est exactement le genre de mensonge qu'on corrige ici.
{
  const cas: [StatutDirect[], StatutDirect][] = [
    [["en_ligne", "en_ligne"], "en_ligne"],
    [["en_ligne", "coupe"], "coupe"],
    [["connexion", "en_ligne"], "connexion"],
    [["coupe", "connexion"], "coupe"],
    [[], "en_ligne"],
  ]
  for (const [entree, attendu] of cas) {
    verifier(
      `combiner ${JSON.stringify(entree)} → ${attendu}`,
      combinerStatuts(entree) === attendu,
      `obtenu ${combinerStatuts(entree)}`,
    )
  }
}

// ── L'âge en clair ───────────────────────────────────────────────────────
{
  verifier("moins d'une minute : « à l'instant »", ageEnClair(45_000) === "à l'instant")
  verifier("une horloge en retard ne donne pas un âge négatif", ageEnClair(-5_000) === "à l'instant")
  verifier("les minutes", ageEnClair(12 * 60_000) === "il y a 12 min")
  verifier("les heures", ageEnClair(3 * 3_600_000) === "il y a 3 h")
  verifier("hier", ageEnClair(30 * 3_600_000) === "hier")
  verifier("les jours", ageEnClair(3 * 86_400_000) === "il y a 3 jours")
  verifier(
    "jamais à la seconde près",
    !/seconde|\bs\b/.test(ageEnClair(45_000)) && !/seconde/.test(ageEnClair(12 * 60_000)),
    "un compteur qui bouge chaque seconde attire l'œil sur une information inutile",
  )
}

// ── CE QUI NE DOIT RIEN DIRE ─────────────────────────────────────────────
{
  const ok = etatAffiche(base)
  verifier(
    "quand le direct marche, aucune alerte",
    ok.ton === "discret" && ok.actionnable,
    JSON.stringify(ok),
  )
  verifier(
    "et pas d'âge affiché : la liste est juste par construction",
    !/liste chargée|il y a|à l'instant/.test(ok.texte),
    `texte = ${ok.texte} — du bruit permanent pour rassurer sur ce qui va bien`,
  )

  const connexion = etatAffiche(avec({ statut: "connexion" }))
  verifier(
    "« connexion » reste discret : c'est l'état normal de chaque ouverture",
    connexion.ton === "discret",
    `${JSON.stringify(connexion)} — un bandeau orange à chaque ouverture n'est plus lu`,
  )
  verifier(
    "et le bouton reste utilisable pendant la connexion",
    connexion.actionnable,
    "attendre la fin d'une connexion qui n'aboutira peut-être jamais est exactement le blocage signalé",
  )
}

// ── CE QUI DOIT SE VOIR ──────────────────────────────────────────────────
{
  const coupe = etatAffiche(avec({ statut: "coupe", derniereMaj: MAINTENANT - 12 * 60_000 }))
  verifier("une coupure est une alerte", coupe.ton === "alerte", JSON.stringify(coupe))
  verifier(
    "elle dit quoi faire",
    /actualiser|appuie/i.test(coupe.texte) || coupe.actionnable,
    coupe.texte,
  )
  verifier(
    "et elle dit depuis quand la liste peut mentir",
    coupe.texte.includes("il y a 12 min"),
    `texte = ${coupe.texte} — sans l'âge, il ne sait pas si c'est grave`,
  )

  // Le réseau l'emporte : les deux sont vrais dans l'ascenseur, mais
  // « les mises à jour ne passent plus » l'enverrait chercher une panne
  // dans l'app alors que c'est son réseau.
  const horsLigne = etatAffiche(avec({ statut: "coupe", reseau: false }))
  verifier(
    "hors réseau, on dit « hors ligne », pas « mises à jour coupées »",
    /hors ligne/i.test(horsLigne.texte) && !/automatiques/i.test(horsLigne.texte),
    horsLigne.texte,
  )

  // Sa règle : chaque action dit visiblement qu'elle a réussi ou échoué.
  const enCours = etatAffiche(avec({ enCours: true, statut: "coupe", reseau: false }))
  verifier(
    "pendant un rechargement, on le DIT et le bouton se verrouille",
    /actualisation/i.test(enCours.texte) && !enCours.actionnable,
    `${JSON.stringify(enCours)} — un bouton qui ne répond pas se lit comme un bouton mort, et il appuie six fois`,
  )
}

// ── Le tout premier chargement ───────────────────────────────────────────
{
  const jamais = etatAffiche(avec({ derniereMaj: null, statut: "coupe" }))
  verifier(
    "sans aucun chargement réussi, on n'invente pas un âge",
    !/il y a|à l'instant|liste chargée/.test(jamais.texte),
    jamais.texte,
  )
  verifier("mais la coupure se dit quand même", jamais.ton === "alerte", jamais.texte)
}

// ── Le cockpit se tait quand tout va bien ────────────────────────────────
// `BarreActualiser` a un mode « seulement si problème » qui n'affiche RIEN
// tant que le ton est discret. Ce contrôle garde l'invariant dont il dépend :
// tout état sain est discret, tout état qui mérite qu'on prenne 44 points de
// hauteur au tableau des chantiers est une alerte.
{
  const sains: EntreeEtat[] = [base, avec({ statut: "connexion" }), avec({ derniereMaj: null })]
  for (const e of sains) {
    verifier(
      `état sain, ton discret (${e.statut}${e.derniereMaj === null ? ", jamais chargé" : ""})`,
      etatAffiche(e).ton === "discret",
      JSON.stringify(etatAffiche(e)),
    )
  }
  const malades: EntreeEtat[] = [avec({ statut: "coupe" }), avec({ reseau: false })]
  for (const e of malades) {
    verifier(
      `état à signaler, ton alerte (${e.statut}, réseau ${e.reseau})`,
      etatAffiche(e).ton === "alerte",
      JSON.stringify(etatAffiche(e)),
    )
  }
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
