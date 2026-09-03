/**
 * Vérification du moteur d'écoute, dans un vrai navigateur, sans micro.
 *
 *   node scripts/verifier-ecoute-web.mjs
 *
 * Le script démarre Vite sur le banc d'essai (`scripts/harness/`), remplace
 * l'API de reconnaissance vocale du navigateur par un faux moteur qu'il
 * pilote au millième de seconde, et rejoue les situations réellement
 * signalées : le moteur qui coupe en pleine phrase, le silence, l'appui
 * volontaire sur le cœur.
 *
 * Ce que ça prouve : l'accumulation des segments, la relance automatique et
 * la décision de fin de tour. Ce que ça ne prouve pas : le comportement du
 * plugin Android, qui demande un vrai appareil.
 */

import { spawn } from "node:child_process"

const PORT = 5199
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

async function attendreServeur(essais = 60) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(`${BASE}/scripts/harness/index.html`)
      if (r.ok) return
    } catch {
      // pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error("Le serveur de dev n'a pas démarré.")
}

/** Faux moteur de reconnaissance vocale, injecté avant le chargement de la page. */
const FAUX_MOTEUR = `
class FauxMoteur {
  constructor() { window.__sr.instances.push(this); this.continuous = false; this.interimResults = false }
  start() {
    window.__sr.starts++
    // Un moteur qui refuse de démarrer lève tout de suite, sans déclencher
    // le moindre gestionnaire — cas réel : micro refusé, moteur déjà lancé.
    if (window.__sr.refuseDeDemarrer) throw new Error("moteur indisponible")
    this.actif = true
    setTimeout(() => this.onstart && this.onstart(), 0)
  }
  stop()  { this.actif = false; setTimeout(() => this.onend && this.onend(), 0) }
  abort() { this.stop() }
  /** Simule ce que le moteur a entendu. */
  dire(texte, final) {
    this.onresult && this.onresult({
      resultIndex: 0,
      results: [{ 0: { transcript: texte }, isFinal: final, length: 1 }],
    })
  }
  /** Simule Android qui coupe l'écoute de lui-même, sur une respiration. */
  finTouteSeule() { this.actif = false; this.onend && this.onend() }
}
window.__actifs = () => window.__sr.instances.filter((i) => i.actif).length
window.__sr = { instances: [], starts: 0, refuseDeDemarrer: false }
window.SpeechRecognition = FauxMoteur
window.webkitSpeechRecognition = FauxMoteur
window.__derniere = () => window.__sr.instances[window.__sr.instances.length - 1]
`

const chromium = await chargerChromium()
const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  stdio: "ignore",
})

