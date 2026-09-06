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
  const coupees = page.locator("#notifs-coupees")
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

  // ── Coupées côté système : ne pas laisser dans une impasse ──
  verifier(
    "des notifications coupées par Android sont signalées",
    await coupees.getByText(/coupées dans les réglages du téléphone/).isVisible(),
  )
  verifier(
    "et l'écran d'Android s'ouvre depuis là",
    await coupees.getByRole("button", { name: "Ouvrir les réglages d'Android" }).isVisible(),
    "sans ce bouton, il faudrait aller chercher l'écran soi-même dans le téléphone",
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
  // Ce que ce contrôle protège, c'est l'ABSENCE de l'agenda et des mails, pas
  // un nombre : compter les interrupteurs le faisait échouer dès qu'on en
  // ajoutait un qui n'a rien à voir (« dire les rappels à voix haute », 5
  // sept.). On vise donc ce qui ne doit pas être là.
  for (const interdit of ["agenda", "rendez-vous", "mail", "e-mail"]) {
    verifier(
      `aucune notification « ${interdit} » : Google prévient déjà`,
      (await ok.getByRole("switch").filter({ hasText: new RegExp(interdit, "i") }).count()) === 0,
      "deux notifications pour la même chose, c'est une de trop",
    )
  }
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

  // ── Les sessions autonomes ──
  // Ça dépense son crédit et ça pousse du code pendant qu'il dort : il doit
  // pouvoir tout arrêter d'un geste, et distinguer « rien à faire cette nuit »
  // de « le déclencheur ne tourne plus ».
  const autonomes = page.locator("#autonomes")
  const autonomesVide = page.locator("#autonomes-vide")
  const autonomesSilence = page.locator("#autonomes-silence")
  const autonomesPanne = page.locator("#autonomes-panne")

  verifier(
    "l'interrupteur des sessions autonomes est là, et allumé par défaut",
    (await autonomes.getByLabel("Travailler sans moi").isVisible()) &&
      (await autonomes.getByLabel("Travailler sans moi").isChecked()),
    "sans lui, il ne peut arrêter les sessions qu'en nous le demandant",
  )
  verifier(
    "ce que la dernière passe a livré se lit sans déplier",
    await autonomes.getByText(/Sections repliables livrées/).first().isVisible(),
    "sinon il découvre au réveil du code sans savoir d'où il vient",
  )
  verifier(
    "une passe qui s'est retirée dit pourquoi",
    await autonomes.getByText(/Une session travaille déjà/).isVisible(),
  )

  await autonomes.getByLabel("Travailler sans moi").click()
  await pause(200)
  verifier(
    "l'éteindre le dit tout de suite à l'écran",
    await autonomes.getByText("Éteint", { exact: true }).isVisible(),
    "un interrupteur qui ne change rien à l'écran ne dit pas s'il a été pris en compte",
  )
  await autonomes.getByLabel("Travailler sans moi").click()
  await pause(200)

  verifier(
    "aucune passe encore enregistrée : l'écran vide est traité",
    await autonomesVide.getByText(/En attente de la première passe/).isVisible(),
  )
  verifier(
    "deux jours de silence ne se lisent PAS comme « rien à faire »",
    await autonomesSilence.getByText(/Plus rien ne passe/).isVisible(),
    "c'est exactement le cas où le déclencheur est mort sans que personne le voie",
  )
  verifier(
    "une lecture en échec ne se lit pas comme une absence de passe",
    await autonomesPanne.getByText(/Impossible de lire les passes/).isVisible(),
  )

  // ── La durée de conservation des conversations ──
  // Ce réglage EFFACE, à chaque phrase, sans corbeille. Ce qui compte à
  // l'écran n'est pas qu'il existe : c'est qu'il demande AVANT, et qu'il dise
  // combien de conversations vont disparaître.
  const memoire = page.locator("#memoire")
  const memoireVide = page.locator("#memoire-vide")
  const memoirePanne = page.locator("#memoire-panne")

  verifier(
    "la durée de conservation est réglable, sans limite comprise",
    (await memoire.getByRole("button", { name: "Garder Sans limite" }).isVisible()) &&
      (await memoire.getByRole("button", { name: "Garder 7 jours" }).isVisible()),
    "elle était écrite en dur dans une fonction SQL, invisible et impossible à changer",
  )
  verifier(
    "et le défaut ne détruit rien",
    (await memoire
      .getByRole("button", { name: "Garder Sans limite" })
      .getAttribute("aria-pressed")) === "true",
    "supprimer est irréversible, garder ne l'est pas",
  )
  verifier(
    "la carte dit combien de conversations sont gardées",
    await memoire.getByText(/4 conversations gardées/).isVisible(),
  )

  await memoire.getByRole("button", { name: "Garder 30 jours" }).click()
  await pause(250)
  verifier(
    "raccourcir la durée DEMANDE avant d'effacer",
    await page.getByText("Ne garder que 30 jours ?").isVisible(),
    "un appui de travers effacerait des mois de conversations, sans corbeille",
  )
  verifier(
    "et dit combien vont disparaître, nommément",
    await page.getByText(/2 conversations/).first().isVisible(),
    "« des conversations seront effacées » ne permet pas de décider",
  )
  await page.getByRole("button", { name: "Annuler" }).first().click()
  await pause(250)
  verifier(
    "annuler ne change rien",
    (await memoire
      .getByRole("button", { name: "Garder Sans limite" })
      .getAttribute("aria-pressed")) === "true",
  )

  await memoireVide.getByRole("button", { name: "Garder 7 jours" }).click()
  await pause(250)
  verifier(
    "sans rien à perdre, la fenêtre le dit au lieu d'annoncer une purge",
    await page.getByText(/Rien n'est effacé aujourd'hui/).isVisible(),
    "il renoncerait à un réglage qui ne détruit rien",
  )
  await page.getByRole("button", { name: "Annuler" }).first().click()
  await pause(250)

  await memoirePanne.getByRole("button", { name: "Garder 7 jours" }).click()
  await pause(250)
  verifier(
    "une lecture en échec ne se lit PAS comme « aucune conversation »",
    await page.getByText(/Impossible de dire combien/).isVisible(),
    "il confirmerait en croyant ne rien perdre, juste avant une purge qui efface tout",
  )
  await page.getByRole("button", { name: "Annuler" }).first().click()
  await pause(250)
  verifier(
    "et la carte signale l'incident au lieu de rester muette",
    await memoirePanne.getByText(/n'a pas pu être chargée/).isVisible(),
  )

  // ── Combien de SES tâches sonneront vraiment ──
  // Sa question du chantier 336be5fb : « les taches hors cockpit n'ont que des
  // dates d'échéance, est-ce que ça correspond au rappel ? » Mesuré chez lui
  // le 6 sept. : 4 sonneront sur 30, 22 n'ont pas de date, 4 sont en retard.
  // « 12 notifications programmées », juste en dessous, ne répond pas à ça :
  // ce compte mélange les échéances, les points du matin et le reste.
  verifier(
    "la carte dit combien de ses tâches feront réellement sonner quelque chose",
    await ok.getByText(/Sur tes 6 tâches à faire/).isVisible(),
    "il ne pouvait pas savoir si ses dates d'échéance déclenchaient quoi que ce soit",
  )
  verifier(
    "et pourquoi les autres ne sonneront pas",
    (await ok.getByText(/n'ont pas de date/).isVisible()) &&
      (await ok.getByText(/est en retard|sont en retard/).isVisible()),
    "« 2 sur 6 » sans explication laisse la question entière",
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

  // ── Les heures de silence ──
  verifier(
    "on peut faire taire la nuit sans perdre les rappels",
    await ok.getByText("Ne rien faire sonner la nuit", { exact: true }).isVisible(),
  )
  verifier(
    "et il est dit que le rappel s'affiche quand même",
    await ok.getByText(/sans bruit/).isVisible(),
    "sans cette phrase, on croirait supprimer le rappel",
  )
  verifier(
    "les deux bornes de la nuit se règlent",
    (await ok.getByText("À partir de", { exact: true }).isVisible()) &&
      (await ok.getByText("Jusqu'à", { exact: true }).isVisible()),
  )
  await ok.getByLabel("Ne rien faire sonner la nuit").click()
  await pause(200)
  verifier(
    "couper les heures de silence range leurs réglages",
    !(await ok.getByText("À partir de", { exact: true }).isVisible()),
  )
  await ok.getByLabel("Ne rien faire sonner la nuit").click()
  await pause(200)

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

  // ── Le mode Live, réglable depuis Paramètres ──
  const live = page.locator("#live")
  verifier(
    "le mode Live se règle depuis Paramètres",
    await live.getByLabel("Mode conversation Live").isVisible(),
  )
  verifier("aucun signal de relecture avant qu'on y touche", await live.getByText("signaux : 0").isVisible())
  await live.getByLabel("Mode conversation Live").click()
  await pause(250)
  verifier(
    "l'activer l'enregistre là où le micro le lit",
    (await page.evaluate(() => localStorage.getItem("jarvis_mode_live"))) === "1",
  )
  verifier(
    "et prévient le micro, qui garde son propre état",
    await live.getByText("signaux : 1").isVisible(),
    "sans ce signal, l'interrupteur n'aurait d'effet qu'au prochain lancement de l'app",
  )
  await live.getByLabel("Mode conversation Live").click()
  await pause(250)
  verifier(
    "et le couper revient au micro classique",
    (await page.evaluate(() => localStorage.getItem("jarvis_mode_live"))) === "0",
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

  // ── La page de confidentialité, atteignable depuis l'app ──
  const confid = page.locator("#confidentialite")
  const lien = confid.getByRole("link", { name: /Lire la page de confidentialité/ })
  verifier("la page de confidentialité est atteignable depuis Paramètres", await lien.isVisible())
  verifier(
    "et elle s'ouvre à côté, pas à la place de Jarvis",
    (await lien.getAttribute("target")) === "_blank" &&
      (await lien.getAttribute("href"))?.startsWith("https://"),
    "un fichier local ouvert dans la fenêtre de l'app remplacerait l'application, qui perdrait son état",
  )

  // ── L'assistant du téléphone : l'appui long sur la touche latérale ──
  // Ce qui compte ici n'est pas un calcul mais une PHRASE : quand Jarvis
  // n'apparaît pas dans la liste d'Android, la carte doit dire que la cause
  // est l'APK installée, sinon Raphaël cherche dans les réglages du téléphone
  // un réglage qui ne peut pas y être.
  const assistVieux = page.locator("#assistant-ancien")
  await assistVieux.getByText(/ne sait pas encore se déclarer/).waitFor({ timeout: 5000 })
  verifier(
    "APK trop ancienne : la carte dit que c'est la version installée qui bloque",
    await assistVieux.getByText(/ne sait pas encore se déclarer/).isVisible(),
  )
  verifier(
    "et qu'une mise à jour rapide n'y suffira pas",
    await assistVieux.getByText(/mise à jour rapide ne suffit pas/).isVisible(),
    "sans cette phrase, il appuie sur « Mettre à jour » et rien ne change",
  )

  // LE CAS RÉEL DU 6 SEPT. 2026 : l'activité ACTION_ASSIST est déclarée, donc
  // « candidat » est vrai — et Jarvis n'apparaît quand même pas dans la liste
  // de Samsung, qui ne regarde que le VoiceInteractionService. La carte doit
  // dire d'installer l'APK, pas « Jarvis peut être choisi ».
  const assistSansService = page.locator("#assistant-sans-service")
  verifier(
    "activité déclarée mais pas le service : la carte dit encore d'installer l'APK",
    await assistSansService.getByText(/ne sait pas encore se déclarer/).isVisible(),
    "c'est le cas qui lui a fait suivre le chemin pour rien le 6 sept.",
  )
  verifier(
    "et elle ne prétend PAS qu'il peut déjà être choisi",
    !(await assistSansService.getByText(/ce n'est pas lui pour l'instant/).isVisible()),
    "ce message-là devant une liste où Jarvis n'est pas est le pire des deux",
  )

  const assistCandidat = page.locator("#assistant-candidat")
  verifier(
    "APK à jour mais assistant non choisi : la carte le dit",
    await assistCandidat.getByText(/ce n'est pas lui pour l'instant/).isVisible(),
  )
  verifier(
    "et propose d'ouvrir le réglage d'Android",
    await assistCandidat.getByRole("button", { name: "Ouvrir le réglage Android" }).isVisible(),
  )
  verifier(
    "le chemin exact reste écrit : le bouton ne mène pas jusqu'au dernier écran",
    await assistCandidat.getByText(/Application d'assistant numérique par défaut/).isVisible(),
    "l'action qui irait pile dessus est protégée par une permission de signature",
  )

  const assistActif = page.locator("#assistant-actif")
  verifier(
    "quand Jarvis est l'assistant, la carte le confirme",
    await assistActif.getByText("Jarvis est l'assistant du téléphone.").isVisible(),
  )
  // ── L'ordre réel : à quelle hauteur commence la mise à jour ──
  // Raphaël, 5 sept. 2026 : « pour la mise à jour, il faut que je descende
  // tout en bas, essaye de la rehausser un petit peu, mais en la compactant ».
  // Mesuré plutôt que supposé, comme le cockpit l'a été le 4 sept.
  {
    const bloc = page.locator("#ordre-reel")
    const mesures = await bloc.evaluate((racine) => {
      const haut = racine.getBoundingClientRect().top
      const barres = [...racine.querySelectorAll(':scope > div > button[aria-expanded="false"]')]
      const bouton = [...racine.querySelectorAll("button")].find((b) =>
        /Mettre à jour maintenant|Télécharger/.test(b.textContent || ""),
      )
      return {
        boutonMaj: bouton ? Math.round(bouton.getBoundingClientRect().top - haut) : -1,
        hauteurAutresBarres: barres.reduce((n, b) => n + b.getBoundingClientRect().height + 8, 0),
        nbBarres: barres.length,
      }
    })

    verifier(
      "les neuf autres sections sont bien repliées",
      mesures.nbBarres === 9,
      `${mesures.nbBarres} barres repliées trouvées`,
    )
    verifier(
      "le bouton de mise à jour est dans le premier écran",
      mesures.boutonMaj >= 0 && mesures.boutonMaj < 400,
      `il commence à ${mesures.boutonMaj} points du haut de la liste`,
    )
    console.log(
      `      mesuré : bouton de mise à jour à ${mesures.boutonMaj} pts ; ` +
        `il était ${Math.round(mesures.hauteurAutresBarres)} pts plus bas quand la section fermait la page`,
    )
  }

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
