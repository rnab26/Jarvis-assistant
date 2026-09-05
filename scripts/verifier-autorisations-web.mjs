/**
 * Parcourt l'écran des autorisations dans un vrai navigateur, à la taille
 * d'un téléphone.
 *
 *   node scripts/verifier-autorisations-web.mjs
 *
 * Aucune base, aucun Android : le banc (`scripts/harness/autorisations.tsx`)
 * monte la VRAIE liste avec des états fabriqués — dont ceux qui ne se
 * produisent pas sur cette machine et qui sont justement les plus dangereux :
 * un refus définitif, un état qu'Android ne veut pas dire, une APK sans le
 * plugin.
 *
 * Ce que ça prouve et que verifier-autorisations.ts ne peut pas prouver : ce
 * qu'on VOIT. Un bouton « Autoriser » sur une ligne qu'Android ne redemandera
 * jamais, une ligne sans bouton et sans explication, un écran vide quand la
 * lecture échoue, une carte qui déborde en largeur.
 */
import { spawn } from "node:child_process"

const PORT = 5205
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
      const r = await fetch(`${BASE}/scripts/harness/autorisations.html`)
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
  // Un téléphone, pas un écran de bureau : c'est là que ça se passe.
  const page = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE:", e.message)
  })
  await page.goto(`${BASE}/scripts/harness/autorisations.html`)
  await page.waitForSelector("#cas-neuf")

  const neuf = page.locator("#cas-neuf")
  const bloque = page.locator("#cas-bloque")
  const tout = page.locator("#cas-tout")
  const absent = page.locator("#cas-absent")
  const erreur = page.locator("#cas-erreur")

  // ── Un téléphone neuf : on peut tout accorder d'un geste ──
  verifier(
    "un bouton accorde tout d'un geste",
    await neuf.locator("[data-tout-autoriser]").isVisible(),
    "sans lui, il faut appuyer ligne par ligne — exactement ce qu'il ne veut plus faire",
  )
  verifier(
    "chaque autorisation dit ce qu'elle permet, pas son nom Android seul",
    await neuf.getByText("Appeler et écrire à tes contacts").isVisible() &&
      await neuf.getByText(/Sans elle :/).first().isVisible(),
  )
  verifier(
    "le compte accordées / total est affiché",
    /0 accordée sur 8/.test((await neuf.locator("[data-resume]").textContent()) ?? ""),
    (await neuf.locator("[data-resume]").textContent()) ?? "",
  )

  // ── Le bouton est branché : il accorde vraiment ──
  await neuf.locator('[data-autorisation="micro"]').getByRole("button", { name: "Autoriser" }).click()
  await pause(200)
  verifier(
    "« Autoriser » accorde vraiment la ligne",
    (await neuf.locator('[data-etat="micro"]').textContent()) === "Accordée",
    (await neuf.locator('[data-etat="micro"]').textContent()) ?? "",
  )
  verifier(
    "et son bouton disparaît une fois accordée",
    (await neuf.locator('[data-autorisation="micro"]').getByRole("button").count()) === 0,
    "un bouton qui reste après coup fait douter que l'appui ait servi",
  )

  // ── La position en arrière-plan attend la position, et le DIT ──
  verifier(
    "la position en arrière-plan n'offre pas de bouton avant la position",
    (await neuf.locator('[data-autorisation="position_fond"]').getByRole("button").count()) === 0,
    "Android rejette le lot entier : le bouton ne ferait rien",
  )
  verifier(
    "et elle explique pourquoi elle attend",
    await neuf.locator('[data-autorisation="position_fond"]').getByText(/Disponible une fois/).isVisible(),
    "une ligne sans bouton et sans explication se lit comme une panne",
  )

  // ── Refus définitif : jamais un bouton mort ──
  verifier(
    "une autorisation refusée pour de bon n'offre pas « Autoriser »",
    (await bloque.locator('[data-autorisation="micro"]').getByRole("button", { name: "Autoriser" }).count()) === 0,
    "Android ne réaffichera plus la fenêtre : ce bouton ne ferait rien du tout",
  )
  verifier(
    "elle envoie vers les réglages d'Android à la place",
    await bloque
      .locator('[data-autorisation="micro"]')
      .getByRole("button", { name: "Ouvrir les réglages d'Android" })
      .isVisible(),
  )
  verifier(
    "et elle dit pourquoi la demande ne revient plus",
    await bloque.locator('[data-autorisation="micro"]').getByText(/ne la redemande plus/).isVisible(),
  )

  // ── Un état qu'Android ne veut pas dire n'est pas annoncé comme un refus ──
  verifier(
    "un état illisible se dit « Non vérifiable », pas « Refusée »",
    (await bloque.locator('[data-etat="assistant"]').textContent()) === "Non vérifiable",
    (await bloque.locator('[data-etat="assistant"]').textContent()) ?? "",
  )

  // ── Tout accordé : on le dit, on ne propose rien ──
  verifier(
    "tout accordé : plus de bouton « Tout autoriser »",
    (await tout.locator("[data-tout-autoriser]").count()) === 0,
  )
  verifier(
    "et l'écran le dit au lieu de rester muet",
    await tout.locator("[data-rien-a-demander]").isVisible(),
  )

  // ── Hors de l'app, et panne de lecture : deux messages différents ──
  verifier(
    "hors de l'app, l'écran explique au lieu d'afficher une liste vide",
    await absent.getByText(/n'existent que dans l'application installée/).isVisible(),
  )
  verifier(
    "une lecture en échec se dit, et se réessaie",
    (await erreur.getByText("La demande d'autorisation n'a pas abouti.").isVisible()) &&
      (await erreur.getByRole("button", { name: "Réessayer" }).isVisible()),
    "une panne qui s'affiche comme une absence, c'est la famille de bugs la plus chère du projet",
  )

  // ── Rien ne déborde en largeur ──
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
