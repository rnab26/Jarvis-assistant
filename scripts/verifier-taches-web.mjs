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

  // ── Ce qu'il a dicté sans réseau ─────────────────────────────────────────
  // Sa crainte du chantier b5411c23, et la règle du 6 sept. : « on n'annonce
  // jamais au passé ce qu'on n'a pas constaté — ni à l'oral, ni dans un toast,
  // ni dans une étiquette d'écran ». La moitié de ces contrôles vérifie donc
  // ce qui NE doit PAS être dit.
  {
    const rien = page.locator("#attente-rien")
    verifier(
      "rien en attente : la carte ne s'affiche pas du tout",
      (await rien.locator("*").count()) === 0,
      "un bandeau « 0 en attente » use le signal qui doit servir le jour où il y en a",
    )

    const attente = page.locator("#attente")
    verifier(
      "une dictée non enregistrée se voit",
      await attente.getByText(/1 chose en attente d'envoi/).isVisible(),
    )
    const texte = (await attente.innerText()).replace(/\s+/g, " ")
    verifier(
      "et on ne lui dit JAMAIS que c'est enregistré",
      !/\b(c'est|est|a été|j'ai)\s+(bien\s+)?enregistr/i.test(texte) &&
        /pas encore enregistr/i.test(texte),
      `la carte affiche : ${texte.slice(0, 140)}`,
    )
    verifier(
      "elle dit ce qui va se passer, et quand",
      /dès que tu as du réseau/.test(texte),
    )

    const bloque = page.locator("#attente-bloque")
    verifier(
      "un envoi abandonné ne se lit pas comme une simple attente",
      await bloque.getByText(/n'a pas pu être enregistrée après plusieurs essais/).isVisible(),
    )

    const illisible = page.locator("#attente-illisible")
    verifier(
      "un tampon illisible ne se lit PAS comme « rien en attente »",
      await illisible.getByText(/Ce n'est pas « rien en attente » : je ne sais pas/).isVisible(),
      "lui dire que tout va bien alors qu'on n'en sait rien est la panne qu'on supprime",
    )
  }

  {
    // Sur la LIGNE, c'est là qu'il agit.
    const lignes = page.locator("#lignes-attente")
    verifier(
      "la ligne porte l'étiquette « en attente d'envoi »",
      await lignes.getByText("en attente d'envoi").isVisible(),
    )
    verifier(
      "et celle qu'on a cessé de renvoyer dit « pas enregistrée »",
      await lignes.getByText("pas enregistrée", { exact: true }).isVisible(),
    )
    verifier(
      "la raison du blocage est écrite en clair",
      await lignes.getByText(/Pas enregistrée après plusieurs essais : Failed to fetch/).isVisible(),
      "« ça n'a pas marché » sans dire pourquoi ne permet ni de comprendre ni de rattraper",
    )
    verifier(
      "aucune case à cocher sur une ligne qui n'existe pas encore en base",
      (await lignes.getByLabel("Marquer comme faite").count()) === 0,
      "la cocher échouerait à coup sûr : un contrôle mort ne doit pas s'afficher",
    )
    verifier(
      "il peut réessayer d'un appui",
      await lignes.getByLabel("Réessayer d'enregistrer").first().isVisible(),
    )

    // Abandonner détruit la dictée : ça demande avant, comme partout ailleurs.
    await lignes.getByLabel("Abandonner").first().click()
    await pause(300)
    verifier(
      "abandonner une dictée demande confirmation",
      await page.getByText(/n'a jamais été enregistrée/).isVisible(),
      "sans ça, sa dictée disparaît au premier appui, à trois millimètres du bouton Réessayer",
    )
    await page.getByRole("button", { name: "Annuler" }).last().click()
    await pause(300)
  }

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

  // ── « AUCUN MOYEN D'ACTUALISER » ──
  // Sa plainte du 7 sept. 2026, chantier ce69489b : « Les taches ne
  // s'affichent pas en live et il n'y a aucun moyen d'actualiser ». La
  // seconde moitié était vraie sans réserve : `refresh` n'était atteignable
  // que depuis l'écran d'erreur, donc jamais quand le chargement avait RÉUSSI
  // et que c'est le direct qui était tombé.
  //
  // LA MOITIÉ DE CES CONTRÔLES VÉRIFIE LE SILENCE. Un bandeau orange qui
  // s'allume à chaque ouverture n'est plus lu du tout le jour où il compte.
  {
    // `data-etat` est porté par le composant lui-même, pas par le conteneur
    // du banc : viser le conteneur rendait `null`, c'est-à-dire rouge pour une
    // mauvaise raison.
    const barre = page.locator("#barre-direct [data-etat]")
    verifier(
      "quand le direct marche, la barre ne crie pas",
      (await barre.getAttribute("data-etat")) === "discret" &&
        (await barre.innerText()).includes("À jour"),
      await barre.innerText(),
    )
    verifier(
      "mais le bouton Actualiser est là quand même",
      await barre.getByRole("button", { name: "Actualiser la liste" }).isVisible(),
      "« aucun moyen d'actualiser » était la moitié de sa plainte",
    )

    await barre.getByRole("button", { name: "Actualiser la liste" }).click()
    await pause(200)
    verifier(
      "et il fait quelque chose",
      (await page.locator("#appuis-actualiser").innerText()).includes("1"),
      await page.locator("#appuis-actualiser").innerText(),
    )

    // Le direct tombe : c'est LE cas qui était parfaitement muet.
    await page.getByRole("button", { name: "banc: couper" }).click()
    await pause(200)
    const texteCoupe = await barre.innerText()
    verifier(
      "une coupure du direct se voit",
      (await barre.getAttribute("data-etat")) === "alerte" &&
        /coupées/i.test(texteCoupe),
      texteCoupe,
    )
    verifier(
      "et elle dit depuis quand la liste peut mentir",
      /il y a 12 min/.test(texteCoupe),
      `${texteCoupe} — sans l'âge, il ne sait pas si c'est grave`,
    )

    // Pendant un rechargement, on le DIT : un bouton qui ne répond pas se lit
    // comme un bouton mort, et il appuie six fois.
    await page.getByRole("button", { name: "banc: en cours" }).click()
    await pause(200)
    verifier(
      "pendant l'actualisation, le bouton se verrouille et le dit",
      (await barre.innerText()).includes("Actualisation…") &&
        (await barre.getByRole("button", { name: "Actualiser la liste" }).isDisabled()),
      await barre.innerText(),
    )
    await page.getByRole("button", { name: "banc: en cours" }).click()
    await page.getByRole("button", { name: "banc: rétablir" }).click()
    await pause(200)
    verifier(
      "et le retour du direct fait taire l'alerte",
      (await barre.getAttribute("data-etat")) === "discret",
      await barre.innerText(),
    )
  }

  // ── L'ÉCRAN DÉFILE JUSQU'EN BAS, barre de gestes comprise ──
  // Son signalement du 7 sept. 2026 : « dans les tâches de façon générale,
  // l'écran ne défile pas jusqu'en bas, ça bouffe un petit peu sur le reste du
  // texte ». La cause n'est ni une liste bridée en hauteur ni un bouton
  // flottant — il n'y en a aucun — mais le BORD-À-BORD d'Android : à partir
  // d'Android 15, et l'app vise targetSdk 36, la WebView dessine sous la barre
  // de gestes, et c'est au CSS de laisser la place.
  //
  // UN CHROMIUM DE BUREAU N'A PAS DE BARRE DE GESTES : `env(safe-area-inset-*)`
  // y vaut 0, et sans la ligne ci-dessous ce contrôle serait vert quoi qu'il
  // arrive. On pose donc la variable à la main, à la hauteur d'une vraie barre
  // de gestes Android (48 points), exactement comme Capacitor la pose sur
  // l'appareil (SystemBars.injectSafeAreaCSS).
  {
    const BARRE = 48
    await page.evaluate((h) => {
      document.documentElement.style.setProperty("--marge-sure-bas", `${h}px`)
    }, BARRE)
    await pause(200)

    const bas = await page.evaluate(() => getComputedStyle(document.body).paddingBottom)
    verifier(
      "la page réserve la hauteur de la barre de gestes en bas",
      bas === `${BARRE}px`,
      `padding-bottom du body = ${bas} (attendu ${BARRE}px)`,
    )

    // Et le contrôle qui compte : après avoir défilé À FOND, le dernier
    // élément de la page est-il ENTIÈREMENT au-dessus de la barre ?
    const mesure = await page.evaluate(() => {
      const scrollable = document.documentElement.scrollHeight > window.innerHeight
      window.scrollTo(0, document.documentElement.scrollHeight)
      return { scrollable, hauteur: window.innerHeight }
    })
    await pause(300)
    verifier(
      "le banc est bien plus haut que l'écran (sinon rien n'est vérifié)",
      mesure.scrollable,
      "sans défilement possible, le contrôle suivant serait vert pour rien",
    )

    // Le plus BAS de ce qui porte du texte, et pas « le dernier enfant du
    // body » : le dernier enfant est un conteneur de notifications vide, sans
    // boîte, et le contrôle rendait « élément introuvable » — vert par
    // accident un jour où il aurait dû être rouge.
    const plusBas = await page.evaluate(() => {
      let bas = -1
      let quoi = ""
      for (const el of document.body.querySelectorAll("*")) {
        if (el.children.length > 0) continue // seulement les feuilles
        const t = (el.textContent ?? "").trim()
        if (!t) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.bottom > bas) {
          bas = r.bottom
          quoi = t.slice(0, 60)
        }
      }
      return { bas, quoi }
    })
    verifier(
      "le texte le plus bas reste entièrement au-dessus de la barre de gestes",
      plusBas.bas > 0 && plusBas.bas <= mesure.hauteur - BARRE + 1,
      `« ${plusBas.quoi} » descend à ${Math.round(plusBas.bas)} points, la barre commence à ${mesure.hauteur - BARRE}`,
    )

    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--marge-sure-bas")
      window.scrollTo(0, 0)
    })
    await pause(200)
  }

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
