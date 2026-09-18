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
// Fausse synthèse vocale : Chromium sans haut-parleur ne termine jamais une
// lecture, et Jarvis attendrait la fin de sa phrase pour toujours.
Object.defineProperty(window, "speechSynthesis", {
  configurable: true,
  value: {
    cancel() {},
    getVoices() { return [] },
    speak(u) { setTimeout(() => { u.onstart && u.onstart(); u.onend && u.onend() }, 10) },
    onvoiceschanged: null,
  },
})
window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
`

const chromium = await chargerChromium()
// Le banc du cœur monte le vrai MicButton, qui charge le client Supabase au
// démarrage : sans ces deux variables il lève avant d'afficher quoi que ce
// soit. Des valeurs factices suffisent, rien ne part sur le réseau ici.
const vite = spawn("npx", ["vite", "--port", String(PORT), "--host", "127.0.0.1"], {
  stdio: "ignore",
  env: {
    ...process.env,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://banc-d-essai.invalid",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "banc-d-essai",
  },
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

  // --- Test du 4 sept. : « Jarvis, quelles sont mes tâches ? » → « Aucune
  // tâche trouvée » alors qu'il y en avait dix-neuf. La conversation ouverte
  // par le mot-clé tournait avec les données du PREMIER rendu, encore vides.
  // Le vrai MicButton, des tâches qui arrivent après le montage, et le
  // mot-clé dit une fois qu'elles sont là : la réponse doit les citer.
  const coeur = await navigateur.newPage()
  coeur.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE (cœur):", e.message)
  })
  await coeur.addInitScript(FAUX_MOTEUR)
  await coeur.goto(`${BASE}/scripts/harness/micbutton.html`)
  // La veille démarre d'elle-même (mot-clé activé) ; on attend qu'elle écoute
  // ET que les tâches soient chargées (400 ms après le montage).
  await coeur.waitForFunction("window.__sr && window.__sr.starts >= 1", null, { timeout: 10000 })
  await pause(900)
  await coeur.evaluate("window.__derniere().dire('jarvis quelles sont mes tâches', true)")
  await coeur
    .waitForFunction("document.body.textContent.includes('Jarvis :')", null, { timeout: 8000 })
    .catch(() => {
      echecs++
      console.log("ÉCHEC mot-clé : Jarvis n'a rien répondu")
    })
  // ── LE QUOTA, À CÔTÉ DU CŒUR ──
  // Sa demande : « rajouter le quota disponible a cote du cœur de jarvis,
  // leger ». Le banc monte un jour ordinaire (36 phrases, aucun refus, modèle
  // principal) : la ligne doit exister et rester DISCRÈTE.
  {
    const quota = coeur.locator("[data-quota]")
    verifier("le quota s'affiche à côté du cœur", (await quota.count()) === 1, true)
    if ((await quota.count()) === 1) {
      const ton = await quota.getAttribute("data-quota")
      const texte = (await quota.innerText()).trim()
      verifier("et un jour ordinaire il reste discret", ton === "discret", true)
      if (ton !== "discret") console.log(`      ton = ${ton}, texte = ${texte}`)
      verifier(
        "il tient sur une ligne, et n'invente aucun pourcentage",
        texte.length > 0 && texte.length <= 40 && !texte.includes("%"),
        true,
      )
      if (texte.includes("%") || texte.length > 40) console.log(`      texte = « ${texte} »`)
    }
  }

  const reponseCoeur = (await coeur.textContent("body")) ?? ""
  verifier(
    "mot-clé : la conversation voit les tâches chargées après le montage",
    reponseCoeur.includes("Tu as 2 tâches : Appeler le plombier, Payer l'arnona."),
    true,
  )
  if (!reponseCoeur.includes("Tu as 2 tâches")) console.log("      page :", reponseCoeur.replace(/\s+/g, " ").slice(0, 300))
  await coeur.close()

  // ── LA VEILLE RENONCE QUAND LE MICRO EST PRIS ──
  // Mesuré le 17 sept. 2026 sur son téléphone : 229 démarrages refusés
  // d'affilée sur 2 h 22, zéro écoute réelle, PENDANT qu'une pastille
  // clignotante promettait « Dis "Jarvis" quand tu veux ». Ce banc-là monte
  // le VRAI MicButton avec un moteur qui refuse toujours, et vérifie les deux
  // moitiés : ce qu'on cesse de faire (réclamer le micro sans fin) et ce
  // qu'on dit à la place.
  {
    const mort = await navigateur.newPage()
    mort.on("pageerror", (e) => {
      echecs++
      console.log("ERREUR DE PAGE (veille morte):", e.message)
    })
    await mort.addInitScript(FAUX_MOTEUR)
    // Avant le premier rendu : la toute première rafale doit déjà se heurter
    // au refus, sinon le compteur repart de zéro et le seuil n'est pas atteint.
    await mort.addInitScript("window.addEventListener('DOMContentLoaded', () => { window.__sr.refuseDeDemarrer = true })")
    await mort.goto(`${BASE}/scripts/harness/micbutton.html?abandon=3`)

    await mort
      .waitForFunction(
        "document.body.textContent.includes(\"j'ai arrêté d'insister\")",
        null,
        { timeout: 15000 },
      )
      .catch(() => {
        echecs++
        console.log("ÉCHEC veille : elle n'a jamais renoncé malgré des démarrages tous refusés")
      })

    const texteMort = (await mort.textContent("body")) ?? ""
    verifier(
      "elle ne promet plus « Dis « Jarvis » » pendant que le micro est pris",
      texteMort.includes("Dis « Jarvis »"),
      false,
    )
    verifier(
      "et elle dit par où reprendre",
      texteMort.includes("Touche le cœur pour reprendre."),
      true,
    )

    // LA MOITIÉ QUI COMPTE VRAIMENT : on a cessé de RÉCLAMER le micro. Un
    // message honnête au-dessus d'une boucle qui continue de faire sa
    // tonalité toutes les quatre secondes ne corrigerait rien.
    const avant = await mort.evaluate("window.__sr.starts")
    await pause(2500)
    const apres = await mort.evaluate("window.__sr.starts")
    verifier("et elle a vraiment cessé de rouvrir le micro", apres === avant, true)
    if (apres !== avant) console.log(`      ${avant} → ${apres} démarrages`)
    await mort.close()
  }

  // ── ET ELLE RENONCE MÊME SI L'APP PASSE EN ARRIÈRE-PLAN ENTRE-TEMPS ──
  // C'EST LE CONTRÔLE QUI MANQUAIT LE 17 SEPT., et son absence a coûté un
  // correctif entier : livré, mergé, arrivé sur son téléphone (version b326),
  // et sans le moindre effet. Le compteur de refus était une variable LOCALE
  // de la boucle de veille ; l'effet qui la porte se remonte dès que l'app
  // passe en arrière-plan, donc le compteur repartait de zéro toutes les 5 à
  // 13 rafales et le seuil n'était jamais atteint. Mesuré sur son journal le
  // 18 sept. : UNE chaîne de 159 refus d'affilée, zéro abandon.
  {
    const fond = await navigateur.newPage()
    fond.on("pageerror", (e) => {
      echecs++
      console.log("ERREUR DE PAGE (arrière-plan):", e.message)
    })
    await fond.addInitScript(FAUX_MOTEUR)
    await fond.addInitScript("window.addEventListener('DOMContentLoaded', () => { window.__sr.refuseDeDemarrer = true })")
    await fond.goto(`${BASE}/scripts/harness/micbutton.html?abandon=6`)

    // On remonte la boucle toutes les deux secondes, comme le fait Android
    // quand l'écran s'éteint ou qu'il change d'application. Un compteur local
    // ne dépasse jamais deux ou trois dans une fenêtre aussi courte (le
    // palier montant impose 700 ms, puis 1400) ; seul un compteur qui SURVIT
    // au remontage peut atteindre six.
    const cycle = setInterval(() => {
      fond
        .evaluate(`
          const cache = document.visibilityState === "visible"
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (cache ? "hidden" : "visible") })
          document.dispatchEvent(new Event("visibilitychange"))
        `)
        .catch(() => {})
    }, 2000)

    let renonce = true
    await fond
      .waitForFunction("document.body.textContent.includes(\"j'ai arrêté d'insister\")", null, { timeout: 30000 })
      .catch(() => {
        renonce = false
      })
    clearInterval(cycle)
    verifier("le compteur de refus survit au remontage de la boucle", renonce, true)
    await fond.close()
  }

  // ── COUPURE PROACTIVE : L'APP PERD LE PREMIER PLAN PENDANT QUE LE MICRO
  //    ÉCOUTE (chantier 7a6e75c4, 18 sept. 2026) ──
  // Sa demande : « j'ouvre WhatsApp et je lance une note vocale » ne doit pas
  // laisser la veille insister. Ici le moteur accepte de démarrer normalement
  // (pas de refus) : le micro est réellement ouvert, la veille attend le
  // mot-clé — exactement le moment où une autre application prend le premier
  // plan. La coupure doit être IMMÉDIATE, pas après vingt refus comme dans
  // le banc précédent, et la veille ne doit PAS reprendre toute seule au
  // retour : Touche le cœur pour reprendre.
  {
    const conflit = await navigateur.newPage()
    conflit.on("pageerror", (e) => {
      echecs++
      console.log("ERREUR DE PAGE (conflit micro) :", e.message)
    })
    await conflit.addInitScript(FAUX_MOTEUR)
    await conflit.goto(`${BASE}/scripts/harness/micbutton.html`)
    await conflit.waitForFunction("window.__actifs() === 1", null, { timeout: 10000 })

    const avantConflit = Date.now()
    await conflit.evaluate(`
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
      document.dispatchEvent(new Event("visibilitychange"))
    `)
    await conflit
      .waitForFunction("document.body.textContent.includes(\"j'ai arrêté d'insister\")", null, { timeout: 3000 })
      .catch(() => {
        echecs++
        console.log("ÉCHEC conflit micro : la veille n'a pas coupé quand l'app a perdu le premier plan")
      })
    verifier(
      "conflit micro : coupée tout de suite, pas après vingt refus",
      Date.now() - avantConflit < 1500,
      true,
    )
    verifier("conflit micro : le micro est bien relâché", await conflit.evaluate("window.__actifs()"), 0)

    // Retour au premier plan : elle ne doit PAS reprendre toute seule.
    const departsAvant = await conflit.evaluate("window.__sr.starts")
    await conflit.evaluate(`
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
      document.dispatchEvent(new Event("visibilitychange"))
    `)
    await pause(1000)
    const departsApres = await conflit.evaluate("window.__sr.starts")
    verifier("conflit micro : retour au premier plan → pas de reprise automatique", departsApres, departsAvant)
    verifier(
      "conflit micro : elle attend toujours un appui sur le cœur",
      (await conflit.textContent("body"))?.includes("Touche le cœur pour reprendre.") ?? false,
      true,
    )
    await conflit.close()
  }
} finally {
  await navigateur?.close()
  vite.kill()
}

console.log(echecs === 0 ? "\nTout est vert." : `\n${echecs} vérification(s) en échec.`)
process.exit(echecs === 0 ? 0 : 1)
