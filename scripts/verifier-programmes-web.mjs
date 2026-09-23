/**
 * Vérifie l'écran « Programmé » dans un vrai navigateur, sur un écran de
 * téléphone.
 *
 *   node scripts/verifier-programmes-web.mjs
 *
 * Aucune base : le banc (`scripts/harness/programmes.tsx`) monte la VRAIE
 * `ProgrammesPage` avec un état fabriqué et un faux répertoire.
 *
 * CE QUI EST EN JEU (chantier 0c0193e3, sa demande du 18 sept. 2026) : voir
 * TOUT ce qui est programmé, triée par heure, statut visible ; modifier à la
 * main l'heure, le contenu, le destinataire ; annuler AVEC confirmation ; et
 * les états vide/chargement/erreur. Cet écran affiche et modifie les
 * données, il n'exécute rien — ne pas vérifier ici un quelconque envoi.
 *
 * Et depuis le 23 sept. (chantier a122a936, « que le contact programmé soit
 * visible et garanti ») : à qui il partira — vérifié avec son numéro, « à
 * vérifier », ou manquant —, le choix du contact dans le répertoire quand
 * deux personnes répondent au même nom, et « Pas parti » pour un message dont
 * l'heure est passée sans qu'il parte (celui du 22 sept., resté « Prévu »).
 */
import { spawn } from "node:child_process"

const PORT = 5215
const BASE = `http://127.0.0.1:${PORT}`

async function chargerChromium() {
  for (const chemin of ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"]) {
    try {
      const mod = await import(chemin)
      const chromium = mod.chromium ?? mod.default?.chromium
      if (chromium) return chromium
    } catch {
      // chemin suivant
    }
  }
  throw new Error("Playwright introuvable (npm i -D playwright, ou installation globale).")
}

async function attendreServeur(essais = 80) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(`${BASE}/scripts/harness/programmes.html`)
      if (r.ok) return
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("Le serveur de dev n'a pas démarré.")
}

const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  stdio: "ignore",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://banc-d-essai.invalid",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "banc-d-essai",
  },
})

