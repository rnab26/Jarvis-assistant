/**
 * Parcourt « Vos conversations » dans un vrai navigateur, à la taille d'un
 * téléphone.
 *
 *   node scripts/verifier-memoire-web.mjs
 *
 * Aucune base, aucun Android : le banc (`scripts/harness/memoire.tsx`) monte
 * la VRAIE carte avec des échanges factices.
 *
 * Ce que ça prouve, et que verifier-memoire.mjs ne peut pas prouver : ce qu'on
 * voit et ce qu'on peut FAIRE à l'écran. Depuis que Jarvis sait revenir sur
 * une conversation passée, le mot-à-mot des sept derniers jours n'est plus
 * une trace technique : c'est de la matière qu'il peut ressortir à voix
 * haute. Raphaël doit donc pouvoir la lire, la chercher et en retirer ce
 * qu'il veut — et ne rien effacer d'un appui de travers en faisant défiler.
 */
import { spawn } from "node:child_process"

const PORT = 5203
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
      const r = await fetch(`${BASE}/scripts/harness/memoire.html`)
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
  // Un téléphone, pas un écran de bureau : c'est là que Raphaël s'en sert.
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE:", e.message)
  })
  await page.goto(`${BASE}/scripts/harness/memoire.html`)
  await page.waitForSelector("text=Vos conversations")

  const etat = (nom) => page.locator(`[data-etat="${nom}"]`)

  // ── Ce qu'on voit d'emblée ──
  verifier(
    "la carte dit à quoi sert ce qui est gardé, et combien de temps",
    await page.getByText(/de quoi vous aviez parlé/).isVisible(),
  )
  verifier(
    "les échanges sont datés par jour, pas juste empilés",
    await page.getByText(/aujourd'hui|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i).first().isVisible(),
  )
  verifier(
    "on voit ce qu'on a dit ET ce que Jarvis a répondu",
    (await page.getByText("On part sur quoi comme matériau pour la villa Dan ?").isVisible()) &&
      (await page.getByText(/Sur du grès cérame/).isVisible()),
  )
  verifier(
    "la page ne déverse pas les 28 échanges d'un coup",
    await page.getByRole("button", { name: /Voir les \d+ suivants/ }).isVisible(),
    "sur un téléphone, une liste sans fin est une liste qu'on ne parcourt pas",
  )
  await page.getByRole("button", { name: /Voir les \d+ suivants/ }).click()
  await pause(200)
  verifier(
    "et on peut en demander plus",
    await page.getByText("Échange de remplissage numéro 25.").isVisible(),
  )

  // ── La recherche ──
  const champ = page.getByLabel("Chercher dans les conversations")
  await champ.fill("carreleur")
  await pause(250)
  verifier(
    "la recherche retrouve un échange par un mot",
    await page.getByText("Rappelle-moi d'appeler le carreleur demain matin.").isVisible(),
  )
  verifier(
    "et masque le reste",
    !(await page.getByText("Mets la musique de Brassens sur Spotify.").isVisible()),
  )
  await champ.fill("GRES CERAME")
  await pause(250)
  verifier(
    "elle ignore les accents et la casse — c'est dicté, pas tapé",
    await page.getByText(/Sur du grès cérame/).isVisible(),
    "une recherche qui bute sur un accent ne sert à rien sur du texte venu d'une dictée",
  )
  await champ.fill("zzzzz")
  await pause(250)
  verifier(
    "une recherche sans résultat le dit, au lieu d'afficher une liste vide",
    await page.getByText(/Rien qui contienne/).isVisible(),
  )
  await champ.fill("")
  await pause(250)

  // ── Rien ne s'efface d'un appui ──
  await page.getByRole("button", { name: "Effacer cet échange" }).first().click()
  await pause(300)
  verifier(
    "effacer un échange demande confirmation",
    await page.getByText("Effacer cet échange ?").isVisible(),
    "la corbeille d'une ligne se touche par erreur en faisant défiler",
  )
  verifier(
    "et la fenêtre dit CE QUI sera perdu, pas « êtes-vous sûr ? »",
    await page.getByText(/On part sur quoi comme matériau/).nth(1).isVisible(),
  )
  await page.getByRole("button", { name: "Annuler" }).click()
  await pause(300)
  verifier(
    "on peut se raviser, et l'échange est toujours là",
    await page.getByText("On part sur quoi comme matériau pour la villa Dan ?").isVisible(),
  )

  await page.getByRole("button", { name: "Effacer cet échange" }).first().click()
  await pause(300)
  await page.getByRole("button", { name: "Effacer" }).click()
  await pause(400)
  verifier(
    "confirmé, l'échange disparaît vraiment",
    !(await page.getByText("On part sur quoi comme matériau pour la villa Dan ?").isVisible()),
  )

  await page.getByRole("button", { name: "Tout effacer" }).click()
  await pause(300)
  verifier(
    "« Tout effacer » demande confirmation et dit combien",
    await page.getByText(/échanges gardés seront supprimés/).isVisible(),
  )
  verifier(
    "et précise que les souvenirs ne sont pas touchés",
    await page.getByText(/n'est pas touché/).isVisible(),
    "sans ça, on croirait effacer tout ce que Jarvis sait de soi",
  )
  await page.getByRole("button", { name: "Annuler" }).click()
  await pause(300)

  // ── Les trois autres états ──
  await etat("chargement").click()
  await pause(200)
  verifier("l'état de chargement se voit", await page.getByText("Chargement...").isVisible())

  await etat("erreur").click()
  await pause(200)
  verifier(
    "une erreur de chargement se dit, avec de quoi réessayer",
    (await page.getByText(/Réseau injoignable/).isVisible()) &&
      (await page.getByRole("button", { name: "Réessayer" }).isVisible()),
    "sinon le « Chargement... » resterait affiché indéfiniment",
  )

  await etat("vide").click()
  await pause(200)
  verifier(
    "l'état vide dit quoi faire, au lieu de laisser un blanc",
    await page.getByText(/Parle à Jarvis/).isVisible(),
  )
  verifier(
    "et n'offre ni recherche ni « Tout effacer » quand il n'y a rien",
    !(await page.getByRole("button", { name: "Tout effacer" }).isVisible()) &&
      !(await page.getByLabel("Chercher dans les conversations").isVisible()),
    "des commandes qui ne commandent rien",
  )

  // ── Rien ne déborde en largeur ──
  await etat("pret").click()
  await pause(200)
  const debordement = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  verifier(
    "rien ne déborde en largeur sur un écran de téléphone",
    debordement <= 0,
    `${debordement} points de trop — il faudrait faire défiler latéralement`,
  )
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
