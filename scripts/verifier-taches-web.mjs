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

  // ── Une « tâche » qui est en fait une demande à Claude ──
  // Au 5 sept. 2026, six de ses tâches étaient dans ce cas, dont une qui
  // n'existait NULLE PART ailleurs : sa demande dormait dans sa liste de
  // courses depuis sa dictée, invisible de toutes les sessions.
  verifier(
    "une demande à Claude est signalée sur sa ligne",
    await page.getByText(/c'est une demande à Claude, pas une tâche/).first().isVisible(),
  )
  verifier(
    "et la ligne dit CE QUI l'a fait reconnaître",
    await page.getByText(/Ça commence par/).first().isVisible(),
    "sans l'indice, il faudrait me croire sur parole",
  )
  verifier(
    "une vraie tâche qui parle d'un chantier de maçonnerie n'est PAS signalée",
    // Deux tâches du banc sont des demandes à Claude (« savoir combien il
    // reste de credit » et « la latence du mode Live »), et deux seulement :
    // ni les carreaux de la villa Dan, ni le spot de l'entrée.
    (await page.getByText(/c'est une demande à Claude/).count()) === 2,
    "« commander les carreaux pour le chantier de la villa Dan » est une vraie tâche",
  )

  // ── Les tâches égarées, rassemblées en tête de l'onglet ──
  // « Je ne vois pas de quelles 7 lignes existantes tu parles » (6 sept.) :
  // le signalement existait sur chaque ligne, mais réparti dans vingt-neuf
  // tâches et douze catégories, il ne se trouvait que par hasard.
  {
    const egares = page.locator("#egares")
    verifier(
      "les tâches qui sont en fait des chantiers sont rassemblées en tête",
      await egares.getByText(/demandes? à Claude/).first().isVisible(),
      "il faudrait tomber dessus en faisant défiler la liste",
    )
    verifier(
      "et une vraie tâche de maçonnerie n'y figure pas",
      !(await egares.getByText("Commander les carreaux pour le chantier").isVisible()),
      "Raphaël est dans l'immobilier : « chantier » y désigne un chantier de maçonnerie",
    )
    verifier(
      "chaque ligne dit CE QUI l'a fait reconnaître",
      await egares.getByText(/Ça commence par/).first().isVisible(),
      "il devrait nous croire sur parole",
    )
    verifier(
      "et prévient quand le chantier existe DÉJÀ dans le cockpit",
      await egares.getByText("Ça existe peut-être déjà dans le cockpit").first().isVisible(),
      "un appui créerait un doublon de quelque chose parfois déjà livré — quatre cas sur six dans ses vraies données",
    )
    verifier(
      "dans ce cas, on lui propose de RANGER la tâche, pas d'en créer un second",
      (await egares.getByRole("button", { name: "Ranger la tâche" }).first().isVisible()) &&
        (await egares.getByRole("button", { name: "Créer quand même" }).first().isVisible()),
      "créer reste possible : c'est lui qui juge",
    )

    const avant = await egares.getByText(/Ça commence par/).count()
    await egares.getByRole("button", { name: "Ranger la tâche" }).nth(1).click()
    await pause(400)
    verifier(
      "ranger la tâche la fait sortir de la liste SANS créer de chantier",
      (await egares.getByText(/Ça commence par/).count()) === avant - 1 &&
        (await page.locator("#chantiers-crees").innerText()).includes("aucun"),
      `${avant} → ${await egares.getByText(/Ça commence par/).count()} · ${await page.locator("#chantiers-crees").innerText()}`,
    )
  }

  // ── Ce qui va RÉELLEMENT sonner, et quand ──
  // Sa question du chantier 336be5fb. Mesuré sur ses trente tâches le
  // 6 sept. : vingt-deux sans date, quatre en retard, quatre qui sonneront —
  // et rien ne le disait nulle part.
  await page.getByRole("button", { name: "Programmer l'intervention Avihai" }).click()
  await pause(250)
  verifier(
    "une tâche datée dit QUAND Jarvis préviendra",
    await page.getByText(/Jarvis te préviendra/).isVisible(),
    "il ne pouvait pas savoir si une date d'échéance déclenchait quoi que ce soit",
  )
  await page.getByRole("button", { name: "Racheter un spot pour l'entrée de la maison" }).click()
  await pause(250)
  verifier(
    "et une tâche sans date dit POURQUOI elle ne sonnera pas",
    await page.getByText(/n'a pas de date/).isVisible(),
    "« aucun rappel » sans raison se lit comme une panne",
  )
  await page.getByRole("button", { name: "Racheter un spot pour l'entrée de la maison" }).click()
  await pause(150)

  await page.getByRole("button", { name: "En faire un chantier" }).first().click()
  await pause(400)
  verifier(
    "le chantier est créé avec un titre débarrassé de l'amorce",
    (await page.locator("#chantiers-crees").innerText()).includes(
      "Savoir combien il reste de credit",
    ),
    await page.locator("#chantiers-crees").innerText(),
  )
  verifier(
    "et la tâche est marquée faite, jamais supprimée",
    (await page.getByText("R un chantier : savoir combien il reste de credit").count()) > 0,
    "c'est SA liste : il doit retrouver ce qu'il a dicté",
  )

  // ── « Ça existe déjà » à la saisie d'une tâche ──
  // Trois « racheter un spot pour l'entrée de la maison » identiques
  // dormaient dans sa liste : le cockpit prévenait, l'onglet Tâches non.
  await page.getByRole("button", { name: "Nouvelle tâche" }).click()
  await pause(300)
  await page.getByLabel("Titre").fill("Racheter un spot pour l'entrée")
  await pause(300)
  verifier(
    "à la saisie, une tâche déjà présente est signalée",
    await page.getByText(/Tu as déjà une tâche proche|Tu as déjà des tâches proches/).isVisible(),
  )
  await page.getByLabel("Titre").fill("Réserver le restaurant de samedi")
  await pause(300)
  verifier(
    "et rien n'est signalé quand la tâche est nouvelle",
    (await page.getByText(/Tu as déjà/).count()) === 0,
    "un avertissement qui se déclenche à tort n'est plus lu du tout",
  )
  await page.keyboard.press("Escape")
  await pause(300)

  await page.getByRole("button", { name: "Supprimer" }).first().click()
  await pause(300)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(400)
  verifier(
    "confirmer supprime pour de bon",
    (await page.getByText("Appeler le plombier").count()) === 0,
    "la tâche est toujours là après confirmation",
  )
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
