/**
 * Vérifie l'onglet Docs dans un vrai navigateur, sur un écran de téléphone.
 *
 *   node scripts/verifier-documents-web.mjs
 *
 * Aucune base : le banc (`scripts/harness/documents.tsx`) monte la VRAIE
 * `DocumentsPage` à travers le contexte, avec un `documentsState` fabriqué.
 *
 * CE QUI EST EN JEU. Sa capture du 15 sept. 2026 : l'onglet Docs en rouge,
 * « Invalid key: 8bb3be37-…/טופס 18 פופי יוגה 162437_260915_בעמ.pdf », et
 * « Aucun document. » en dessous. `nomDocument.ts` prouve hors ligne que la
 * clé passe et que le nom revient intact — mais un nom HÉBREU s'écrit de
 * droite à gauche, et mêlé à des chiffres et à une extension latine il passe
 * par l'algorithme bidirectionnel du navigateur, dans une ligne tronquée à
 * côté de deux boutons. Seul un vrai moteur de rendu dit s'il TIENT.
 */
import { spawn } from "node:child_process"

const PORT = 5217
const BASE = `http://127.0.0.1:${PORT}`
const LE_SIEN = "טופס 18 פופי יוגה 162437_260915_בעמ.pdf"

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
      const r = await fetch(`${BASE}/scripts/harness/documents.html`)
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

  // ── La liste : son nom, pas la clé ──
  await page.goto(`${BASE}/scripts/harness/documents.html`)
  await page.waitForSelector("text=contrat-villa-dan_2026.pdf")

  verifier(
    "son document hébreu s'affiche avec SON nom",
    (await page.getByText(LE_SIEN).count()) === 1,
    "c'est le document de sa capture : il doit être là, et lisible",
  )
  verifier(
    "et jamais la clé échappée",
    !(await page.locator("body").innerText()).includes("=u05D8"),
    "l'échappement est un détail de stockage : il n'a rien à faire à l'écran",
  )
  verifier(
    "un nom accentué s'affiche entier lui aussi",
    (await page.getByText("facture été — reçu d'acompte.pdf").count()) === 1,
    "l'hébreu n'était que la moitié du défaut — « été » et « reçu » échouaient pareil",
  )

  // ── Il TIENT sur son écran ──
  const deborde = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  )
  verifier(
    "la liste ne déborde pas en largeur sur un écran de téléphone",
    !deborde,
    "un nom long non coupé pousse les boutons hors de l'écran",
  )

  const boutonsVisibles = await page.evaluate(() => {
    const largeur = document.documentElement.clientWidth
    return [...document.querySelectorAll('[aria-label="Télécharger"], [aria-label="Supprimer"]')].every(
      (b) => {
        const r = b.getBoundingClientRect()
        return r.left >= 0 && r.right <= largeur + 1 && r.width > 0
      },
    )
  })
  verifier(
    "télécharger et supprimer restent atteignables sur chaque ligne",
    boutonsVisibles,
    "le bidirectionnel peut pousser les boutons hors du cadre sans faire déborder la page",
  )

  // ── Supprimer demande toujours, et nomme le document ──
  await page.getByLabel("Supprimer").first().click()
  await pause(300)
  verifier(
    "la corbeille demande avant de supprimer, en nommant le document",
    (await page.getByText(/sera supprimé définitivement/).isVisible()) &&
      (await page.getByText(LE_SIEN).count()) >= 1,
    "c'est la règle du projet : aucune suppression au premier appui",
  )
  await page.getByRole("button", { name: "Annuler" }).click()
  await pause(300)
  verifier(
    "annuler ne supprime rien",
    (await page.getByText(LE_SIEN).count()) === 1,
  )

  // ── Ce qu'il lit quand l'import échoue ──
  await page.goto(`${BASE}/scripts/harness/documents.html?echec=1`)
  await page.waitForSelector("text=contrat-villa-dan_2026.pdf")
  await page.setInputFiles('input[type="file"]', {
    name: LE_SIEN,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 essai"),
  })
  await pause(500)
  const texte = await page.locator("body").innerText()
  verifier(
    "un import raté ne lui renvoie jamais « Invalid key »",
    !texte.includes("Invalid key"),
    "c'est mot pour mot ce que montrait sa capture : de l'anglais et un identifiant technique",
  )
  verifier(
    "il lit une phrase en français qui dit d'où vient le défaut",
    texte.includes("Jarvis"),
    "sinon il renomme ses fichiers pour rien",
  )
  verifier(
    "et le bouton d'import redevient utilisable après l'échec",
    await page.getByRole("button", { name: "Importer" }).isEnabled(),
    "un bouton resté grisé après une erreur bloque la seule action de l'écran",
  )
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