let echecs = 0
const verifier = (nom, obtenu, attendu) => {
  const ok = obtenu === attendu
  if (!ok) echecs++
  console.log(
    `${ok ? "OK  " : "ÉCHEC"} ${nom}` +
      (ok ? "" : `\n      attendu « ${attendu} »\n      obtenu  « ${obtenu} »`),
  )
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

let navigateur
try {
  await attendreServeur()
  try {
    navigateur = await chromium.launch()
  } catch {
    navigateur = await chromium.launch({
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    })
  }
  const page = await navigateur.newPage()
  page.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE:", e.message)
  })
  await page.addInitScript(FAUX_MOTEUR)
  await page.goto(`${BASE}/scripts/harness/index.html`)
  await page.waitForFunction("typeof window.lancer === 'function'")
  const resultat = () => page.textContent("#resultat")

  // --- Le moteur coupe en pleine phrase, puis vrai silence ----------------
  await page.evaluate("window.lancer()")
  await page.waitForFunction("window.__sr.starts === 1")
  await page.evaluate("window.__derniere().dire(\"rappelle-moi d'appeler le plombier\", true)")
  await pause(300)
  await page.evaluate("window.__derniere().finTouteSeule()")

  await page
    .waitForFunction("window.__sr.starts === 2", null, { timeout: 3000 })
    .then(() => console.log("OK   le moteur est relancé au lieu de couper la phrase"))
    .catch(() => {
      echecs++
      console.log("ÉCHEC le moteur n'a pas été relancé")
    })

  await page.evaluate("window.__derniere().dire('avant vendredi matin', true)")
  await pause(2800)

  verifier(
    "phrase reconstituée après la coupure du moteur",
    await resultat(),
    "OK:rappelle-moi d'appeler le plombier avant vendredi matin",
  )
  verifier("aucune session inutile n'a été ouverte", await page.evaluate("window.__sr.starts"), 2)

  // --- Personne ne parle : on ne rend pas la main tout de suite ------------
  await page.evaluate("window.__sr.starts = 0")
  await page.evaluate("window.lancer()")
  await page.waitForFunction("window.__sr.starts >= 1")
  await pause(1000)
  await page.evaluate("window.__derniere().finTouteSeule()")
  await pause(1000)
  verifier("silence total : toujours à l'écoute avant le délai", await resultat(), "")

  // --- Un appui sur le cœur clôt le tour tout de suite ---------------------
  await page.evaluate("window.__sr.starts = 0")
  await page.evaluate("window.lancer()")
  await page.waitForFunction("window.__sr.starts >= 1")
  await page.evaluate("window.__derniere().dire('note que je passe a la banque', true)")
  await pause(300)
  const avant = Date.now()
  await page.evaluate("window.arreter()")
  await page
    .waitForFunction("document.querySelector('#resultat').textContent !== ''", null, {
      timeout: 2000,
    })
    .catch(() => {
      echecs++
      console.log("ÉCHEC l'appui sur le cœur n'a pas clos le tour")
    })
  verifier(
    "appui sur le cœur : le tour est rendu tel quel",
    await resultat(),
    "OK:note que je passe a la banque",
  )
  verifier(
    "appui sur le cœur : aucune session relancée pour rien",
    await page.evaluate("window.__sr.starts"),
    1,
  )
  verifier("appui sur le cœur : sans attendre le délai de silence", Date.now() - avant < 1500, true)
  // --- Le mot-clé coupe la rafale au vol ----------------------------------
  // Le réveil vocal ratait parce qu'il fallait attendre un résultat FINAL
  // d'Android pour savoir si « Jarvis » avait été dit. Ici le mot arrive dans
  // un résultat PARTIEL, au milieu d'une phrase : le tour doit se clore tout
  // de suite, sans attendre le silence.
  await page.evaluate("window.__sr.starts = 0")
  await page.evaluate("window.lancerMotCle()")
  await page.waitForFunction("window.__sr.starts >= 1")
  const avantMotCle = Date.now()
  await page.evaluate("window.__derniere().dire('eh jarvice tu m entends', false)")
  await page
    .waitForFunction("document.querySelector('#resultat').textContent !== ''", null, {
      timeout: 2000,
    })
    .catch(() => {
      echecs++
      console.log("ÉCHEC le mot-clé n'a pas clos la rafale")
    })
  verifier(
    "mot-clé reconnu dans un résultat partiel, malgré la transcription fautive",
    (await resultat()).startsWith("OK:"),
    true,
  )
  verifier(
    "mot-clé : la rafale se coupe sans attendre le silence",
    Date.now() - avantMotCle < 1500,
    true,
  )

  // --- Un moteur qui refuse de démarrer ne doit pas figer le micro --------
  // Régression réellement rencontrée : la phrase était entendue, le tour ne
  // se terminait jamais, et Jarvis restait sur « Préparation du micro… »
  // sans rien dire. Un tour doit toujours se terminer, quitte à échouer.
  await page.evaluate("window.__sr.refuseDeDemarrer = true")
  await page.evaluate("window.lancer()")
  await page
    .waitForFunction("document.querySelector('#resultat').textContent !== ''", null, {
      timeout: 5000,
    })
    .catch(() => {
      echecs++
      console.log("ÉCHEC le micro reste figé quand le moteur refuse de démarrer")
    })
  const echec = await resultat()
  verifier(
    "moteur qui refuse de démarrer : le tour se termine et le dit",
    echec.startsWith("ERR:"),
    true,
  )
  await page.evaluate("window.__sr.refuseDeDemarrer = false")

  // --- Test en direct du 3 sept., symptôme 4 : UN SEUL moteur à la fois ---
  // Un appui sur le cœur pendant la rafale du mot-clé lançait une seconde
  // reconnaissance par-dessus la première : micro qui clignote, tour écrasé.
  // La seconde écoute doit relever la première, et une seule rester active.
  await page.evaluate("window.__sr.starts = 0")
  await page.evaluate("window.lancerParDessus()")
  await pause(600)
  verifier("appui pendant la rafale : une seule reconnaissance active", await page.evaluate("window.__actifs()"), 1)
  await page.evaluate("window.__derniere().dire('ajoute une tache pour le plombier', true)")
  await pause(2800)
  verifier(
    "appui pendant la rafale : c'est bien la commande qui est entendue",
    await resultat(),
    "OK:ajoute une tache pour le plombier",
  )

  // --- Symptôme 2 : pendant la veille, ce qui suit « Jarvis » est transmis
  // au fil de l'eau, pas seulement à la fin de la rafale.
  await page.evaluate("window.lancerMotCle()")
  await page.waitForFunction("window.__actifs() === 1")
  await page.evaluate("window.__derniere().dire('bonjour', false)")
  await pause(100)
  await page.evaluate("window.__derniere().dire('bonjour jarvice mets la mus', false)")
  await pause(300)
  verifier(
    "veille : les partiels sont transmis pendant l'écoute",
    await page.evaluate("window.__partiels.length >= 2"),
    true,
  )
  await pause(500)

  // --- Symptôme 1 : le moteur refuse de démarrer en pleine veille — la
  // rafale doit se terminer TOUT DE SUITE, pas rester « allumée » 25 s.
  await page.evaluate("window.__sr.refuseDeDemarrer = true")
  const avantRefus = Date.now()
  await page.evaluate("window.lancerMotCle()")
  await page
    .waitForFunction("document.querySelector('#resultat').textContent !== ''", null, { timeout: 3000 })
    .catch(() => {
      echecs++
      console.log("ÉCHEC veille : le refus du moteur n'a pas été détecté")
    })
  verifier("veille : démarrage refusé → rendu en moins de 2 s", Date.now() - avantRefus < 2000, true)
  verifier("veille : démarrage refusé → c'est dit, pas avalé", (await resultat()).startsWith("ERR:"), true)
  await page.evaluate("window.__sr.refuseDeDemarrer = false")
} finally {
  await navigateur?.close()
  vite.kill()
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
