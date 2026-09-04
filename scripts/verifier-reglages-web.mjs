/**
 * Parcourt les réglages dans un vrai navigateur, à la taille d'un téléphone.
 *
 *   node scripts/verifier-reglages-web.mjs
 *
 * Aucune base, aucun Android : le banc (`scripts/harness/reglages.tsx`) monte
 * les VRAIES cartes « Quand Jarvis te dérange » et « Mettre à jour
 * l'application » avec un état factice.
 *
 * Ce que ça prouve, et que verifier-notifications.ts et verifier-maj-web.ts
 * ne peuvent pas prouver : ce qu'on voit et ce qu'on peut faire à l'écran. Un
 * interrupteur qui ne bascule pas, un réglage d'heure qui n'apparaît pas
 * quand on active la ligne, un « Tout annuler » qui annulerait sans demander,
 * un refus de mise à jour rapide qui ne dirait pas pourquoi, une carte qui
 * déborde en largeur : aucun de ces cinq-là ne se voit dans une fonction qui
 * renvoie la bonne valeur.
 */
import { spawn } from "node:child_process"

const PORT = 5202
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
      const r = await fetch(`${BASE}/scripts/harness/reglages.html`)
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
  await page.goto(`${BASE}/scripts/harness/reglages.html`)
  await page.waitForSelector("text=Quand Jarvis te dérange")

  const refuse = page.locator("#notifs-refuse")
  const ok = page.locator("#notifs-ok")
  const alarmes = page.locator("#notifs-alarmes")
  const rapide = page.locator("#maj-rapide")
  const parApk = page.locator("#maj-apk")

  // ── Permission : on demande avant de promettre quoi que ce soit ──
  verifier(
    "sans permission, l'écran propose de l'accorder",
    await refuse.getByRole("button", { name: "Autoriser les notifications" }).isVisible(),
  )
  verifier(
    "et n'affiche aucun interrupteur qui ne commanderait rien",
    !(await refuse.getByText("Le point du matin", { exact: true }).isVisible()),
    "des réglages sans effet, c'est pire que pas de réglages : on croirait avoir coupé quelque chose",
  )

  // ── Ce qu'Android peut retarder, il faut le dire ──
  verifier(
    "l'autorisation « alarmes et rappels » manquante est signalée",
    await alarmes.getByText(/Alarmes et rappels/).isVisible(),
    "sans elle un rappel de 14 h peut sonner à 14 h 40, et rien ne le dirait",
  )

  // ── Les cinq notifications qu'il a acceptées, et elles seules ──
  for (const ligne of [
    "L'heure d'une tâche arrive",
    "Le point du matin",
    "Une nouvelle version de l'app",
    "Une session a livré des chantiers",
    "Une session est bloquée et t'attend",
  ]) {
    verifier(`« ${ligne} » est réglable`, await ok.getByText(ligne, { exact: true }).first().isVisible())
  }
  verifier(
    "cinq interrupteurs, pas six : ni agenda ni mail",
    (await ok.getByRole("switch").count()) === 5,
    "Google prévient déjà pour l'agenda et les mails ; deux notifications pour la même chose, c'est une de trop",
  )
  verifier(
    "et la raison de leur absence est écrite",
    await ok.getByText(/Google prévient déjà/).isVisible(),
    "sinon on croirait à un oubli, et on la reposerait dans six mois",
  )

  // ── Un interrupteur bascule vraiment, et son détail suit ──
  verifier("l'heure du point du matin est visible", await ok.getByText("À quelle heure", { exact: true }).isVisible())
  await ok.getByLabel("Le point du matin").click()
  await pause(200)
  verifier(
    "couper le point du matin range son réglage d'heure",
    !(await ok.getByText("À quelle heure", { exact: true }).isVisible()),
    "l'interrupteur n'a pas basculé, ou le détail reste affiché sans commander quoi que ce soit",
  )
  await ok.getByLabel("Le point du matin").click()
  await pause(200)
  verifier(
    "le rallumer le ramène",
    await ok.getByText("À quelle heure", { exact: true }).isVisible(),
  )

  verifier(
    "l'avance sur l'échéance est réglable",
    await ok.getByText("Me prévenir", { exact: true }).isVisible(),
  )
  verifier(
    "et l'heure d'une tâche datée sans heure aussi",
    await ok.getByText("Tâche datée sans heure", { exact: true }).isVisible(),
    "la plupart des tâches dictées n'ont qu'une date : sans ce réglage, elles sonneraient à une heure imposée",
  )

  // ── Ce qui est programmé se voit, et s'annule en le demandant ──
  verifier(
    "le nombre de notifications programmées s'affiche",
    await ok.getByText(/12 notifications programmées/).isVisible(),
  )
  verifier("et la prochaine aussi", await ok.getByText(/Prochaine/).isVisible())
  verifier(
    "l'état vide se dit au lieu de rester muet",
    await alarmes.getByText("Aucune notification programmée pour l'instant.").isVisible(),
  )

  await ok.getByRole("button", { name: "Tout annuler" }).click()
  await pause(200)
  verifier(
    "« Tout annuler » demande confirmation",
    await ok.getByRole("button", { name: "Confirmer l'annulation" }).isVisible(),
    "un appui de travers ferait taire tous les rappels sans un mot",
  )
  await ok.getByRole("button", { name: "Annuler" }).click()
  await pause(200)
  verifier(
    "et on peut se raviser",
    !(await ok.getByRole("button", { name: "Confirmer l'annulation" }).isVisible()),
  )

  verifier(
    "un bouton permet de prouver que ça marche sur CE téléphone",
    await ok.getByRole("button", { name: "Tester" }).isVisible(),
  )

  // ── La mise à jour : rapide quand c'est possible, franche quand ça ne l'est pas ──
  verifier(
    "quand la mise à jour rapide est possible, c'est elle qu'on propose",
    await rapide.getByRole("button", { name: "Mettre à jour maintenant" }).isVisible(),
  )
  verifier(
    "les deux versions sont affichées, l'installée et la publiée",
    (await rapide.getByText("Application installée").isVisible()) &&
      (await rapide.getByText("Dernière version publiée").isVisible()),
    "une installation sans effet doit se voir tout de suite",
  )
  verifier(
    "l'automatisme se coupe depuis l'écran",
    await rapide.getByText("Appliquer les mises à jour rapides toute seule").isVisible(),
  )

  verifier(
    "quand elle ne l'est pas, on propose l'APK",
    await parApk.getByRole("button", { name: "Mettre à jour" }).isVisible(),
  )
  verifier(
    "et on dit pourquoi",
    await parApk.getByText(/touche le cœur de l'application/).isVisible(),
    "sinon la promesse « plus besoin de réinstaller » passerait pour cassée",
  )
  verifier(
    "on peut revenir à la version installée",
    await parApk.getByRole("button", { name: "Revenir à la version installée" }).isVisible(),
    "une mise à jour rapide qui se comporte mal doit pouvoir être défaite depuis l'app",
  )
  await parApk.getByRole("button", { name: "Revenir à la version installée" }).click()
  await pause(200)
  verifier(
    "et ce retour demande confirmation",
    await parApk.getByRole("button", { name: "Confirmer le retour" }).isVisible(),
  )

  // ── La recherche : ce qui répond s'affiche déplié, le reste disparaît ──
  const recherche = page.locator("#recherche")
  verifier(
    "la section cherchée s'affiche DÉPLIÉE",
    await recherche.getByText("Contenu notifications").isVisible(),
    "trouver une section pour devoir la déplier ensuite ne fait pas gagner un geste",
  )
  verifier(
    "et les autres disparaissent",
    !(await recherche.getByText("Contenu voix").isVisible()) &&
      !(await recherche.getByText("Voix et écoute").isVisible()),
  )

  // ── Le thème : la palette sombre existait, rien ne pouvait l'allumer ──
  const theme = page.locator("#theme")
  verifier(
    "les trois choix de thème sont proposés",
    (await theme.getByRole("button", { name: "Clair" }).isVisible()) &&
      (await theme.getByRole("button", { name: "Sombre" }).isVisible()) &&
      (await theme.getByRole("button", { name: "Comme le téléphone" }).isVisible()),
  )
  await theme.getByRole("button", { name: "Sombre" }).click()
  await pause(300)
  verifier(
    "choisir « Sombre » allume vraiment la palette sombre",
    await page.evaluate(() => document.documentElement.classList.contains("dark")),
    "la classe « dark » n'est pas posée : les quarante couleurs du bloc .dark restent lettre morte",
  )
  verifier(
    "et le choix est enregistré là où la synchro le lira",
    (await page.evaluate(() => localStorage.getItem("jarvis_theme"))) === "dark",
    "sans ça il serait perdu à la prochaine réinstallation",
  )
  await theme.getByRole("button", { name: "Clair" }).click()
  await pause(300)
  verifier(
    "et on peut revenir en clair",
    !(await page.evaluate(() => document.documentElement.classList.contains("dark"))),
  )

  // ── Remettre les réglages par défaut ──
  await page.evaluate(() => localStorage.setItem("jarvis_voice_rate", "1.75"))
  const reinit = page.locator("#reinit")
  await reinit.getByRole("button", { name: "Remettre les réglages par défaut" }).click()
  await pause(200)
  verifier(
    "la remise à zéro demande confirmation",
    await reinit.getByText("Ce qui repart à zéro :").isVisible(),
    "effacer tous les réglages d'un appui de travers serait irrattrapable",
  )
  verifier(
    "et dit ce qu'elle NE touche pas",
    await reinit.getByText(/tes tâches, tes chantiers/).isVisible(),
    "sans ça on croirait effacer ses données",
  )
  verifier(
    "rien n'est effacé tant qu'on n'a pas confirmé",
    (await page.evaluate(() => localStorage.getItem("jarvis_voice_rate"))) === "1.75",
  )
  await reinit.getByRole("button", { name: "Confirmer la remise à zéro" }).click()
  await pause(300)
  verifier(
    "confirmer efface pour de bon",
    (await page.evaluate(() => localStorage.getItem("jarvis_voice_rate"))) === null,
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
