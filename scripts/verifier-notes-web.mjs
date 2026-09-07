/**
 * Vérifie l'onglet Notes dans un vrai navigateur, sur un écran de téléphone.
 *
 *   node scripts/verifier-notes-web.mjs
 *
 * Aucune base : le banc (`scripts/harness/notes.tsx`) monte les VRAIS
 * composants (NoteFormDialog, ConfirmerAction) avec un état local.
 *
 * CE QUI EST EN JEU (chantier 5ad49cc0). Le jeu complet attendu d'une liste :
 * créer, voir, modifier, supprimer AVEC confirmation, chercher, et les états
 * vide / non trouvé. Sans ça, l'onglet ne serait qu'une moitié de
 * fonctionnalité.
 */
import { spawn } from "node:child_process"

const PORT = 5214
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
      const r = await fetch(`${BASE}/scripts/harness/notes.html`)
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
  await page.goto(`${BASE}/scripts/harness/notes.html`)
  await page.waitForSelector("text=Idée cadeau Mélissa")

  verifier("les deux notes du banc s'affichent", await page.locator("#liste").getByText("Idée cadeau Mélissa").isVisible() &&
    (await page.locator("#liste").getByText("Code du portail de la villa Dan").isVisible()))
  verifier(
    "le contenu et la date de modification se voient sans ouvrir",
    await page.getByText(/Un livre de cuisine italienne/).isVisible() &&
      await page.getByText(/Modifiée/).first().isVisible(),
  )

  // ── Créer ──
  await page.getByRole("button", { name: "Nouvelle note" }).click()
  await pause(200)
  await page.getByLabel("Titre").fill("Code de l'alarme")
  await page.getByLabel("Contenu").fill("4 chiffres, sur le boîtier près de l'entrée.")
  await page.getByRole("button", { name: "Ajouter" }).click()
  await pause(300)
  verifier(
    "la note créée apparaît dans la liste",
    await page.locator("#liste").getByText("Code de l'alarme").isVisible(),
  )

  // ── Chercher ──
  await page.getByLabel("Chercher dans tes notes").fill("portail")
  await pause(200)
  verifier(
    "la recherche filtre sur le titre ET le contenu",
    await page.getByText("Code du portail de la villa Dan").isVisible() &&
      (await page.getByText("Code de l'alarme").count()) === 0,
  )
  await page.getByLabel("Chercher dans tes notes").fill("rien de tel nulle part")
  await pause(200)
  verifier(
    "rien trouvé se dit, plutôt qu'une liste vide muette",
    await page.locator("#rien-trouve").getByText(/Rien ne correspond/).isVisible(),
  )
  await page.getByLabel("Chercher dans tes notes").fill("")
  await pause(200)

  // ── Modifier ── (une carte scopée par son texte : l'ordre des cartes
  // n'est pas ce qu'on vérifie ici, et deviner un rang serait fragile)
  const carte = (texte) => page.locator("#liste > div").filter({ hasText: texte })

  await carte("Code de l'alarme").getByLabel("Modifier").click()
  await pause(200)
  await page.getByLabel("Titre").fill("Code de l'alarme (mis à jour)")
  await page.getByRole("button", { name: "Enregistrer" }).click()
  await pause(300)
  verifier(
    "modifier une note change son titre, sans en créer une seconde",
    await page.getByText("Code de l'alarme (mis à jour)").isVisible() &&
      (await page.getByText("Code de l'alarme", { exact: true }).count()) === 0,
  )

  // ── Supprimer, avec confirmation ──
  await carte("Idée cadeau Mélissa").getByLabel("Supprimer").click()
  await pause(300)
  verifier(
    "la suppression demande confirmation, nommément",
    await page.getByText("Supprimer cette note ?").isVisible() &&
      await page.getByText(/« Idée cadeau Mélissa »/).isVisible(),
  )
  await page.getByRole("button", { name: "Annuler" }).click()
  await pause(300)
  verifier(
    "annuler ne supprime rien",
    await page.getByText("Idée cadeau Mélissa").isVisible(),
  )
  await carte("Idée cadeau Mélissa").getByLabel("Supprimer").click()
  await pause(300)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(300)
  verifier(
    "confirmer supprime pour de bon",
    (await page.getByText("Idée cadeau Mélissa").count()) === 0,
  )

  // ── Tout supprimer : l'état vide se dit ──
  await page.getByLabel("Supprimer").first().click()
  await pause(300)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(300)
  await page.getByLabel("Supprimer").first().click()
  await pause(300)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(300)
  verifier(
    "sans aucune note, l'état vide invite à en créer une",
    await page.locator("#vide").getByText(/Aucune note pour l'instant/).isVisible(),
  )
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
