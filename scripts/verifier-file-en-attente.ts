/**
 * Ce qu'il dicte sans réseau ne se perd pas — et ne se dédouble pas.
 *
 * Hors réseau, sans React, sans Supabase : tout ce qui est vérifié ici peut
 * être FAUX EN SILENCE dans l'app. Un renvoi qui crée un doublon ne lève
 * aucune exception ; une file qui grossit sans fin ne se voit qu'au moment où
 * elle emporte tout ; un abandon silencieux ressemble exactement à un envoi
 * réussi.
 *
 * LA MOITIÉ DES CONTRÔLES VÉRIFIE UN SILENCE OU UN REFUS, comme pour le
 * contrôle de l'écran : ne rien dire quand il n'y a rien en attente, ne pas
 * renvoyer un élément bloqué tout seul, ne jamais annoncer au passé.
 */
import {
  aRenvoyer,
  attenteAvantRenvoi,
  estBloque,
  ESSAIS_MAX,
  FILE_MAX,
  lireFile,
  mettreEnFile,
  noterEchec,
  phraseHorsLigne,
  relancer,
  resumerFile,
  retirerDeLaFile,
  serialiserFile,
  type ElementEnAttente,
} from "../src/lib/fileEnAttente.ts"

let vert = 0
let rouge = 0

function verifier(quoi: string, ok: boolean, pourquoi?: string) {
  if (ok) {
    vert++
    console.log(`OK    ${quoi}`)
  } else {
    rouge++
    console.log(`ÉCHEC ${quoi}${pourquoi ? `\n      ${pourquoi}` : ""}`)
  }
}

function elt(id: string, creeA: number, libelle = `tâche ${id}`): ElementEnAttente {
  return {
    id,
    cible: "tasks",
    contenu: { title: libelle },
    libelle,
    creeA,
    essais: 0,
    dernierEchec: null,
    dernierEssaiA: null,
  }
}

const T = 1_000_000

// ── Ne rien perdre ─────────────────────────────────────────────────────────

{
  const file = mettreEnFile([], elt("a", T))
  verifier("une écriture ratée est gardée", file.length === 1 && file[0].id === "a")
}

{
  // Le cas réel : il dicte deux tâches dans un tunnel.
  let file = mettreEnFile([], elt("a", T))
  file = mettreEnFile(file, elt("b", T + 1000))
  const ordre = aRenvoyer(file, T + 60_000).map((e) => e.id)
  verifier(
    "elles repartent dans l'ordre où il les a dites",
    ordre.join(",") === "a,b",
    `ordre obtenu : ${ordre.join(",")}`,
  )
}

// ── Ne pas dédoubler : c'est le défaut qui coûte le plus cher ──────────────

{
  // Le cas qui arrive vraiment : l'appelant remet la même écriture en file
  // pendant qu'elle y est déjà. Une file indexée sur autre chose que l'id de
  // la ligne créerait ici un second exemplaire.
  let file = mettreEnFile([], elt("a", T, "acheter du pain"))
  file = mettreEnFile(file, elt("a", T, "acheter du pain"))
  verifier(
    "remettre la MÊME écriture en file ne la dédouble pas",
    file.length === 1,
    `${file.length} éléments au lieu d'un`,
  )
}

{
  // Deux dictées différentes qui se ressemblent ne doivent PAS fusionner :
  // « rappelle-moi d'appeler Dan » deux fois de suite, c'est deux rappels.
  let file = mettreEnFile([], elt("a", T, "appeler Dan"))
  file = mettreEnFile(file, elt("b", T + 5, "appeler Dan"))
  verifier(
    "deux dictées distinctes restent deux, même avec le même texte",
    file.length === 2,
    "l'identité vient de l'id de la ligne, pas du contenu",
  )
}

// ── Réessayer sans vider la batterie ───────────────────────────────────────

{
  const file = noterEchec(mettreEnFile([], elt("a", T)), "a", "réseau coupé", T)
  verifier("un échec est noté avec sa raison", file[0].essais === 1 && file[0].dernierEchec === "réseau coupé")
  verifier(
    "et on ne le renvoie pas dans la seconde",
    aRenvoyer(file, T + 1000).length === 0,
    "réessayer toutes les secondes dans un tunnel ne fait pas revenir le réseau",
  )
  verifier(
    "on le renvoie une fois l'attente passée",
    aRenvoyer(file, T + attenteAvantRenvoi(1) + 1).length === 1,
  )
}

{
  verifier(
    "l'attente double à chaque échec",
    attenteAvantRenvoi(2) === attenteAvantRenvoi(1) * 2 &&
      attenteAvantRenvoi(3) === attenteAvantRenvoi(1) * 4,
  )
}

// ── Abandonner ne veut PAS dire jeter ──────────────────────────────────────