let echecs = 0
const verifier = (nom, ok, detail = "") => {
  if (!ok) echecs++
  console.log(`${ok ? "OK   " : "ÉCHEC"} ${nom}${ok ? "" : `\n      ${detail}`}`)
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

let navigateur
try {
  await attendreServeur()
  const chromium = await chargerChromium()
  try {
    navigateur = await chromium.launch()
  } catch {
    navigateur = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    })
  }
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE:", e.message)
  })
  await page.goto(`${BASE}/scripts/harness/programmes.html`)
  await page.waitForSelector("text=Dylan (client de Mélissa)")

  const carte = (texte) => page.locator("#liste > div").filter({ hasText: texte })

  // ── Voir : liste triée par heure prévue, statut visible ──
  verifier(
    "les quatre messages du banc s'affichent",
    await page.getByText("Dylan (client de Mélissa)").isVisible() &&
      await page.getByText("Dan Marciano").isVisible() &&
      await page.getByText("Bien arrivé.").isVisible() &&
      await page.getByText("Commande annulée finalement.").isVisible(),
  )
  verifier(
    "triés par heure prévue, le plus ancien (annulé, il y a une semaine) est en tête",
    (await page.locator("#liste > div").first().getByText("Fournisseur carreaux").isVisible()) &&
      (await page.locator("#liste > div").last().getByText("Dan Marciano").isVisible()),
  )
  verifier(
    "chaque statut a son étiquette : Prévu, Annoncé, Envoyé, Annulé",
    await carte("Dylan").getByText("Prévu", { exact: true }).isVisible() &&
      await carte("Dan Marciano").getByText("Annoncé", { exact: true }).isVisible() &&
      await carte("Mel").getByText("Envoyé", { exact: true }).isVisible() &&
      await carte("Fournisseur").getByText("Annulé", { exact: true }).isVisible(),
  )
  verifier(
    "le canal se voit sans ouvrir",
    await page.getByText(/WhatsApp/).first().isVisible() &&
      await page.getByText("canal pas encore choisi").isVisible(),
  )

  // ── À qui il partira : visible sans ouvrir (chantier a122a936) ──
  verifier(
    "un contact vérifié se lit avec son numéro, sans alerte",
    await carte("Dan Marciano").getByText("+972 50-123-4567").isVisible() &&
      (await carte("Dan Marciano").locator(".destinataire-alerte").count()) === 0,
  )
  verifier(
    "le numéro vérifié s'affiche ENTIER, jamais coupé en « … » (c'est lui la garantie)",
    await carte("Dan Marciano")
      .getByText("(+972 50-123-4567)")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= 390),
  )
  verifier(
    "un contact pas vérifié porte « Contact à vérifier »",
    await carte("tu ne m'as toujours pas").getByText("Contact à vérifier").isVisible(),
  )
  verifier(
    "« ce contact » (le cas du 22 sept.) se lit « Destinataire manquant », jamais comme un nom",
    await carte("dès que possible").getByText("Destinataire manquant").isVisible() &&
      (await carte("dès que possible").getByText(/À ce contact/).count()) === 0,
  )
  verifier(
    "un message resté « prévu » après son heure dit « Pas parti », pas « Prévu »",
    await carte("dès que possible").getByText("Pas parti — heure passée").isVisible() &&
      (await carte("dès que possible").getByText("Prévu", { exact: true }).count()) === 0,
  )
  verifier(
    "un message parti ou annulé ne porte aucune alerte de destinataire",
    (await carte("Bien arrivé.").locator(".destinataire-alerte").count()) === 0 &&
      (await carte("Commande annulée").locator(".destinataire-alerte").count()) === 0,
  )

  // ── Deux « Harry » dans le répertoire : il touche le bon ──
  await carte("tu ne m'as toujours pas").getByLabel("Modifier").click()
  await page.waitForSelector("#msgprog-candidats", { timeout: 3000 }).catch(() => {})
  verifier(
    "ouvrir un message à vérifier cherche tout seul, et montre les DEUX Harry",
    (await page.locator("#msgprog-candidats button").count()) === 2 &&
      await page.getByText("Plusieurs contacts — touche le bon").isVisible(),
  )
  await page.locator("#msgprog-candidats button").filter({ hasText: "Harry Locataire Bureau" }).click()
  verifier(
    "toucher un contact le confirme, avec son numéro",
    await page.locator("#msgprog-verifie").getByText("Partira à Harry Locataire Bureau · +972 54-111-2233").isVisible(),
  )
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await pause(300)
  verifier(
    "enregistré : la carte dit à qui il partira, numéro compris, et l'alerte disparaît",
    await carte("tu ne m'as toujours pas").getByText("À Harry Locataire Bureau").isVisible() &&
      await carte("tu ne m'as toujours pas").getByText("(+972 54-111-2233)").isVisible() &&
      (await carte("tu ne m'as toujours pas").locator(".destinataire-alerte").count()) === 0,
  )

  // ── « ce contact » : le champ s'ouvre vide, il écrit le vrai nom ──
  await carte("dès que possible").getByLabel("Modifier").click()
  await pause(200)
  verifier(
    "« ce contact » n'est pas repris comme nom : le champ s'ouvre vide",
    (await page.getByLabel("Destinataire").inputValue()) === "",
  )
  await page.getByLabel("Destinataire").fill("Mickael")
  await page.getByRole("button", { name: "Chercher" }).click()
  await page.waitForSelector("#msgprog-candidats", { timeout: 3000 }).catch(() => {})
  verifier(
    "« Chercher » trouve Mickaël Bensoussan dans le répertoire (sans l'accent tapé)",
    await page.locator("#msgprog-candidats").getByText("Mickaël Bensoussan").isVisible() &&
      await page.getByText("Touche-le pour le confirmer").isVisible(),
  )
  await page.locator("#msgprog-candidats button").first().click()
  await page.getByLabel("Destinataire").fill("Mickael B.")
  verifier(
    "changer le nom après avoir choisi retire la vérification (elle ne correspond plus)",
    (await page.locator("#msgprog-verifie").count()) === 0,
  )
  await page.getByRole("button", { name: "Chercher" }).click()
  await page.waitForSelector("#msgprog-candidats", { timeout: 3000 }).catch(() => {})
  await page.locator("#msgprog-candidats button").first().click()
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await pause(300)
  verifier(
    "enregistré : plus « manquant », il partira à Mickaël Bensoussan",
    await carte("dès que possible").getByText("À Mickaël Bensoussan").isVisible() &&
      await carte("dès que possible").getByText("(+972 58-777-6655)").isVisible(),
  )

  // ── Un message déjà envoyé ou annulé ne propose ni modifier ni annuler ──
  verifier(
    "un message déjà envoyé n'a plus de bouton Modifier ni Annuler l'envoi",
    (await carte("Mel").getByLabel("Modifier").count()) === 0 &&
      (await carte("Mel").getByLabel("Annuler l'envoi").count()) === 0,
  )
  verifier(
    "un message déjà annulé n'a plus de bouton Modifier ni Annuler l'envoi",
    (await carte("Fournisseur").getByLabel("Modifier").count()) === 0 &&
      (await carte("Fournisseur").getByLabel("Annuler l'envoi").count()) === 0,
  )

  // ── Modifier à la main : heure, contenu, destinataire ──
  await carte("Dylan").getByLabel("Modifier").click()
  await pause(200)
  verifier(
    "le formulaire de modification s'ouvre pré-rempli",
    await page.getByLabel("Destinataire").inputValue() === "Dylan (client de Mélissa)" &&
      (await page.getByLabel("Message").inputValue()).includes("On en est où"),
  )
  await page.getByLabel("Destinataire").fill("Dylan Cohen")
  await page.getByLabel("Message").fill("Le chantier avance bien ?")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await pause(300)
  verifier(
    "modifier change le contenu affiché, sans créer une seconde ligne",
    await page.getByText("Dylan Cohen").isVisible() &&
      await page.getByText("Le chantier avance bien ?").isVisible() &&
      (await page.getByText("Dylan (client de Mélissa)").count()) === 0,
  )
  verifier(
    "une modification remet le message à « Prévu »",
    await carte("Dylan Cohen").getByText("Prévu", { exact: true }).isVisible(),
  )

  // Un message ANNONCÉ, modifié, retombe aussi à « Prévu ».
  await carte("Dan Marciano").getByLabel("Modifier").click()
  await pause(200)
  const dansTroisJours = new Date(Date.now() + 3 * 24 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, "0")
  await page
    .getByLabel("Heure prévue")
    .fill(
      `${dansTroisJours.getFullYear()}-${pad(dansTroisJours.getMonth() + 1)}-${pad(dansTroisJours.getDate())}T08:00`,
    )
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await pause(300)
  verifier(
    "reprogrammer un message annoncé le remet aussi à « Prévu »",
    await carte("Dan Marciano").getByText("Prévu", { exact: true }).isVisible(),
  )
  verifier(
    "la nouvelle heure se reflète dans le tri : Dan Marciano passe en dernier",
    await page.locator("#liste > div").last().getByText("Dan Marciano").isVisible(),
  )

  // ── Annuler, avec confirmation ──
  await carte("Dylan Cohen").getByLabel("Annuler l'envoi").click()
  await pause(300)
  verifier(
    "l'annulation demande confirmation, en nommant le destinataire et l'heure",
    await page.getByText("Annuler cet envoi programmé ?").isVisible() &&
      await page.getByText(/« Dylan Cohen »/).isVisible(),
  )
  await page.getByRole("button", { name: "Annuler", exact: true }).click()
  await pause(300)
  verifier(
    "fermer la confirmation par « Annuler » n'annule pas l'envoi",
    await carte("Dylan Cohen").getByText("Prévu", { exact: true }).isVisible(),
  )
  await carte("Dylan Cohen").getByLabel("Annuler l'envoi").click()
  await pause(300)
  await page.getByRole("button", { name: "Annuler l'envoi" }).click()
  await pause(300)
  verifier(
    "confirmer annule pour de bon, et retire les boutons d'action",
    await carte("Dylan Cohen").getByText("Annulé", { exact: true }).isVisible() &&
      (await carte("Dylan Cohen").getByLabel("Modifier").count()) === 0,
  )

  // ── État vide ──
  await carte("Dan Marciano").getByLabel("Annuler l'envoi").click()
  await pause(300)
  await page.getByRole("button", { name: "Annuler l'envoi" }).click()
  await pause(300)
  verifier(
    "sans plus aucun message modifiable, les deux restants (déjà envoyé/annulé) restent visibles",
    await page.getByText("Bien arrivé.").isVisible() &&
      await page.getByText("Commande annulée finalement.").isVisible(),
  )

  // ── L'écran tient sur un téléphone ──
  verifier(
    "rien ne déborde en largeur à 390 points",
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390,
    `largeur ${await page.evaluate(() => document.documentElement.scrollWidth)}`,
  )

  // ── Répertoire refusé : il le lit, au lieu d'une liste vide ──
  const refus = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  await refus.goto(`${BASE}/scripts/harness/programmes.html?repertoire=refuse`)
  await refus.waitForSelector("#liste")
  await refus.locator("#liste > div").filter({ hasText: "tu ne m'as toujours pas" }).getByLabel("Modifier").click()
  await pause(400)
  verifier(
    "répertoire refusé : il est dit où l'autoriser, pas « personne à ce nom »",
    await refus.getByText(/n'a pas accès à tes contacts/).isVisible() &&
      (await refus.getByText(/Personne à ce nom/).count()) === 0,
  )
  await refus.close()

  // ── Les trois états ──
  for (const [etat, attendu] of [
    ["chargement", "Chargement..."],
    ["erreur", "La connexion a été coupée."],
    ["vide", "Rien n'est programmé pour l'instant."],
  ]) {
    const p = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
    await p.goto(`${BASE}/scripts/harness/programmes.html?etat=${etat}`)
    await pause(600)
    verifier(`état « ${etat} » affiché`, (await p.getByText(attendu, { exact: false }).count()) > 0)
    await p.close()
  }
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
