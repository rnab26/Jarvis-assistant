/**
 * Le cockpit monté sur les VRAIES données de Raphaël, dans un vrai navigateur,
 * à la taille d'un téléphone.
 *
 *   scripts/verifier-cockpit-reel.mjs
 *
 * PAS DANS LA CI, et c'est voulu : il lit la base avec `scripts/sql.sh`, donc
 * il ne tourne que là où la clé de service existe. À lancer à la main après
 * avoir touché au cockpit.
 *
 * POURQUOI IL EXISTE, alors que `verifier-cockpit-web.mjs` monte déjà le vrai
 * tableau. Parce que les données inventées d'un banc sont trop sages. Le
 * 5 sept. 2026, ce script-ci a trouvé ce que l'autre ne pouvait pas voir : sur
 * ses vraies données — 196 chantiers, 12 sections, 49 chantiers livrés dans la
 * journée, une question en attente dont le « pourquoi » fait un paragraphe —
 * la carte « Ce qui attend ta décision » faisait 616 points de haut pour UN
 * point, et repoussait le tableau des chantiers à 1 382 points. Sur le banc à
 * quatre lignes, elle en faisait 200. Les points ont été repliés sur leur
 * question ; la carte est retombée à 200 points, et le tableau à 966.
 *
 * Ce qu'il mesure n'est donc PAS « le tableau tient dans le premier écran » :
 * un jour où 49 chantiers ont été livrés et où dix choses l'attendent, le
 * tableau n'est pas ce qu'il doit voir en premier. Ce qui doit y tenir, c'est
 * la réponse à « où j'en suis » — le bloc du même nom et ce qui attend sa
 * décision.
 */
import { spawn } from "node:child_process"
import { execFileSync } from "node:child_process"

const PORT = 5298
const BASE = `http://127.0.0.1:${PORT}`

/** Les vraies données, lues à l'instant. Jamais commitées : elles
 * vieilliraient en une journée, et c'est justement leur fraîcheur qui fait la
 * valeur de ce banc. */
