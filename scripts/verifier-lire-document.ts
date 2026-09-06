/**
 * Vérifie ce que Jarvis lit d'une page — et ce qu'il refuse de résumer.
 *
 *   node --experimental-strip-types scripts/verifier-lire-document.ts
 *
 * Aucun réseau. Ce qui rate ici rate EN SILENCE : d'une page dont on n'aurait
 * gardé que le menu de navigation, le modèle sortirait un résumé parfaitement
 * plausible et faux, et rien nulle part ne le signalerait. C'est la raison
 * d'être de `assezDeTexte()`, et la moitié de ces contrôles porte dessus.
 *
 * L'autre moitié garde le garde-fou SSRF, qui est maintenant PARTAGÉ entre les
 * reçus de Gmail et ce chemin-ci. Le casser ici le casserait pour les deux.
 */
import {
  MAX_CARACTERES,
  MINIMUM_UTILE,
  assezDeTexte,
  decoderEntites,
  lirePage,
  texteDeLaPage,
  titreDeLaPage,
  typeNu,
} from "../supabase/functions/_shared/pageTexte.ts"
import { lienAutorise, recupererRessource } from "../supabase/functions/_shared/lienSur.ts"
import {
  MINIMUM_A_RESUMER,
  documentDuResume,
  documentNonLu,
  quoiFaireDuPartage,
  type Resume,
} from "../src/lib/partageALire.ts"

