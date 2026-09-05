/**
 * Parcourt le cockpit dans un vrai navigateur, à la taille d'un téléphone.
 *
 *   node scripts/verifier-cockpit-web.mjs
 *
 * Aucune base : le banc (`scripts/harness/cockpit.tsx`) monte le VRAI tableau
 * des chantiers et le VRAI registre des erreurs avec des données factices.
 *
 * Ce que ça prouve, et que `verifier-sections.ts` ne peut pas prouver : ce
 * qu'on voit et ce qu'on peut faire à l'écran. Les sections arrivent
 * repliées avec leurs compteurs (sinon on revient à la liste qu'il fallait
 * faire défiler de haut en bas), une puce filtre, une recherche déplie ce
 * qu'elle trouve, la corbeille DEMANDE avant de supprimer, et rien ne déborde
 * en largeur sur un écran de 390 points.
 */
import { spawn } from "node:child_process"

const PORT = 5201
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
      const r = await fetch(`${BASE}/scripts/harness/cockpit.html`)
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
  // Un repère de visite déjà posé : c'est ainsi que le cockpit se présente
  // quand il revient après une absence.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("jarvis_cockpit_vu", "2026-09-01T00:00:00.000Z")
    } catch {
      /* le banc ne dépend pas du stockage */
    }
  })
  await page.goto(`${BASE}/scripts/harness/cockpit.html`)
  await page.waitForSelector("text=Voix et écoute")

  const visible = (texte) => page.locator(`text=${texte}`).first().isVisible()
  // Le tableau des chantiers, et rien d'autre : un titre de chantier apparaît
  // aussi dans la carte « Qui travaille en ce moment ».
  const tableau = page.getByRole("region", { name: "Chantiers" })
  const dansLeTableau = (texte) => tableau.getByText(texte).first().isVisible()

  // ── Ce qui a bougé pendant son absence ──
  verifier(
    "en revenant, le cockpit dit d'abord ce qui a bougé",
    await visible("Depuis ton dernier passage"),
    "il faudrait comparer de tête avec ce qu'il avait vu la veille",
  )
  verifier(
    "avec le compte de ce qui a été livré, ouvert et écrit",
    (await visible("1 livré")) && (await visible("4 nouveaux")) && (await visible("2 messages")),
    (await page.locator("body").innerText()).slice(0, 200),
  )
  verifier(
    "et le détail, pas seulement des chiffres",
    await visible("Le badge de version, livré"),
  )
  await page.getByRole("button", { name: "Vu" }).first().click()
  await pause(300)
  verifier(
    "« Vu » le referme, et il ne réapparaîtra pas au prochain passage",
    !(await page.getByText("Depuis ton dernier passage").isVisible()),
  )

  // ── La fenêtre d'envoi : ce qui existe déjà, et la section suggérée ──
  const quoiFaire = page.getByLabel("Ce qu'il faut faire")
  await quoiFaire.fill("Le micro se coupe en pleine phrase quand je dicte longtemps")
  await pause(400)
  verifier(
    "écrire une demande déjà en cours le signale avant d'envoyer",
    await visible("Ça ressemble à ce qui existe déjà"),
    "on ouvrirait un doublon sans jamais le savoir",
  )
  verifier(
    "et dit dans quel état est ce qui existe",
    await visible("en cours"),
  )
  verifier(
    "la section est suggérée d'après ce qui est déjà rangé",
    await visible("Section suggérée"),
  )
  verifier(
    "et elle dit sur quels mots elle s'appuie",
    await visible("d'après"),
    "une suggestion qu'on ne peut pas juger est acceptée sans être relue",
  )

  await quoiFaire.fill("Acheter du pain demain matin")
  await pause(400)
  verifier(
    "une demande sans rapport ne déclenche aucun avertissement",
    !(await page.getByText("Ça ressemble à ce qui existe déjà").isVisible()),
    "un avertissement qui se déclenche à tort finit par ne plus être lu",
  )
  await quoiFaire.fill("")
  await pause(250)

  // ── Qui travaille en ce moment ──
  verifier(
    "la carte dit quelle session travaille, et sur quoi",
    (await visible("claude/voix-et-ecoute".replace("claude/", ""))) &&
      (await visible("Le micro se coupe en pleine phrase")),
    "il faudrait déplier chaque section et lire les « Prise par… » un par un",
  )
  verifier(
    "une réservation expirée est signalée à part, pas comptée comme du travail",
    (await visible("1 à libérer")) && (await visible("sans le libérer")),
    "un chantier que personne ne traite continuerait d'afficher « Prise par… »",
  )
  await page.getByRole("button", { name: "Libérer" }).first().click()
  await pause(250)
  verifier("libérer demande confirmation", await visible("Libérer ce chantier ?"))
  await page.getByRole("button", { name: "Libérer", exact: true }).last().click()
  await pause(400)
  verifier(
    "et le chantier redevient libre",
    !(await page.getByText("sans le libérer").isVisible()),
  )

  // ── Le résumé d'abord, le détail à la demande ──
  verifier(
    "les sections sont repliées à l'arrivée",
    !(await dansLeTableau("Le micro se coupe en pleine phrase")),
    "toute la liste s'affiche d'un coup : c'est ce que Raphaël a demandé de changer",
  )
  verifier("le compteur de la section est visible", await visible("2 restants"))
  verifier(
    "une section créée d'avance et vide est quand même listée",
    await visible("Entraînement"),
  )
  verifier("« À classer » recueille le chantier non classé", await visible("À classer"))

  // L'en-tête d'une section porte « — N restants » ; la puce du filtre, elle,
  // ne porte que le nom et son compteur. Viser l'un pour l'autre ferait passer
  // un contrôle qui ne vérifie rien (arrivé en écrivant ce script).
  const enTete = (nom) => page.getByRole("button", { name: new RegExp(`${nom} —`) }).first()
  const puce = (nom) => page.getByRole("button", { name: new RegExp(`^${nom} \\d`) }).first()

  await enTete("Voix et écoute").click()
  await pause(150)
  verifier(
    "appuyer sur la section la déplie",
    await dansLeTableau("Le micro se coupe en pleine phrase"),
  )
  verifier(
    "une question de session restée sans réponse se voit sur la ligne, sans déplier",
    await tableau.getByRole("button", { name: /Réveil vocal en arrière-plan/ }).first().isVisible(),
  )

  // ── Le chantier porte sa conversation ──
  await tableau.getByText("Réveil vocal en arrière-plan").first().click()
  await pause(250)
  verifier(
    "déplier un chantier montre les messages du journal qui le concernent",
    await visible("Tu veux que je coupe le micro après 30 s"),
    "il fallait chercher la question dans le flux général du journal",
  )
  verifier("avec la session qui l'a posée", await visible("voix-et-ecoute"))

  await page.getByLabel("Répondre sur Réveil vocal en arrière-plan").fill("Qu'il attende, oui.")
  await pause(200)
  await page.getByRole("button", { name: "Répondre" }).first().click()
  await pause(400)
  verifier(
    "répondre se fait depuis le chantier, sans passer par le journal",
    await visible("Qu'il attende, oui."),
  )
  // Dans le tableau : le journal de bord, plus haut dans la page, porte le
  // même bouton, et c'est le sien qu'on marquerait.
  await tableau.getByRole("button", { name: "Marquer traité" }).first().click()
  await pause(400)
  verifier(
    "et marquer traité fait tomber le compteur de questions en attente",
    (await tableau.getByRole("button", { name: /Marquer traité/ }).count()) === 0,
  )
  await tableau.getByText("Réveil vocal en arrière-plan").first().click()
  await pause(200)

  await enTete("Voix et écoute").click()
  await pause(150)
  verifier(
    "et un second appui la replie",
    !(await dansLeTableau("Le micro se coupe en pleine phrase")),
  )

  // ── La recherche ──
  await page.getByLabel("Chercher un chantier").fill("widget")
  await pause(200)
  verifier(
    "la recherche déplie ce qu'elle trouve",
    await dansLeTableau("Widget d'écran d'accueil"),
    "il faudrait déplier soi-même le résultat d'une recherche",
  )
  verifier(
    "et écarte le reste",
    !(await dansLeTableau("Réveil vocal en arrière-plan")),
  )
  verifier("le décompte du filtre s'affiche", await visible("1 chantier affiché sur 4"))
  await page.getByRole("button", { name: "Tout afficher" }).first().click()
  await pause(200)
  verifier(
    "« tout afficher » rend la vue repliée",
    !(await dansLeTableau("Widget d'écran d'accueil")),
  )

  // ── Le filtre par section, d'un seul geste ──
  await puce("Le téléphone").click()
  await pause(200)
  verifier(
    "la puce d'une section ne laisse qu'elle",
    (await dansLeTableau("Widget d'écran d'accueil")) &&
      !(await dansLeTableau("Le micro se coupe en pleine phrase")),
  )
  await puce("Le téléphone").click()
  await pause(200)
  verifier(
    "et un second appui sur la puce rend toute la liste",
    await visible("Voix et écoute —"),
  )

  // ── Ce qui attend une décision de Raphaël ──
  verifier(
    "le cockpit dit combien de chantiers attendent une décision de lui",
    await visible("à cadrer"),
    "douze chantiers l'attendaient sans que rien ne le dise",
  )
  await page.getByRole("button", { name: /^à cadrer/ }).first().click()
  await pause(300)
  verifier(
    "et le filtre ne garde que ceux-là",
    (await dansLeTableau("Un chantier dicté trop vite")) &&
      !(await dansLeTableau("Widget d'écran d'accueil")),
  )
  verifier(
    "le marqueur se lit sur la ligne, sans déplier la note",
    (await tableau.getByText("à cadrer").count()) > 0,
  )
  // Un chantier « à cadrer » n'a le plus souvent AUCUN message : c'est
  // justement celui sur lequel Raphaël doit pouvoir écrire sa décision.
  await tableau.getByText("Un chantier dicté trop vite").first().click()
  await pause(250)
  verifier(
    "un chantier qui attend sa décision offre où l'écrire, même sans message",
    await page
      .getByLabel("Répondre sur Un chantier dicté trop vite")
      .isVisible(),
    "il fallait repasser par le journal général et retrouver le bon chantier",
  )
  verifier(
    "et l'étiquette dit pourquoi il est en attente",
    await visible("il attend une décision de toi"),
  )
  await page
    .getByLabel("Répondre sur Un chantier dicté trop vite")
    .fill("Vas-y, budget accepté.")
  await pause(200)
  await tableau.getByRole("button", { name: "Envoyer à la session" }).first().click()
  await pause(400)
  verifier(
    "sa décision est écrite sur le chantier",
    await visible("Vas-y, budget accepté."),
  )
  await tableau.getByText("Un chantier dicté trop vite").first().click()
  await pause(200)
  await page.getByRole("button", { name: /^à cadrer/ }).first().click()
  await pause(300)

  // ── La suppression demande avant ──
  await enTete("Voix et écoute").click()
  await pause(150)
  await page.getByRole("button", { name: "Supprimer" }).first().click()
  await pause(250)
  verifier(
    "la corbeille demande confirmation au lieu de supprimer",
    await visible("Supprimer ce chantier ?"),
    "un appui de travers supprimerait un chantier sans retour possible",
  )
  await page.getByRole("button", { name: "Annuler" }).first().click()
  await pause(250)
  verifier(
    "annuler ne supprime rien",
    await dansLeTableau("Le micro se coupe en pleine phrase"),
  )

  // Et confirmer supprime vraiment : une confirmation qui n'aboutit pas est
  // pire qu'aucune, on croirait avoir supprimé.
  await page.getByRole("button", { name: "Supprimer" }).first().click()
  await pause(250)
  await page.getByRole("button", { name: "Supprimer", exact: true }).last().click()
  await pause(400)
  verifier(
    "confirmer supprime pour de bon",
    !(await dansLeTableau("Le micro se coupe en pleine phrase")),
  )

  // ── Gérer les sections ──
  await page.getByRole("button", { name: "Sections" }).first().click()
  await pause(300)
  verifier("la fenêtre des sections s'ouvre", await visible("Nouvelle section"))
  verifier(
    "elle propose de ranger les thèmes qui n'ont pas de section",
    await page.getByRole("button", { name: /Monter/ }).first().isVisible(),
  )
  await page.keyboard.press("Escape")
  await pause(250)

  // ── Le registre des erreurs ──
  verifier("le registre annonce ce qui est ouvert", await visible("2 ouvertes"))
  await page.getByRole("button", { name: /Erreurs de Jarvis/ }).first().click()
  await pause(200)
  verifier(
    "il se déplie sur les erreurs",
    await page.getByText("Il a créé une tâche au lieu d'un chantier").isVisible(),
  )
  verifier("les erreurs sont comptées par type", await visible("Compréhension"))
  verifier("une erreur répétée montre son compteur", await visible("×3"))

  // ── Choisir plusieurs chantiers et les traiter ensemble ──
  await page.getByRole("button", { name: "Choisir" }).first().click()
  await pause(250)
  verifier("le mode « choisir » s'annonce", await visible("Touche les chantiers à traiter ensemble"))
  verifier(
    "et déplie tout : on ne coche pas ce qu'on ne voit pas",
    await dansLeTableau("Widget d'écran d'accueil"),
  )

  await page.getByRole("button", { name: "Tout ce qui est affiché" }).first().click()
  await pause(250)
  verifier(
    "« tout ce qui est affiché » coche ce qui est visible, pas la base entière",
    await visible("3 chantiers choisis"),
    "le nombre coché ne correspond pas aux chantiers affichés",
  )

  await page.getByRole("checkbox", { name: /Widget d'écran d'accueil/ }).click()
  await pause(200)
  verifier("décocher un chantier se voit tout de suite", await visible("2 chantiers choisis"))

  verifier(
    "la barre d'actions dit sur combien de chantiers elle agit",
    await visible("2 chantiers — les traiter ensemble"),
  )

  await page.getByRole("button", { name: "→ Le téléphone" }).first().click()
  await pause(500)
  verifier(
    "ranger un lot dans une section marche d'un geste",
    await visible("2 chantiers rangés dans « Le téléphone »"),
  )
  // Le bouton du bandeau, pas celui d'une fenêtre de confirmation : viser
  // « Annuler » au hasard dans la page attrape l'un pour l'autre.
  const annulerDuBandeau = page.locator("[data-sonner-toast] button", { hasText: "Annuler" })
  verifier("et propose de l'annuler", await annulerDuBandeau.first().isVisible())

  await annulerDuBandeau.first().click()
  await pause(700)
  // Les en-têtes portent le compte : c'est ce qu'on lit pour savoir où sont
  // les chantiers, sans avoir à déplier (et sans dépendre de ce qui était
  // déplié avant, ce qui rendrait ce contrôle faux une fois sur deux).
  verifier(
    "annuler remet les chantiers dans leur section d'origine",
    (await visible("Voix et écoute — 1 restant")) && (await visible("Le téléphone — 1 restant")),
    "les chantiers sont restés dans « Le téléphone »",
  )
  await page.getByRole("button", { name: "Terminer" }).first().click()
  await pause(250)

  // ── Changer statut et priorité sans ouvrir de fenêtre ──
  // La section « À classer » n'a jamais été dépliée jusqu'ici : on part donc
  // d'un état connu, sans dépendre des appuis précédents.
  await enTete("À classer").click()
  await pause(250)
  await tableau.getByText("Un chantier dicté trop vite").first().click()
  await pause(250)
  verifier(
    "la ligne dépliée propose statut, priorité et section",
    (await page.getByRole("button", { name: "Haute", exact: true }).count()) > 0,
    "il faut encore ouvrir le formulaire pour changer une priorité",
  )
  await page.getByRole("button", { name: "Haute", exact: true }).first().click()
  await pause(400)
  verifier(
    "changer la priorité depuis la ligne, sans formulaire ni enregistrement",
    await page.getByRole("button", { name: "Haute", exact: true }).first().getAttribute("aria-pressed") === "true",
  )

  // ── Ce qui a avancé, et l'historique daté ──
  verifier(
    "le résumé dit aussi ce qui a été livré cette semaine",
    await visible("1 livré"),
    "le cockpit ne compte que ce qui reste, jamais ce qui a avancé",
  )
  await page.getByRole("button", { name: /Archivées/ }).first().click()
  await pause(300)
  verifier(
    "les archivées s'ouvrent, rangées par section",
    await dansLeTableau("Le badge de version, livré"),
  )
  verifier(
    "et chaque archive dit quand elle a été livrée",
    await visible("Archivé le"),
    "un historique sans dates ne dit pas ce qui a bougé cette semaine",
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
  // ─────────── Le cockpit à sa vraie taille : 83 chantiers, 9 sections ───────────
  // Tout ce qui rend une liste lisible se vérifie sur quatre chantiers et se
  // casse sur quatre-vingts.
  const gros = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  gros.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE (volume):", e.message)
  })
  await gros.goto(`${BASE}/scripts/harness/cockpit.html?volume=1`)
  await gros.waitForSelector("text=Voix et écoute")
  await pause(500)

  const tableauGros = gros.getByRole("region", { name: "Chantiers" })

  verifier(
    "à 83 chantiers, rien n'est déplié : on voit le résumé, pas la liste",
    (await tableauGros.getByText(/^Chantier numéro/).count()) === 0,
    "la liste s'ouvre en entier, ce qui fait une vingtaine d'écrans à faire défiler",
  )

  const debordementGros = await gros.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  verifier(
    "et rien ne déborde en largeur malgré neuf sections et six marqueurs",
    debordementGros <= 0,
    `${debordementGros} points de trop`,
  )

  // La barre de filtres est en haut, donc elle mange l'écran avant la liste :
  // si elle prend plus de la moitié d'un téléphone, on ne voit plus rien.
  const hauteurFiltres = await gros.evaluate(() => {
    const region = document.querySelector('[aria-label="Chantiers"]')
    const carte = region?.firstElementChild
    return carte ? Math.round(carte.getBoundingClientRect().height) : -1
  })
  verifier(
    "la barre de filtres tient dans la moitié haute de l'écran",
    hauteurFiltres > 0 && hauteurFiltres < 430,
    `elle fait ${hauteurFiltres} points de haut sur 844 : le tableau commencerait sous la ligne de flottaison`,
  )

  // Chercher dans 83 chantiers doit rendre la main tout de suite.
  const avant = Date.now()
  await gros.getByLabel("Chercher un chantier").fill("numéro 42")
  await gros.waitForFunction(
    () => !!document.body.innerText.match(/1 chantier affiché/),
    null,
    { timeout: 3000 },
  )
  const delai = Date.now() - avant
  verifier(
    "la recherche dans 83 chantiers répond en moins d'une seconde",
    delai < 1000,
    `${delai} ms`,
  )
  await gros.getByRole("button", { name: "Tout afficher" }).first().click()
  await pause(300)

  // La sélection multiple à cette échelle : la barre d'actions doit rester
  // atteignable au pouce, pas repoussée par la liste.
  await gros.getByRole("button", { name: "Choisir" }).first().click()
  await pause(400)
  await gros.getByRole("button", { name: "Tout ce qui est affiché" }).first().click()
  await pause(500)
  verifier(
    // 83 chantiers dont un quart archivés : 63 actifs.
    "« tout ce qui est affiché » coche les 63 chantiers actifs, et pas les archivés",
    await gros.getByText("63 chantiers choisis").isVisible(),
    (await gros.locator("body").innerText()).match(/\d+ chantiers? choisis?/)?.[0] ?? "aucun compte",
  )
  const barreVisible = await gros.evaluate(() => {
    const bandeau = [...document.querySelectorAll("p")].find((p) =>
      /les traiter ensemble/.test(p.textContent ?? ""),
    )
    if (!bandeau) return null
    const r = bandeau.getBoundingClientRect()
    return { haut: Math.round(r.top), dansLEcran: r.top >= 0 && r.top <= window.innerHeight }
  })
  verifier(
    "et la barre d'actions reste à l'écran, collée en bas",
    barreVisible?.dansLEcran === true,
    `bandeau à ${barreVisible?.haut} points — hors de l'écran, il faudrait faire défiler 60 chantiers pour l'atteindre`,
  )
  // ── Le cockpit un jour ordinaire : rien qui appelle une action ──
  // C'est l'état dans lequel il l'ouvre le plus souvent. Le résumé par
  // section — ce qu'il a demandé pour ne plus avoir à faire défiler — doit
  // s'y voir sans faire défiler, justement.
  const calme = await navigateur.newPage({ viewport: { width: 390, height: 844 } })
  calme.on("pageerror", (e) => {
    echecs++
    console.log("ERREUR DE PAGE (calme):", e.message)
  })
  await calme.goto(`${BASE}/scripts/harness/cockpit.html?volume=1&calme=1`)
  await calme.waitForSelector("text=Voix et écoute")
  await pause(500)

  const hautDuResume = await calme.evaluate(() => {
    const region = document.querySelector('[aria-label="Chantiers"]')
    return region ? Math.round(region.getBoundingClientRect().top) : -1
  })
  verifier(
    "un jour ordinaire, le résumé des chantiers s'affiche dans le premier écran",
    hautDuResume > 0 && hautDuResume < 844,
    `il commence à ${hautDuResume} points : il faudrait faire défiler avant de voir quoi que ce soit du tableau`,
  )
  await calme.close()

  await gros.close()

} finally {
  if (navigateur) await navigateur.close()
  vite.kill()
}

console.log(`\n${echecs === 0 ? "Tout est vert." : `${echecs} échec(s).`}`)
process.exit(echecs === 0 ? 0 : 1)
