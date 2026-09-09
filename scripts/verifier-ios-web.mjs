/**
 * L'APP DANS UN VRAI MOTEUR WEBKIT, À LA TAILLE D'UN IPHONE.
 *
 *   node scripts/verifier-ios-web.mjs
 *
 * CE QUE CE BANC AJOUTE, ET POURQUOI IL A FALLU L'ÉCRIRE (chantier a40fccaa).
 * Sa décision du 5 sept. 2026 : « Le site web suffit, mais soigne-le pour
 * iPhone. » Pas d'app iOS, pas de compte développeur, rien à payer — mais le
 * site doit tenir dans Safari. Or les six autres parcours de
 * `verifications-navigateur.yml` tournent tous sur Chromium, et c'est
 * justement WebKit qui casse ces choses-là. Deux sessions (6 et 7 sept.) ont
 * conclu « impossible ici, aucun moteur WebKit » ; c'était vrai du navigateur
 * préinstallé, pas de l'environnement : `playwright install --with-deps
 * webkit` le pose, et il démarre.
 *
 * CE QU'IL NE PROUVE PAS, et il faut le dire : WebKit sous Linux n'est pas
 * Safari sur un iPhone. Même moteur de rendu, mais ni le système, ni
 * l'encoche, ni le mode « sur l'écran d'accueil » réels. `env(safe-area-inset-*)`
 * y vaut zéro : ce banc ne peut donc PAS vérifier les marges de l'encoche.
 * Il vérifie ce qu'un moteur WebKit peut dire — que ça s'affiche, que rien ne
 * déborde, que le contrat PWA est servi, et que les zones tactiles sont
 * atteignables au pouce.
 *
 * CE QU'IL A TROUVÉ LE JOUR OÙ IL A ÉTÉ ÉCRIT, mesuré et pas supposé : dans
 * l'onglet Tâches, « Marquer comme faite » faisait 16 × 16 points, et
 * « Supprimer » 28 × 28 collé à « Modifier » de la même taille. Corrigé par
 * `.zone-tactile` (src/index.css), qui agrandit la surface sensible sans
 * déplacer quoi que ce soit.
 */
import { spawn } from "node:child_process"

const PORT = 5219
const BASE = `http://127.0.0.1:${PORT}`

/** Le plus petit côté qu'Apple accepte pour une cible tactile (Human
 * Interface Guidelines). On ne signale QUE ce qui est petit dans les DEUX
 * dimensions : un bouton large de 300 points et haut de 28 se vise sans
 * peine, une pastille de 16 × 16 non. Signaler les deux cas noierait le
 * second — et un avertissement qui se déclenche à tort n'est plus lu. */
const MINIMUM_TACTILE = 44

/** Les contrôles qui n'existent QUE dans les bancs d'essai (ils pilotent
 * l'état simulé) : ils ne sont jamais sur l'écran de Raphaël. */
const CONTROLES_DE_BANC = /^(banc:|pret$|vide$|erreur$|chargement$|sante-)/

async function chargerWebkit() {
  for (const chemin of ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"]) {
    try {
      const mod = await import(chemin)
      const m = mod.webkit ?? mod.default?.webkit
      if (m) return { webkit: m, devices: mod.devices ?? mod.default?.devices }
    } catch {
      // chemin suivant
    }
  }
  throw new Error("Playwright introuvable.")
}