let echecs = 0
const verifier = (nom: string, ok: boolean, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK  " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}

// ── Ce qu'on garde d'une page, et ce qu'on jette ───────────────────────────
{
  const page = `<!doctype html><html><head><title>Devis n°412 &mdash; Dupont</title>
    <style>.x{color:red}</style><script>var a = "Cliquez ici pour vous abonner"</script></head>
    <body>
      <nav><a href="/">Accueil</a><a href="/tarifs">Tarifs</a><a href="/contact">Contact</a></nav>
      <main>
        <h1>Devis n&deg;412</h1>
        <p>Pose de carrelage, villa Dan.</p>
        <table><tr><td>Main d&rsquo;&oelig;uvre</td><td>2&nbsp;400 &euro;</td></tr>
        <tr><td>Fournitures</td><td>1&nbsp;800 &euro;</td></tr></table>
        <p>Validit&eacute; : 30 jours.</p>
      </main>
      <footer>Mentions l&eacute;gales &mdash; tous droits r&eacute;serv&eacute;s</footer>
    </body></html>`

  const t = texteDeLaPage(page)
  verifier("le contenu principal est gardé", t.includes("Pose de carrelage"))
  verifier(
    "les montants sont gardés TELS QUELS",
    t.includes("2 400 €") && t.includes("1 800 €"),
    `${JSON.stringify(t.slice(0, 200))} — un montant perdu rend le résumé inutilisable sans qu'il puisse le savoir`,
  )
  verifier(
    "les cellules d'un tableau ne se recollent pas en une phrase",
    !/œuvre\s*2 400/.test(t),
    `${t} — un libellé soudé à son montant fait lire n'importe quoi`,
  )
  verifier("le JavaScript n'est pas pris pour du texte", !t.includes("Cliquez ici pour vous abonner"))
  verifier("le CSS non plus", !t.includes("color:red"))
  verifier(
    "le menu et le pied de page sont écartés",
    !t.includes("Accueil") && !t.includes("Mentions"),
    t,
  )
  verifier("aucune balise ne survit", !/[<>]/.test(t), t)

  verifier("le titre est lu et décodé", titreDeLaPage(page) === "Devis n°412 — Dupont")
  verifier("une page sans titre le dit", titreDeLaPage("<html><body>x</body></html>") === null)
}

// ── Les entités, parce qu'un « é » cassé se lit partout ────────────────────
{
  verifier(
    "les entités nommées sont décodées",
    decoderEntites("R&eacute;serv&eacute; &agrave; 1&nbsp;200&euro;") === "Réservé à 1 200€",
    decoderEntites("R&eacute;serv&eacute; &agrave; 1&nbsp;200&euro;"),
  )
  verifier(
    "les entités numériques aussi, décimales et hexadécimales",
    decoderEntites("&#233;t&#xe9;") === "été",
    decoderEntites("&#233;t&#xe9;"),
  )
  verifier(
    "une entité inconnue est laissée telle quelle plutôt que supprimée",
    decoderEntites("&zzz; fin") === "&zzz; fin",
    "supprimer ce qu'on ne comprend pas ferait disparaître du texte en silence",
  )
}

// ── Le SILENCE : quand il ne faut PAS résumer ──────────────────────────────
{
  // Le cas réel : une page rendue en JavaScript. Le HTML servi ne contient
  // qu'une coquille, et tout le contenu arrive plus tard dans le navigateur.
  const coquille =
    `<html><head><title>Mon espace client</title></head><body><div id="root"></div>` +
    `<script>window.__DATA__={}</script></body></html>`
  const t = texteDeLaPage(coquille)
  verifier(
    "une page rendue en JavaScript ne donne presque rien",
    !assezDeTexte(t),
    `${t.length} caractères — il faut le DIRE, pas résumer une coquille`,
  )

  const menuSeul = `<html><body><nav>Accueil Tarifs Contact Connexion Aide</nav><div>Connectez-vous</div></body></html>`
  verifier(
    "un mur de connexion non plus",
    !assezDeTexte(texteDeLaPage(menuSeul)),
    texteDeLaPage(menuSeul),
  )

  verifier(
    "mais une vraie page passe",
    assezDeTexte("Le bail est conclu pour une durée de trois ans. ".repeat(6)),
  )
  verifier("le seuil reste bas : on ne refuse pas un vrai texte court", MINIMUM_UTILE <= 300)
}

// ── La troncature : dite, jamais silencieuse ───────────────────────────────
{
  const longue = `<html><body><p>${"Clause de garantie décennale. ".repeat(3000)}</p></body></html>`
  const p = lirePage(longue)
  verifier("une page trop longue est coupée", p.texte.length === MAX_CARACTERES)
  verifier(
    "et la coupe est SIGNALÉE, pour que le modèle le dise",
    p.tronquee,
    "un résumé bâti sur la moitié d'un contrat, présenté comme complet, est pire que pas de résumé",
  )
  verifier("une page courte n'est pas marquée tronquée", !lirePage("<p>Trois mots ici.</p>").tronquee)
  verifier(
    "le plafond laisse de la place à la consigne et au schéma d'outil",
    MAX_CARACTERES <= 60_000,
    "chaque appel envoie déjà ~44 000 caractères : au-delà, Jarvis répond « j'ai atteint la limite »",
  )
}

// ── Le type de contenu ─────────────────────────────────────────────────────
{
  verifier("le charset ne trouble pas la lecture du type", typeNu("text/html; charset=UTF-8") === "text/html")
  verifier("un type absent ne casse rien", typeNu(null) === "")
}

// ── Le garde-fou SSRF, maintenant PARTAGÉ ──────────────────────────────────
{
  verifier("une adresse publique en https passe", lienAutorise("https://exemple.fr/devis").ok)
  verifier("http en clair est refusé", !lienAutorise("http://exemple.fr/devis").ok)
  verifier(
    "les adresses internes sont refusées",
    ["https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.1/x", "https://192.168.1.1/x",
      "https://172.16.0.1/x", "https://[::1]/x", "https://truc.internal/x"]
      .every((u) => !lienAutorise(u).ok),
  )
  verifier(
    "169.254.169.254 — les métadonnées de l'hébergeur — est refusée",
    !lienAutorise("https://169.254.169.254/computeMetadata/v1/").ok,
  )
  verifier(
    "un autre protocole est refusé",
    !lienAutorise("file:///etc/passwd").ok && !lienAutorise("data:text/html,x").ok,
  )

  // LE CONTRÔLE QUI COMPTE LE PLUS : une adresse publique qui redirige vers
  // l'intérieur. Sans revalidation à chaque saut, le garde-fou d'entrée ne
  // servirait strictement à rien.
  const redirigeVersInterne = (async () =>
    new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })) as typeof fetch
  let refusee = false
  try {
    await recupererRessource("https://exemple.fr/facture", {
      accepte: () => true,
      refusDeType: "x",
      fetch: redirigeVersInterne,
    })
  } catch {
    refusee = true
  }
  verifier(
    "une redirection vers une adresse interne est refusée elle aussi",
    refusee,
    "c'est le contournement classique : le premier saut est public, le second ne l'est pas",
  )

  // Le type non désiré est refusé AVANT d'être chargé en mémoire.
  const zip = (async () =>
    new Response("PK", { status: 200, headers: { "content-type": "application/zip" } })) as typeof fetch
  let refusType = ""
  try {
    await recupererRessource("https://exemple.fr/truc.zip", {
      accepte: (t) => t === "text/html",
      refusDeType: "Je ne sais pas lire ce type de fichier.",
      fetch: zip,
    })
  } catch (e) {
    refusType = String(e instanceof Error ? e.message : e)
  }
  verifier(
    "un type non désiré est refusé, avec le message de l'appelant",
    refusType.includes("Je ne sais pas lire ce type"),
    `${refusType} — le message dépend du chemin : un reçu et une page à résumer n'ont pas la même bonne réponse`,
  )

  const gros = (async () =>
    new Response("x", { status: 200, headers: { "content-type": "text/html", "content-length": "99999999" } })) as typeof fetch
  let refusTaille = false
  try {
    await recupererRessource("https://exemple.fr/gros", {
      accepte: () => true, refusDeType: "x", fetch: gros,
    })
  } catch {
    refusTaille = true
  }
  verifier("un document trop gros est refusé avant d'être chargé", refusTaille)
}

