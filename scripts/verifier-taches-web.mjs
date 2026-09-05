/**
 * Vérifie la corbeille d'une tâche dans un vrai navigateur, sur un écran de
 * téléphone.
 *
 *   node scripts/verifier-taches-web.mjs
 *
 * Aucune base : le banc (`scripts/harness/taches.tsx`) monte la VRAIE ligne de
 * tâche avec des données factices.
 *
 * CE QUI EST EN JEU. Jusqu'au 5 sept. 2026, la corbeille d'une tâche
 * supprimait au premier appui, sans un mot. Sur un téléphone elle est à trois
 * millimètres du crayon, et une tâche supprimée ne se retrouve nulle part :
 * il n'existe pas d'archive pour les tâches, contrairement aux chantiers.
 */
import { spawn } from "node:child_process"

const PORT = 5213
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
      const r = await fetch(`${BASE}/scripts/harness/taches.html`)
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
  await page.goto(`${BASE}/scripts/harness/taches.html`)
  await page.waitForSelector("text=Appeler le plombier")

  await page.getByRole("button", { name: "Supprimer" }).first().click()
  await pause(300)
  verifier(
    "la corbeille d'une tâche demande avant de supprimer",
    await page.getByText("Supprimer cette tâche ?").isVisible(),
    "elle supprimait au premier appui, sans un mot",
  )
  verifier(
    "et rappelle laquelle",
    await page.getByText("« Appeler le plombier » sera supprimée").isVisible(),
  )

  await page.getByRole("button", { name: "Annuler" }).first().click()
  await pause(300)
  verifier(
    "annuler ne supprime rien",
    await page.getByText("Appeler le plombier").first().isVisible(),
  )

  await page.getByRole("button", { name: "Supprimer" }).first().click()
  await pause(300)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(400)
  verifier(
    "confirmer supprime pour de bon",
    await page.locator("#vide").isVisible(),
    "la tâche est toujours là après confirmation",
  )
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