async function attendreServeur(essais = 80) {
  for (let i = 0; i < essais; i++) {
    try {
      if ((await fetch(`${BASE}/scripts/harness/taches.html`)).ok) return
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

let navigateur
try {
  await attendreServeur()
  const { webkit, devices } = await chargerWebkit()
  navigateur = await webkit.launch()
  const iphone = devices?.["iPhone 14"] ?? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

  for (const nom of ["notes", "cockpit", "taches", "reglages", "autorisations", "memoire"]) {
    const ctx = await navigateur.newContext({ ...iphone })
    const page = await ctx.newPage()
    const pannes = []
    page.on("pageerror", (e) => pannes.push(e.message.slice(0, 100)))
    await page.goto(`${BASE}/scripts/harness/${nom}.html`, { waitUntil: "networkidle", timeout: 25000 })
    await new Promise((r) => setTimeout(r, 700))

    const m = await page.evaluate((minimum) => {
      const petits = []
      const sel =
        'button, a[href], [role="button"], input[type="checkbox"], select, [role="switch"], [role="tab"]'
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect()
        if (b.width === 0 || b.height === 0) continue
        // La zone qui répond au doigt, calque compris : c'est elle qui compte,
        // pas la taille visible du bouton.
        let haut = b.height
        let large = b.width
        const calque = getComputedStyle(el, "::after")
        if (calque && calque.content !== "none" && calque.position === "absolute") {
          const h = parseFloat(calque.height)
          if (Number.isFinite(h)) haut = Math.max(haut, h)
        }
        const parent = el.parentElement
        if (parent && parent.classList.contains("zone-tactile")) {
          const pc = getComputedStyle(parent, "::after")
          const h = parseFloat(pc.height)
          if (Number.isFinite(h)) haut = Math.max(haut, h)
        }
        if (haut < minimum && large < minimum) {
          const t = (el.getAttribute("aria-label") || el.innerText || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)
          petits.push(`${Math.round(large)}x${Math.round(haut)} « ${t} »`)
        }
      }
      return {
        petits: [...new Set(petits)],
        deborde: document.documentElement.scrollWidth > window.innerWidth + 1,
        texte: (document.body.innerText || "").trim().length,
      }
    }, MINIMUM_TACTILE)

    verifier(`${nom} : s'affiche dans WebKit sans lever d'erreur`, pannes.length === 0 && m.texte > 50,
      pannes.length ? pannes.slice(0, 2).join(" | ") : `seulement ${m.texte} caractères de texte : la page n'a rien rendu`)
    verifier(`${nom} : rien ne déborde en largeur`, !m.deborde,
      "le contenu est plus large que l'écran — sur un téléphone ça oblige à faire défiler de côté")

    const vrais = m.petits.filter((l) => !CONTROLES_DE_BANC.test(l.replace(/^[^«]*«\s*/, "").replace(/\s*»$/, "")))
    verifier(`${nom} : aucune cible tactile sous ${MINIMUM_TACTILE} points dans les deux sens`, vrais.length === 0,
      vrais.join(" | ") + " — hors de portée d'un pouce ; voir `.zone-tactile` dans src/index.css")
    await ctx.close()
  }

  // LE CONTRAT « SUR L'ÉCRAN D'ACCUEIL », lu dans le DOM SERVI, jamais grepé
  // dans le fichier source : c'est ce que le téléphone reçoit qui compte.
  const ctx = await navigateur.newContext({ ...iphone })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded", timeout: 25000 })
  const contrat = await page.evaluate(() => ({
    viewport: document.querySelector("meta[name=viewport]")?.content ?? "",
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content ?? "",
    barre: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content ?? "",
    titre: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content ?? "",
    icone: document.querySelector('link[rel="apple-touch-icon"]')?.href ?? "",
    manifeste: document.querySelector('link[rel="manifest"]')?.href ?? "",
  }))

  // Sans `viewport-fit=cover`, AUCUN `env(safe-area-inset-*)` de l'app ne vaut
  // quoi que ce soit : ils rendent tous zéro, en silence.
  verifier("le viewport demande viewport-fit=cover", contrat.viewport.includes("viewport-fit=cover"),
    `viewport = « ${contrat.viewport} » — sans cover, les marges de l'encoche valent zéro sans rien dire`)
  verifier("les trois meta « sur l'écran d'accueil » sont servies",
    contrat.capable === "yes" && contrat.barre.length > 0 && contrat.titre.length > 0,
    `capable=${contrat.capable} barre=${contrat.barre} titre=${contrat.titre} — sans elles, l'ajout à l'écran d'accueil rouvre Safari au lieu du plein écran`)

  const icone = contrat.icone ? await fetch(contrat.icone) : null
  verifier("l'icône d'écran d'accueil existe VRAIMENT", !!icone && icone.ok && (icone.headers.get("content-type") ?? "").includes("image"),
    `apple-touch-icon = ${contrat.icone || "absent"} → ${icone ? icone.status : "aucune requête"} — déclarée mais introuvable, iOS mettrait une capture d'écran à la place`)

  const man = contrat.manifeste ? await fetch(contrat.manifeste) : null
  const manJson = man && man.ok ? await man.json().catch(() => null) : null
  verifier("le manifeste est servi et demande le plein écran", manJson?.display === "standalone",
    `manifeste = ${contrat.manifeste || "absent"} → display ${manJson?.display ?? "illisible"}`)

  // Le piège classique de Safari : `100vh` compte la barre d'adresse, donc le
  // bas de la page passe dessous. Tout le projet utilise `svh` — ce contrôle
  // refuse qu'un `100vh` revienne par une feuille de style.
  const styles = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((f) => { try { return [...f.cssRules].map((r) => r.cssText) } catch { return [] } })
      .filter((t) => /\b100vh\b/.test(t))
      .slice(0, 3),
  )
  verifier("aucune hauteur en 100vh dans les feuilles servies", styles.length === 0,
    `${styles.join(" | ")} — dans Safari, 100vh passe sous la barre d'adresse et coupe le bas de l'écran`)
  await ctx.close()
} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} contrôle(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