function lireLaBase() {
  const requete =
    "select json_build_object(" +
    "'chantiers', (select coalesce(json_agg(row_to_json(i)), '[]'::json) from dev_items i), " +
    "'sections', (select coalesce(json_agg(row_to_json(s)), '[]'::json) from dev_sections s), " +
    "'messages', (select coalesce(json_agg(row_to_json(m)), '[]'::json) from (select * from dev_log order by created_at desc limit 60) m)) as fixture"
  const brut = execFileSync("scripts/sql.sh", [requete], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const reponse = JSON.parse(brut)
  if (!reponse.ok || !reponse.rows?.[0]?.fixture) {
    throw new Error("La base n'a rien renvoyé : SUPABASE_SERVICE_ROLE_KEY est-elle en place ?")
  }
  return reponse.rows[0].fixture
}

const FIXTURE = lireLaBase()
console.log(
  `Données réelles : ${FIXTURE.chantiers.length} chantiers, ${FIXTURE.sections.length} sections, ${FIXTURE.messages.length} messages.\n`,
)

async function chargerChromium() {
  for (const c of ["playwright", "/opt/node22/lib/node_modules/playwright/index.js"]) {
    try { const m = await import(c); const ch = m.chromium ?? m.default?.chromium; if (ch) return ch } catch {}
  }
  throw new Error("pas de playwright")
}
async function attendre() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/scripts/harness/cockpit.html`); if (r.ok) return } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("serveur ko")
}
const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  stdio: "ignore",
  env: { ...process.env, VITE_SUPABASE_URL: "https://banc.invalid", VITE_SUPABASE_ANON_KEY: "banc" },
})
let echecs = 0
const verifier = (n, ok, d = "") => { if (!ok) echecs++; console.log(`${ok ? "OK   " : "ÉCHEC"} ${n}${ok ? "" : `\n      ${d}`}`) }
let nav
try {
  await attendre()
  const chromium = await chargerChromium()
  try { nav = await chromium.launch() } catch { nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }) }
  const page = await nav.newPage({ viewport: { width: 390, height: 844 } })
  page.on("pageerror", (e) => { echecs++; console.log("ERREUR DE PAGE:", e.message) })
  await page.addInitScript((f) => { window.__FIXTURE_REELLE = f }, FIXTURE)
  await page.goto(`${BASE}/scripts/harness/cockpit.html`)
  await page.waitForSelector("text=Où j'en suis")
  await new Promise((r) => setTimeout(r, 900))

  verifier("« Où j'en suis » s'affiche sur les vraies données", await page.getByText("Où j'en suis").first().isVisible())

  const lignes = await page.getByRole("button", { name: /^Où en est / }).count()
  verifier(
    "il montre quelques sections, pas un mur",
    lignes > 0 && lignes <= 5,
    `${lignes} lignes visibles : avec douze sections, les lister toutes ferait revenir le mur qu'on essaie de supprimer`,
  )

  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  verifier("rien ne déborde en largeur sur les vrais titres", debordement <= 0, `${debordement} points de trop`)

  const carte = await page.evaluate(() => {
    const t = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Où j'en suis")
    const c = t?.closest('[data-slot="card"]')
    return c ? { haut: Math.round(c.getBoundingClientRect().top), bas: Math.round(c.getBoundingClientRect().bottom) } : null
  })
  verifier("et il tient dans le premier écran", carte && carte.bas <= 844, JSON.stringify(carte))

  const regionTop = await page.evaluate(() => {
    const r = document.querySelector('[aria-label="Chantiers"]')
    return r ? Math.round(r.getBoundingClientRect().top) : -1
  })
  console.log(`      mesuré sur les vraies données : le tableau des chantiers commence à ${regionTop} points`)
  // Sur un jour où 49 chantiers ont été livrés et où 10 choses l'attendent,
  // le tableau des chantiers N'EST PAS ce qu'on veut voir en premier : la
  // réponse à « où j'en suis » l'est. Ce qui doit tenir dans le premier écran,
  // c'est donc « Où j'en suis » + « Ce qui attend ta décision ».
  const basDecisions = await page.evaluate(() => {
    const cartes = [...document.querySelectorAll('[data-slot="card"]')]
    const c = cartes.find((e) => /Ce qui attend ta décision/.test(e.textContent ?? ""))
    return c ? Math.round(c.getBoundingClientRect().bottom) : null
  })
  // `null` = la carte n'existe pas, parce que rien n'attend sa décision. C'est
  // le bon comportement, pas un échec : on retombe alors sur « Où j'en suis »,
  // qui doit tenir seul dans le premier écran.
  verifier(
    "« Où j'en suis » et ce qui attend sa décision tiennent ensemble dans le premier écran",
    (basDecisions ?? carte?.bas ?? 9999) <= 844,
    basDecisions === null
      ? `rien n'attend sa décision, et « Où j'en suis » se termine à ${carte?.bas} points`
      : `ils se terminent à ${basDecisions} points sur 844`,
  )

  // ET LE MÊME ÉCRAN UNE FOIS LE BANDEAU REFERMÉ. « Depuis ton dernier
  // passage » est TRANSIENT : il disparaît dès qu'il appuie sur « Vu », et
  // c'est la première chose sur laquelle il agit. Sans cette seconde mesure,
  // on ne sait pas si le débordement vient du bandeau (auquel cas il se règle
  // tout seul en un appui) ou des cartes elles-mêmes (auquel cas il faut
  // reprendre de la place). Mesuré le 17 sept. : 1102 avec, 770 sans.
  const bandeauVu = page.getByRole("button", { name: "Vu" }).first()
  if (await bandeauVu.isVisible().catch(() => false)) {
    await bandeauVu.click()
    await new Promise((r) => setTimeout(r, 300))
    const basApresVu = await page.evaluate(() => {
      const cartes = [...document.querySelectorAll('[data-slot="card"]')]
      const c = cartes.find((e) => /Ce qui attend ta décision/.test(e.textContent ?? ""))
      const t = [...document.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Où j'en suis")
      const ou = t?.closest('[data-slot="card"]')
      return Math.round((c ?? ou)?.getBoundingClientRect().bottom ?? 9999)
    })
    verifier(
      "et une fois le bandeau « Vu » refermé, ils tiennent vraiment",
      basApresVu <= 844,
      `${basApresVu} points sur 844 — le débordement ne vient donc pas que du bandeau`,
    )
  }

  const cartes = await page.evaluate(() => {
    const racine = document.getElementById("root").firstElementChild
    return [...racine.children].map((el) => ({
      h: Math.round(el.getBoundingClientRect().height),
      top: Math.round(el.getBoundingClientRect().top),
      txt: (el.textContent ?? "").slice(0, 46).replace(/\s+/g, " "),
    }))
  })
  for (const c of cartes) console.log(`      ${String(c.top).padStart(5)}  h=${String(c.h).padStart(4)}  ${c.txt}`)

  // On déplie chaque ligne : c'est là que les vrais titres et les vraies notes cassent.
  for (let i = 0; i < lignes; i++) {
    await page.getByRole("button", { name: /^Où en est / }).nth(i).click()
    await new Promise((r) => setTimeout(r, 150))
  }
  const debordement2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  verifier("ni une fois toutes les lignes dépliées", debordement2 <= 0, `${debordement2} points de trop`)

  // Régression trouvée par Raphaël le 17 sept. 2026 (chantier 4be6b04c) sur
  // le VRAI chantier 6d94ab6a : « Dernière mise à jour » affichait une note
  // administrative de rangement de sections au lieu de la vraie question à
  // trancher. On le cherche par son titre réel, on le déplie, et on vérifie
  // ce qu'affiche VRAIMENT le cockpit — pas une donnée inventée.
  await page.getByLabel("Chercher un chantier").fill("enregistrement du comportement")
  await new Promise((r) => setTimeout(r, 300))
  const ligne6d94ab6a = page.getByRole("button", { name: /Dans le cockpit dev sur l'enregistrement/ }).first()
  if (await ligne6d94ab6a.isVisible().catch(() => false)) {
    await ligne6d94ab6a.click()
    await new Promise((r) => setTimeout(r, 150))
    const texteChantier = await ligne6d94ab6a.innerText()
    // Le contenu réel de ce chantier bouge au fil des sessions (Raphaël y a
    // répondu depuis le signalement du 17 sept.) : on ne fige donc pas le
    // texte exact, seulement l'invariant que le bug visait — le rangement de
    // sections, purement administratif, ne doit jamais être ce qui s'affiche.
    verifier(
      "6d94ab6a déplié ne montre jamais le rangement de sections comme dernière mise à jour",
      !/rangement des sections/.test(texteChantier),
      `texte affiché : ${JSON.stringify(texteChantier)}`,
    )
  } else {
    console.log("      6d94ab6a introuvable dans les vraies données (archivé, ou déjà corrigé autrement) — vérification sautée")
  }
  await page.getByLabel("Effacer la recherche").click().catch(() => {})

  const texte = await page.locator("body").innerText()
  console.log("      en tête :", texte.split("\n").slice(0, 14).map((l) => l.trim()).filter(Boolean).join(" | "))
} finally { if (nav) await nav.close(); vite.kill() }
console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} échec(s).`)
process.exit(echecs === 0 ? 0 : 1)