// ── Ce qu'on fait d'un partage, et ce qu'on ne fait pas ───────────────────
{
  verifier(
    "une adresse NUE est reconnue",
    quoiFaireDuPartage("https://fournisseur.fr/devis/412").type === "lien",
  )
  const androidStyle = quoiFaireDuPartage("Devis n°412 — Dupont https://fournisseur.fr/d/412 partagé via Chrome")
  verifier(
    "une adresse NOYÉE dans du texte aussi : c'est le cas le plus fréquent",
    androidStyle.type === "lien" && androidStyle.url === "https://fournisseur.fr/d/412",
    JSON.stringify(androidStyle),
  )
  const ponctuee = quoiFaireDuPartage("Regarde ça : https://exemple.fr/page.")
  verifier(
    "la ponctuation de fin de phrase n'entre pas dans l'adresse",
    ponctuee.type === "lien" && ponctuee.url === "https://exemple.fr/page",
    JSON.stringify(ponctuee),
  )

  verifier(
    "un texte long part au résumé",
    quoiFaireDuPartage("Le bail est conclu pour trois ans. ".repeat(20)).type === "texte",
  )
  verifier(
    "UN PARTAGE COURT EST SIMPLEMENT RANGÉ : pas d'aller-retour au modèle",
    quoiFaireDuPartage("penser aux carreaux").type === "ranger",
    "le quota est exactement ce qui l'a laissé sans Jarvis deux fois",
  )
  verifier("le seuil reste modeste", MINIMUM_A_RESUMER <= 600)
}

// ── Le document qu'il retrouvera dans la liste ────────────────────────────
{
  const r: Resume = {
    titre: "Devis carrelage Villa Dan, 5 675,09 €",
    nature: "devis",
    essentiel: "Pose de carrelage à la Villa Dan pour 5 675,09 € TTC.",
    points: ["Total TTC : 5 675,09 €", "Acompte : 1 702,53 €"],
    a_faire: ["Verser l'acompte à la commande."],
    incertitudes: [],
  }
  const d = documentDuResume(r, "https://fournisseur.fr/d/412", false)
  verifier(
    "le titre dit de quoi il s'agit dans une liste",
    d.titre === "Devis — Devis carrelage Villa Dan, 5 675,09 €",
    d.titre,
  )
  verifier(
    "L'ESSENTIEL EST LA PREMIÈRE LIGNE",
    d.corps.startsWith("Pose de carrelage"),
    "il ouvre ce document pour retrouver un montant, pas pour lire une fiche",
  )
  verifier("les montants y sont", d.corps.includes("5 675,09 €") && d.corps.includes("1 702,53 €"))
  verifier("ce que ça l'engage à faire est séparé", d.corps.includes("Ce que ça te demande"))
  verifier("la source est en bas", d.corps.trimEnd().endsWith("https://fournisseur.fr/d/412"))
  verifier(
    "une rubrique vide ne laisse pas de titre orphelin",
    !d.corps.includes("Ce que je n'ai pas pu lire"),
    d.corps,
  )

  const incomplet = documentDuResume({ ...r, incertitudes: ["Le tableau page 3 est illisible."] }, null, true)
  verifier(
    "CE QUI N'A PAS PU ÊTRE LU EST ÉCRIT, jamais tu",
    incomplet.corps.includes("Le tableau page 3 est illisible."),
    "un résumé qui tait ce qu'il a manqué se lit comme un résumé complet",
  )
  verifier(
    "et une lecture tronquée le dit aussi",
    incomplet.corps.includes("je n'en ai lu que le début"),
    incomplet.corps,
  )
  verifier("sans source, aucune ligne « Source » vide", !incomplet.corps.includes("Source :"))
}

// ── L'échec ne fait jamais perdre ce qu'il a partagé ──────────────────────
{
  const d = documentNonLu("le texte original qu'il nous a donné", "la page demande de se connecter", new Date("2026-09-06T10:00:00Z"))
  verifier(
    "le contenu partagé est gardé EN ENTIER",
    d.corps.includes("le texte original qu'il nous a donné"),
    "échouer à résumer ne doit jamais revenir à perdre ce qu'il nous a donné",
  )
  verifier("et la raison de l'échec est dite", d.corps.includes("la page demande de se connecter"))
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