{
  let file = mettreEnFile([], elt("a", T))
  for (let i = 0; i < ESSAIS_MAX; i++) file = noterEchec(file, "a", "réseau coupé", T + i)
  // L'ORDRE DE CES DEUX-LÀ COMPTE. Un code qui JETTERAIT l'élément épuisé fait
  // planter `file[0]` avant d'avoir rien vérifié, et un plantage se lit moins
  // bien qu'un échec nommé. On établit d'abord qu'il est encore là.
  verifier(
    "il est TOUJOURS LÀ : on ne jette rien",
    file.length === 1,
    "ce serait exactement la perte qu'on cherche à éviter",
  )
  verifier("au-delà de la limite, l'élément est marqué bloqué", file.length === 1 && estBloque(file[0]))
  verifier(
    "et on ne le renvoie plus tout seul",
    aRenvoyer(file, T + 10 ** 9).length === 0,
    "insister indéfiniment sur un droit refusé vide la batterie sans rien dire",
  )
  const relance = relancer(file, "a")
  verifier(
    "un geste de sa part le remet dans la course",
    !estBloque(relance[0]) && aRenvoyer(relance, T).length === 1,
  )
}

// ── Une file qui ne grossit pas sans fin ───────────────────────────────────

{
  let file: ElementEnAttente[] = []
  for (let i = 0; i < FILE_MAX + 10; i++) file = mettreEnFile(file, elt(`e${i}`, T + i))
  verifier("la file est plafonnée", file.length === FILE_MAX)
  verifier(
    "et ce sont les PLUS RÉCENTS qu'elle garde",
    file[file.length - 1].id === `e${FILE_MAX + 9}`,
    "couper par la fin jetterait ce qu'il vient de dire",
  )
}

// ── Ce qu'on lui dit, et ce qu'on ne lui dit pas ───────────────────────────

{
  const vide = resumerFile([])
  verifier(
    "rien en attente : on ne dit RIEN",
    vide.phrase === null,
    "un bandeau « 0 en attente » use le signal qui doit servir le jour où il y a quelque chose",
  )
}

{
  const un = resumerFile([elt("a", T)])
  verifier("une chose en attente : il le voit", un.phrase !== null && un.total === 1)
  {
    // LE CONTRÔLE QUI COMPTE LE PLUS. Chercher le mot « enregistré » ne veut
    // rien dire : « pas encore enregistrée » est précisément la phrase
    // HONNÊTE. Ce qu'on refuse, c'est l'AFFIRMATION — et toute mention de
    // l'enregistrement doit porter sa négation.
    const p = un.phrase ?? ""
    const affirmeAuPasse = /\b(c'est|est|sont|a été|ont été|j'ai|bien)\s+(bien\s+)?enregistr/i.test(p)
    const mentionNiee = !/enregistr/i.test(p) || /pas encore|n'(a|ont) pas|jamais/i.test(p)
    verifier(
      "et la phrase ne dit JAMAIS que c'est enregistré",
      !affirmeAuPasse && mentionNiee,
      `phrase : ${p}`,
    )
  }
  verifier(
    "elle dit qu'il reste quelque chose à faire",
    /dès que tu as du réseau/.test(un.phrase ?? ""),
  )
}

{
  let file = mettreEnFile([], elt("a", T))
  for (let i = 0; i < ESSAIS_MAX; i++) file = noterEchec(file, "a", "refusé", T + i)
  const bloque = resumerFile(file)
  verifier(
    "un blocage ne se lit pas comme une simple attente",
    bloque.bloques === 1 && /réessayer/i.test(bloque.phrase ?? ""),
    `phrase : ${bloque.phrase}`,
  )
}

{
  const dit = phraseHorsLigne("acheter du pain")
  verifier(
    "à l'oral non plus, rien n'est annoncé au passé",
    /je l'ai notée/i.test(dit) && /dès que tu as du réseau/i.test(dit),
    `phrase : ${dit}`,
  )
  verifier(
    "et elle NOMME ce qui a été noté",
    dit.includes("acheter du pain"),
    "sans le nommer, il ne peut pas repérer une commande mal entendue",
  )
  verifier(
    "elle ne prétend pas que c'est enregistré",
    !/(est|c'est) enregistrée?\b/i.test(dit),
    `phrase : ${dit}`,
  )
}

// ── Le tampon entre deux ouvertures de l'app ───────────────────────────────

{
  const file = mettreEnFile([], elt("a", T, "acheter du pain"))
  const relu = lireFile(serialiserFile(file))
  verifier(
    "ce qu'il a dicté survit à la fermeture de l'app",
    relu?.length === 1 && relu[0].libelle === "acheter du pain",
    "une file en mémoire ne sert à rien pour le cas qui nous occupe",
  )
}

{
  verifier("aucun tampon encore écrit : la file est vide, pas en panne", lireFile(null)?.length === 0)
  verifier(
    "un tampon ILLISIBLE ne se lit pas comme une file vide",
    lireFile("{ceci n'est pas du json") === null,
    "dire « rien en attente » quand on n'a pas pu lire, c'est la perte qu'on veut éviter",
  )
  verifier(
    "et il ne fait pas tomber l'app",
    lireFile('{"pas":"un tableau"}') === null,
  )
}

{
  // L'app tuée en pleine écriture peut laisser une ligne incomplète. Elle ne
  // doit pas emporter les autres.
  const brut = JSON.stringify([{ id: "a", creeA: 1, libelle: "ok" }, { casse: true }])
  verifier(
    "une ligne abîmée n'emporte pas celles qui se lisent",
    lireFile(brut)?.length === 1,
  )
}

{
  const file = mettreEnFile([], elt("a", T))
  verifier("un envoi réussi sort de la file", retirerDeLaFile(file, "a").length === 0)
}

console.log(`\n${vert} vert, ${rouge} rouge`)
if (rouge > 0) process.exit(1)
console.log("Tout est vert.")
